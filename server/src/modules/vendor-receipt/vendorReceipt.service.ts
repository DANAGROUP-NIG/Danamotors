/**
 * Vendor receipts (MRN source VENDOR).
 *
 *   vendor invoice ──► vendor receipt (MRN) ──► branch stock, cost, and (branch-bought records) price
 *                                  └──────────► return to vendor (MRN return, vendorReturn.service.ts)
 *
 * Branches buy local, used and repaired parts from local vendors (legacy: 600–850 MRNs a year per
 * branch); CPD buys some parts directly from non-Mobis vendors, sometimes in foreign currency. Each MRN
 * carries a tax form chosen per document (P, Y, Z, X; Z adds VAT), the invoice's conversion rate and,
 * where the branch rounds MRNs (legacy control1.roundmrn), a round-off to the naira. Posting adds the
 * stock; for branch-bought records (L/U/R) it also sets the dealer rate to the cost and recalculates
 * retail. Mobis records keep Finance's price. Lines can be corrected after posting, with a reason.
 */
import { MrnSource, PartStatus, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { config } from "../../config";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { recordPartChange } from "../inventory/partHistory";
import { sourceLabel } from "../inventory/partSource";
import { partyName } from "../parts-report/partsReport.common";
import { nextDocumentNumber } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import {
  MRN_TAX_FORM_CODES,
  MrnTaxForm,
  VendorReceiptLineInput,
  checkReceiptLines,
  defaultMrnTaxForm,
  diffReceiptLines,
  isMobisVendor,
  mrnLineVat,
  receiptTotals,
  repricesOnReceipt,
  retailFromMultiplier,
} from "./vendorReceipt.logic";

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };
const VAT_RATE = config.JOB_BILL_VAT_RATE;
type Tx = Prisma.TransactionClient;

export interface CreateVendorReceiptInput {
  receivingBranchId: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  receiptDate?: Date;
  /** P, Y, Z or X; defaults from the vendor type. */
  taxForm?: MrnTaxForm;
  /** Invoice currency to naira; 1 (the default) for a naira invoice. */
  conversionRate?: number;
  /** Needed to receive the same vendor invoice a second time (e.g. delivered in two parts). */
  duplicateReason?: string;
  remarks?: string;
  lines: VendorReceiptLineInput[];
}

export interface EditVendorReceiptInput {
  reason: string;
  invoiceNumber?: string;
  invoiceDate?: Date;
  taxForm?: MrnTaxForm;
  conversionRate?: number;
  remarks?: string;
  /** The corrected full set of lines; a line left out is removed. */
  lines?: VendorReceiptLineInput[];
}

const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;
const branchSelect = { select: { id: true, name: true, code: true } } as const;
const vendorSelect = { select: { id: true, code: true, companyName: true, firstName: true, lastName: true, vendorType: true } } as const;
const partSelect = {
  select: {
    id: true,
    partNumber: true,
    name: true,
    uom: true,
    partFlag: true,
    taxable: true,
    unitPrice: true,
    retailRate: true,
    sourceOfPart: { select: { id: true, partNumber: true } },
  },
} as const;

/** Whether the branch (or, for a location, its parent branch) rounds MRN totals to the naira. */
export async function roundsMrnTotal(tx: Tx | typeof prisma, branchId: string) {
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId }, select: { roundMrnTotal: true, parentBranch: { select: { roundMrnTotal: true } } } });
  return branch.roundMrnTotal || !!branch.parentBranch?.roundMrnTotal;
}

function checkTaxForm(taxForm: string): MrnTaxForm {
  if (!(MRN_TAX_FORM_CODES as readonly string[]).includes(taxForm)) throw new BadRequestError(`Tax form must be one of ${MRN_TAX_FORM_CODES.join(", ")}`);
  return taxForm as MrnTaxForm;
}

