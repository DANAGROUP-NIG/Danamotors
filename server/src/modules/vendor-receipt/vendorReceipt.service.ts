/**
 * Vendor receipts (MRN source VENDOR).
 *
 *   vendor invoice ──► vendor receipt (MRN) ──► branch stock, record cost and retail
 *
 * Branches buy local, used and repaired parts from local vendors (legacy: 600–850 MRNs a year
 * per branch); CPD buys some parts directly from non-Mobis vendors. Each line is a Part Master
 * record, usually a source record (e.g. 54651-U). Posting a receipt adds the stock, sets the
 * record's dealer rate to the received cost and recalculates its retail rate from its price
 * category, the same way Mobis parts are priced. Discounts, handling, tax and other charges were
 * zero on every legacy MRN since 2024, so a receipt has none. Returns to vendors are not built yet.
 */
import { MrnSource, PartStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { recordPartChange } from "../inventory/partHistory";
import { sourceLabel } from "../inventory/partSource";
import { partyName } from "../parts-report/partsReport.common";
import { MRN_TAX_FORM } from "../mobis-purchase/mobisPurchase.logic";
import { nextDocumentNumber } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import { VendorReceiptLineInput, checkReceiptLines, isMobisVendor, receiptTotals, retailFromMultiplier } from "./vendorReceipt.logic";

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

export interface CreateVendorReceiptInput {
  receivingBranchId: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  receiptDate?: Date;
  remarks?: string;
  lines: VendorReceiptLineInput[];
}

const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;
const branchSelect = { select: { id: true, name: true, code: true } } as const;
const vendorSelect = { select: { id: true, code: true, companyName: true, firstName: true, lastName: true } } as const;
const partSelect = {
  select: {
    id: true,
    partNumber: true,
    name: true,
    uom: true,
    partFlag: true,
    binLocation: true,
    unitPrice: true,
    retailRate: true,
    sourceOfPart: { select: { id: true, partNumber: true } },
  },
} as const;

export class VendorReceiptService {
  /** Vendors are Customer rows of type VENDOR. */
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
    return vendors.map((v) => ({ ...v, name: partyName(v) }));
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
      stock: inventoryStocks[0]?.quantity ?? 0,
      bin: inventoryStocks[0]?.rackLocation ?? part.binLocation,
    }));
  }

  async createReceipt(input: CreateVendorReceiptInput, actorId: string) {
    const invoiceNumber = input.invoiceNumber.trim();
    if (!invoiceNumber) throw new BadRequestError("The vendor invoice number is required");
    const lines = checkReceiptLines(input.lines);

    const branch = await prisma.branch.findUnique({ where: { id: input.receivingBranchId } });
    if (!branch) throw new NotFoundError("Receiving branch not found");
    if (!branch.isActive) throw new BadRequestError(`${branch.name} is not active`);
    const vendor = await prisma.customer.findUnique({ where: { id: input.vendorId }, select: { ...vendorSelect.select, type: true } });
    if (!vendor || vendor.type !== "VENDOR") throw new BadRequestError("Choose a vendor (a party of type VENDOR)");
    const vendorName = partyName(vendor);
    if (isMobisVendor(vendorName))
      throw new BadRequestError("Mobis invoices are received through Mobis receipts (MIT upload), not as a vendor receipt");

    const duplicate = await prisma.materialReceiptNote.findFirst({
      where: { source: MrnSource.VENDOR, vendorId: vendor.id, invoiceNumber: { equals: invoiceNumber, mode: "insensitive" } },
      select: { mrnNumber: true },
    });
    if (duplicate) throw new ConflictError(`Invoice ${invoiceNumber} from ${vendorName} was already received on MRN ${duplicate.mrnNumber}`);

    const parts = await prisma.sparePart.findMany({ where: { id: { in: lines.map((l) => l.partId) } } });
    for (const line of lines) {
      const part = parts.find((p) => p.id === line.partId);
      if (!part) throw new NotFoundError(`Part ${line.partId} not found`);
      if (part.partStatus !== PartStatus.ACTIVE) throw new BadRequestError(`Part ${part.partNumber} is blocked and cannot be received`);
    }
    const totals = receiptTotals(lines);

    const mrnId = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const mrnNumber = await nextDocumentNumber(tx, DOC_TYPES.MRN, now);
      const mrn = await tx.materialReceiptNote.create({
        data: {
          mrnNumber,
          source: MrnSource.VENDOR,
          receivingBranchId: branch.id,
          vendor: vendorName,
          vendorId: vendor.id,
          invoiceNumber,
          invoiceDate: input.invoiceDate,
          taxForm: MRN_TAX_FORM,
          receiptDate: input.receiptDate ?? now,
          remarks: input.remarks,
          totalReceived: totals.totalReceived,
          totalValue: totals.totalValue,
          receivedById: actorId,
          lines: {
            create: lines.map((l) => ({
              partId: l.partId,
              receivedQuantity: l.quantity,
              unitPrice: l.unitCost,
              unitCost: l.unitCost,
              amount: l.amount,
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
            notes: `MRN ${mrnNumber} for ${vendorName} invoice ${invoiceNumber}`,
            recordedById: actorId,
          },
        });
        // The received cost becomes the record's dealer rate; retail follows its price category.
        const before = await tx.sparePart.findUniqueOrThrow({ where: { id: line.partId }, include: { priceCategory: true } });
        const retailRate = retailFromMultiplier(line.unitCost, before.priceCategory?.markupMultiplier, before.retailRate);
        if (before.unitPrice !== line.unitCost || before.retailRate !== retailRate) {
          const after = await tx.sparePart.update({ where: { id: line.partId }, data: { unitPrice: line.unitCost, retailRate } });
          await recordPartChange(tx, before, after, actorId);
        }
      }
      return mrn.id;
    }, TX_OPTIONS);

    return this.getReceipt(mrnId);
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
      include: { receivingBranch: branchSelect, receivedBy: userSelect, _count: { select: { lines: true } } },
      take: 300,
    });
  }

  /** The receipt with each line's part, source and bin at the receiving branch (for labels). */
  async getReceipt(id: string) {
    const mrn = await prisma.materialReceiptNote.findUnique({
      where: { id },
      include: {
        receivingBranch: branchSelect,
        receivedBy: userSelect,
        vendorParty: vendorSelect,
        lines: { include: { part: partSelect }, orderBy: { part: { partNumber: "asc" } } },
      },
    });
    if (!mrn || mrn.source !== MrnSource.VENDOR) throw new NotFoundError("Vendor receipt not found");
    const stocks = await prisma.inventoryStock.findMany({
      where: { branchId: mrn.receivingBranchId, partId: { in: mrn.lines.map((l) => l.partId) } },
      select: { partId: true, rackLocation: true },
    });
    return {
      ...mrn,
      lines: mrn.lines.map((line) => ({
        ...line,
        sourceLabel: sourceLabel(line.part.partFlag),
        bin: stocks.find((s) => s.partId === line.partId)?.rackLocation ?? line.part.binLocation,
      })),
    };
  }
}

export default VendorReceiptService;