/** Sets a branch-bought record's dealer rate to the received cost and recalculates its retail. */
async function repricePart(tx: Tx, partId: string, unitCost: number, actorId: string) {
  const before = await tx.sparePart.findUniqueOrThrow({ where: { id: partId }, include: { priceCategory: true } });
  if (!repricesOnReceipt(before.partFlag)) return;
  const retailRate = retailFromMultiplier(unitCost, before.priceCategory?.markupMultiplier, before.retailRate);
  if (before.unitPrice === unitCost && before.retailRate === retailRate) return;
  const after = await tx.sparePart.update({ where: { id: partId }, data: { unitPrice: unitCost, retailRate } });
  await recordPartChange(tx, before, after, actorId);
}

export class VendorReceiptService {
  /** Vendors are Customer rows of type VENDOR; the vendor type gives the default tax form. */
  async searchVendors(search?: string) {
    const term = search?.trim();
    const vendors = await prisma.customer.findMany({
      where: {
        type: "VENDOR",
        mergedIntoId: null,
        ...(term && {
          OR: [
            { companyName: { contains: term, mode: "insensitive" } },
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
            { code: { contains: term, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [{ companyName: "asc" }, { firstName: "asc" }],
      take: 20,
      ...vendorSelect,
    });
    return vendors.map((v) => ({ ...v, name: partyName(v), defaultTaxForm: defaultMrnTaxForm(v.vendorType) }));
  }

  /**
   * Part records that can be received, with stock at the branch. Any active record qualifies
   * (a branch may receive a part it has never stocked); source records show their main part.
   */
  async searchParts(branchId: string, search: string) {
    const parts = await prisma.sparePart.findMany({
      where: {
        partStatus: PartStatus.ACTIVE,
        OR: [
          { partNumber: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
          { sourceOfPart: { partNumber: { contains: search, mode: "insensitive" } } },
        ],
      },
      orderBy: { partNumber: "asc" },
      take: 20,
      select: { ...partSelect.select, inventoryStocks: { where: { branchId }, select: { quantity: true, rackLocation: true } } },
    });
    return parts.map(({ inventoryStocks, ...part }) => ({
      ...part,
      sourceLabel: sourceLabel(part.partFlag),
      repriced: repricesOnReceipt(part.partFlag),
      stock: inventoryStocks[0]?.quantity ?? 0,
      bin: inventoryStocks[0]?.rackLocation ?? null,
    }));
  }

  /** The branch's MRN settings for the form: whether totals round to the naira. */
  async branchSettings(branchId: string) {
    return { roundMrnTotal: await roundsMrnTotal(prisma, branchId) };
  }

  /** Refuses Mobis (it comes through the MIT) and anything that is not a vendor. */
  private async vendorFor(vendorId: string) {
    const vendor = await prisma.customer.findUnique({ where: { id: vendorId }, select: { ...vendorSelect.select, type: true } });
    if (!vendor || vendor.type !== "VENDOR") throw new BadRequestError("Choose a vendor (a party of type VENDOR)");
    const name = partyName(vendor);
    if (isMobisVendor(name)) throw new BadRequestError("Mobis invoices are received through Mobis receipts (MIT upload), not as a vendor receipt");
    return { ...vendor, name };
  }

  private async activeParts(partIds: string[]) {
    const parts = await prisma.sparePart.findMany({ where: { id: { in: partIds } }, select: { id: true, partNumber: true, partStatus: true, taxable: true } });
    for (const id of partIds) {
      const part = parts.find((p) => p.id === id);
      if (!part) throw new NotFoundError(`Part ${id} not found`);
      if (part.partStatus !== PartStatus.ACTIVE) throw new BadRequestError(`Part ${part.partNumber} is blocked and cannot be received`);
    }
    return new Map(parts.map((p) => [p.id, p]));
  }

  async createReceipt(input: CreateVendorReceiptInput, actorId: string) {
    const invoiceNumber = input.invoiceNumber.trim();
    if (!invoiceNumber) throw new BadRequestError("The vendor invoice number is required");
    const conversionRate = input.conversionRate ?? 1;
    const checked = checkReceiptLines(input.lines, conversionRate);

    const branch = await prisma.branch.findUnique({ where: { id: input.receivingBranchId } });
    if (!branch) throw new NotFoundError("Receiving branch not found");
    if (!branch.isActive) throw new BadRequestError(`${branch.name} is not active`);
    const vendor = await this.vendorFor(input.vendorId);
    const taxForm = checkTaxForm(input.taxForm ?? defaultMrnTaxForm(vendor.vendorType));

    // Legacy never received a vendor invoice twice since 2024; a second delivery on the same invoice needs a reason.
    const duplicateReason = input.duplicateReason?.trim() || null;
    const duplicate = await prisma.materialReceiptNote.findFirst({
      where: { source: MrnSource.VENDOR, vendorId: vendor.id, invoiceNumber: { equals: invoiceNumber, mode: "insensitive" } },
      select: { mrnNumber: true },
    });
    if (duplicate && !duplicateReason) {
      throw new ConflictError(`Invoice ${invoiceNumber} from ${vendor.name} was already received on MRN ${duplicate.mrnNumber}. Give a reason to receive it again.`);
    }

    const parts = await this.activeParts(checked.map((l) => l.partId));
    const lines = checked.map((l) => ({ ...l, ...mrnLineVat(taxForm, parts.get(l.partId)!.taxable, l.amount, VAT_RATE) }));
    const totals = receiptTotals(lines, await roundsMrnTotal(prisma, branch.id));

    const mrnId = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const mrnNumber = await nextDocumentNumber(tx, DOC_TYPES.MRN, now);
      const mrn = await tx.materialReceiptNote.create({
        data: {
          mrnNumber,
          source: MrnSource.VENDOR,
          receivingBranchId: branch.id,
          vendor: vendor.name,
          vendorId: vendor.id,
          invoiceNumber,
          invoiceDate: input.invoiceDate,
          taxForm,
          conversionRate,
          receiptDate: input.receiptDate ?? now,
          remarks: input.remarks,
          duplicateReason: duplicate ? duplicateReason : null,
          ...totals,
          receivedById: actorId,
          lines: {
            create: lines.map((l) => ({
              partId: l.partId,
              receivedQuantity: l.quantity,
              unitPrice: l.unitPrice,
              unitCost: l.unitCost,
              amount: l.amount,
              vatPercent: l.vatPercent,
              taxAmount: l.taxAmount,
              remarks: l.remarks,
            })),
          },
        },
      });

      for (const line of lines) {
        await tx.inventoryStock.upsert({
          where: { branchId_partId: { branchId: branch.id, partId: line.partId } },
          update: { quantity: { increment: line.quantity } },
          create: { branchId: branch.id, partId: line.partId, quantity: line.quantity },
        });
        await tx.stockTransaction.create({
          data: {
            branchId: branch.id,
            partId: line.partId,
            type: "RECEIVED",
            quantity: line.quantity,
            referenceId: mrn.id,
            notes: `MRN ${mrnNumber} for ${vendor.name} invoice ${invoiceNumber}`,
            recordedById: actorId,
          },
        });
        await repricePart(tx, line.partId, line.unitCost, actorId);
      }
      return mrn.id;
    }, TX_OPTIONS);

    return this.getReceipt(mrnId);
  }

  /**
   * Corrects a posted vendor MRN (legacy users changed or removed MRN lines after saving: Abuja on about
   * 8% of MRNs). Stock moves by the difference; units can only come off while they are still in stock,
   * and never below what was returned to the vendor. Every change is logged with the reason.
   */
  async editReceipt(id: string, input: EditVendorReceiptInput, actorId: string) {
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestError("Give a reason for the change");

    await prisma.$transaction(async (tx) => {
      // Lock the MRN row so two edits (or an edit and a return) cannot interleave.
      await tx.$queryRaw`SELECT id FROM "MaterialReceiptNote" WHERE id = ${id} FOR UPDATE`;
      const mrn = await tx.materialReceiptNote.findUnique({
        where: { id },
        include: { lines: { include: { part: { select: { partNumber: true, taxable: true } } } } },
      });
      if (!mrn || mrn.source !== MrnSource.VENDOR) throw new NotFoundError("Vendor receipt not found");

      const edits: Omit<Prisma.MaterialReceiptNoteEditCreateManyInput, "mrnId">[] = [];
      const log = (field: string, oldValue: unknown, newValue: unknown, partNumber?: string) =>
        edits.push({ field, partNumber, oldValue: oldValue == null ? null : String(oldValue), newValue: newValue == null ? null : String(newValue), reason, editedById: actorId });

      const invoiceNumber = input.invoiceNumber?.trim() || mrn.invoiceNumber!;
      if (invoiceNumber !== mrn.invoiceNumber) log("invoice number", mrn.invoiceNumber, invoiceNumber);
      const invoiceDate = input.invoiceDate ?? mrn.invoiceDate;
      if (invoiceDate?.getTime() !== mrn.invoiceDate?.getTime()) log("invoice date", mrn.invoiceDate?.toISOString().slice(0, 10), invoiceDate?.toISOString().slice(0, 10));
      const taxForm = checkTaxForm(input.taxForm ?? mrn.taxForm ?? "Y");
      if (taxForm !== mrn.taxForm) log("tax form", mrn.taxForm, taxForm);
      const conversionRate = input.conversionRate ?? mrn.conversionRate;
      if (!(conversionRate > 0)) throw new BadRequestError("The conversion rate must be above zero");
      if (conversionRate !== mrn.conversionRate) log("conversion rate", mrn.conversionRate, conversionRate);
      const remarks = input.remarks !== undefined ? input.remarks.trim() || null : mrn.remarks;
      if (remarks !== mrn.remarks) log("remarks", mrn.remarks, remarks);

      // Lines: the corrected set, or the current lines re-costed at a new rate.
      const wanted = input.lines ?? mrn.lines.map((l) => ({ partId: l.partId, quantity: l.receivedQuantity, unitPrice: l.unitPrice, remarks: l.remarks ?? undefined }));
      const checked = checkReceiptLines(wanted, conversionRate);
      const changes = diffReceiptLines(
        mrn.lines.map((l) => ({ id: l.id, partId: l.partId, partNumber: l.part.partNumber, receivedQuantity: l.receivedQuantity, unitPrice: l.unitPrice, returnedQuantity: l.returnedQuantity })),
        checked,
      );
      const parts = await this.activeParts(changes.filter((c) => !c.lineId).map((c) => c.partId));
      if (!edits.length && !changes.length) throw new BadRequestError("Nothing to change");

      for (const change of [...changes].sort((a, b) => a.partId.localeCompare(b.partId))) {
        const partNumber = change.partNumber ?? (await tx.sparePart.findUniqueOrThrow({ where: { id: change.partId }, select: { partNumber: true } })).partNumber;
        if (change.delta < 0) {
          // Units come off only while still on the shelf: what was sold or issued cannot be un-received.
          const taken = await tx.inventoryStock.updateMany({
            where: { branchId: mrn.receivingBranchId, partId: change.partId, quantity: { gte: -change.delta } },
            data: { quantity: { decrement: -change.delta } },
          });
          if (taken.count !== 1) throw new ConflictError(`${partNumber}: fewer than ${-change.delta} are left in stock; the rest has been used and cannot come off this MRN`);
        } else if (change.delta > 0) {
          await tx.inventoryStock.upsert({
            where: { branchId_partId: { branchId: mrn.receivingBranchId, partId: change.partId } },
            update: { quantity: { increment: change.delta } },
            create: { branchId: mrn.receivingBranchId, partId: change.partId, quantity: change.delta },
          });
        }
        if (change.delta !== 0) {
          await tx.stockTransaction.create({
            data: {
              branchId: mrn.receivingBranchId,
              partId: change.partId,
              type: "RECEIVED",
              quantity: change.delta,
              referenceId: mrn.id,
              notes: `MRN ${mrn.mrnNumber} corrected: ${partNumber} ${change.oldQuantity} → ${change.newQuantity} (${reason})`,
              recordedById: actorId,
            },
          });
        }
        if (change.oldQuantity !== change.newQuantity) log("quantity", change.oldQuantity, change.newQuantity, partNumber);
        if (change.newPrice != null && change.oldPrice != null && change.newPrice !== change.oldPrice) log("price", change.oldPrice, change.newPrice, partNumber);
      }

      // Rewrite the lines under the (possibly new) tax form and rate.
      const taxable = new Map([...mrn.lines.map((l) => [l.partId, l.part.taxable] as const), ...[...parts.values()].map((p) => [p.id, p.taxable] as const)]);
      const lines = checked.map((l) => ({ ...l, ...mrnLineVat(taxForm, taxable.get(l.partId) ?? true, l.amount, VAT_RATE) }));
      for (const line of mrn.lines) {
        const next = lines.find((l) => l.partId === line.partId);
        if (!next) await tx.materialReceiptLine.delete({ where: { id: line.id } });
        else
          await tx.materialReceiptLine.update({
            where: { id: line.id },
            data: { receivedQuantity: next.quantity, unitPrice: next.unitPrice, unitCost: next.unitCost, amount: next.amount, vatPercent: next.vatPercent, taxAmount: next.taxAmount, remarks: next.remarks ?? line.remarks },
          });
      }
      const added = lines.filter((l) => !mrn.lines.some((m) => m.partId === l.partId));
      if (added.length) {
        await tx.materialReceiptLine.createMany({
          data: added.map((l) => ({ mrnId: mrn.id, partId: l.partId, receivedQuantity: l.quantity, unitPrice: l.unitPrice, unitCost: l.unitCost, amount: l.amount, vatPercent: l.vatPercent, taxAmount: l.taxAmount, remarks: l.remarks })),
        });
      }
      for (const line of lines) {
        const old = mrn.lines.find((m) => m.partId === line.partId);
        if (!old || old.unitCost !== line.unitCost) await repricePart(tx, line.partId, line.unitCost, actorId);
      }

      const totals = receiptTotals(lines, await roundsMrnTotal(tx, mrn.receivingBranchId));
      await tx.materialReceiptNote.update({
        where: { id: mrn.id },
        data: { invoiceNumber, invoiceDate, taxForm, conversionRate, remarks, ...totals, editedAt: new Date() },
      });
      await tx.materialReceiptNoteEdit.createMany({ data: edits.map((e) => ({ ...e, mrnId: mrn.id })) });
    }, TX_OPTIONS);

    return this.getReceipt(id);
  }

  async listReceipts(filters: { branchId?: string; search?: string }) {
    const search = filters.search?.trim();
    return prisma.materialReceiptNote.findMany({
      where: {
        source: MrnSource.VENDOR,
        ...(filters.branchId && { receivingBranchId: filters.branchId }),
        ...(search && {
          OR: [
            { mrnNumber: { contains: search } },
            { invoiceNumber: { contains: search, mode: "insensitive" } },
            { vendor: { contains: search, mode: "insensitive" } },
            { lines: { some: { part: { partNumber: { contains: search, mode: "insensitive" } } } } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      include: { receivingBranch: branchSelect, receivedBy: userSelect, _count: { select: { lines: true, returns: true } } },
      take: 300,
    });
  }

  /** The receipt with each line's part, source and bin at the receiving branch (for labels), its edits and returns. */
  async getReceipt(id: string) {
    const mrn = await prisma.materialReceiptNote.findUnique({
      where: { id },
      include: {
        receivingBranch: branchSelect,
        receivedBy: userSelect,
        vendorParty: vendorSelect,
        lines: { include: { part: partSelect }, orderBy: { part: { partNumber: "asc" } } },
        edits: { include: { editedBy: userSelect }, orderBy: { createdAt: "asc" } },
        returns: { select: { id: true, returnNumber: true, returnDate: true, totalQuantity: true, netAmount: true, fullReturn: true }, orderBy: { returnDate: "asc" } },
      },
    });
    if (!mrn || mrn.source !== MrnSource.VENDOR) throw new NotFoundError("Vendor receipt not found");
    const stocks = await prisma.inventoryStock.findMany({
      where: { branchId: mrn.receivingBranchId, partId: { in: mrn.lines.map((l) => l.partId) } },
      select: { partId: true, rackLocation: true, quantity: true },
    });
    return {
      ...mrn,
      lines: mrn.lines.map((line) => {
        const stock = stocks.find((s) => s.partId === line.partId);
        return { ...line, sourceLabel: sourceLabel(line.part.partFlag), bin: stock?.rackLocation ?? null, stock: stock?.quantity ?? 0 };
      }),
    };
  }
}

export default VendorReceiptService;
