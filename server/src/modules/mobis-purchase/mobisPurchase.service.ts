/**
 * Mobis purchase receiving (issue #62, Process B).
 *
 *   Mobis invoice file (MIT format) ──► import MIT ──► generate MRN ──► CPD stock
 *
 * The invoice file is the only thing ever uploaded: every other document in
 * the app is shared through the single database. Importing creates the MIT
 * (and, if asked, any parts missing from Part Master). Generating the MRN
 * records what physically arrived and posts accepted stock exactly once.
 */
import { MitSourceType, MitStatus, PartStatus, Prisma, TransportMode } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { NotificationService } from "../notification/notification.service";
import { nextDocumentNumber } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES, planReceipt, ReceiptInputLine } from "../stock-transfer/stockTransfer.logic";
import {
  DEFAULT_CONVERSION_RATE,
  ImportLineInput,
  MOBIS_VENDOR,
  MRN_TAX_FORM,
  cleanImportLines,
  importTotals,
  round2,
  unitCost,
} from "./mobisPurchase.logic";

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

export const MOBIS_NOTIFICATION_TYPES = {
  MIT_UPLOADED: "MOBIS_MIT_UPLOADED",
  MRN_POSTED: "MRN_POSTED",
} as const;

export interface ImportMitInput {
  destinationBranchId: string;
  invoiceNumber: string;
  invoiceDate?: Date;
  conversionRate?: number;
  physicalReceiptDate?: Date;
  receivedMode: TransportMode;
  remarks?: string;
  sourceFileName?: string;
  createMissingParts?: boolean;
  lines: ImportLineInput[];
}

export interface CreateMrnInput {
  taxForm?: string;
  receiptDate?: Date;
  remarks?: string;
  /** Per-line received/damaged. Anything not accounted for is recorded as short. */
  lines?: ReceiptInputLine[];
}

const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;
const branchSelect = { select: { id: true, name: true, code: true } } as const;

async function uniquePartCode(tx: Tx, partNumber: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? partNumber : `${partNumber}-${i + 1}`;
    if (!(await tx.sparePart.findUnique({ where: { partCode: candidate }, select: { id: true } }))) return candidate;
  }
  throw new ConflictError(`Could not generate a part code for ${partNumber}`);
}

export class MobisPurchaseService {
  private notifications = new NotificationService();

  /** Which invoice part numbers already exist in Part Master (for the upload preview). */
  async matchParts(partNumbers: string[]) {
    const wanted = [...new Set(partNumbers.map((p) => p.trim().toUpperCase()).filter(Boolean))];
    const parts = await prisma.sparePart.findMany({
      where: { partNumber: { in: wanted, mode: "insensitive" } },
      select: { id: true, partNumber: true, name: true, partStatus: true, unitPrice: true },
    });
    const byNumber = new Map(parts.map((p) => [p.partNumber.toUpperCase(), p]));
    return wanted.map((partNumber) => ({ partNumber, part: byNumber.get(partNumber) ?? null }));
  }

  async importMit(input: ImportMitInput, actorId: string) {
    const invoiceNumber = input.invoiceNumber.trim();
    if (!invoiceNumber) throw new BadRequestError("The invoice number is missing");
    const conversionRate = input.conversionRate ?? DEFAULT_CONVERSION_RATE;
    if (!(conversionRate > 0)) throw new BadRequestError("The conversion rate must be greater than zero");

    const branch = await prisma.branch.findUnique({ where: { id: input.destinationBranchId } });
    if (!branch) throw new NotFoundError("Receiving branch not found");

    const duplicate = await prisma.materialInTransit.findFirst({
      where: {
        sourceType: MitSourceType.EXTERNAL_VENDOR,
        vendor: MOBIS_VENDOR,
        invoiceNumber: { equals: invoiceNumber, mode: "insensitive" },
        status: { not: MitStatus.CANCELLED },
      },
      select: { mitNumber: true },
    });
    if (duplicate) {
      throw new ConflictError(`Mobis invoice ${invoiceNumber} was already imported as MIT ${duplicate.mitNumber}`);
    }

    const lines = cleanImportLines(input.lines);
    const totals = importTotals(lines);

    const mit = await prisma.$transaction(async (tx) => {
      const existing = await tx.sparePart.findMany({
        where: { partNumber: { in: [...new Set(lines.map((l) => l.partNumber))], mode: "insensitive" } },
        select: { id: true, partNumber: true },
      });
      const partIdByNumber = new Map(existing.map((p) => [p.partNumber.toUpperCase(), p.id]));
      const created = new Set<string>();

      const missing = [...new Set(lines.map((l) => l.partNumber).filter((n) => !partIdByNumber.has(n)))];
      if (missing.length && !input.createMissingParts) {
        throw new BadRequestError(
          `${missing.length} part(s) are not in Part Master: ${missing.slice(0, 15).join(", ")}. ` +
            "Create them from the invoice or add them to Part Master first.",
        );
      }
      for (const partNumber of missing) {
        const line = lines.find((l) => l.partNumber === partNumber)!;
        const part = await tx.sparePart.create({
          data: {
            partCode: await uniquePartCode(tx, partNumber),
            partNumber,
            name: line.partName ?? partNumber,
            description: `Created from Mobis invoice ${invoiceNumber}`,
            category: "Mobis import",
            uom: "UNIT",
            // Initial dealer rate: the invoice price in naira. Review it in Part Master.
            unitPrice: unitCost(line.unitPrice, conversionRate),
            partStatus: PartStatus.ACTIVE,
          },
        });
        partIdByNumber.set(partNumber, part.id);
        created.add(partNumber);
      }

      const mitNumber = await nextDocumentNumber(tx, DOC_TYPES.MIT);
      return tx.materialInTransit.create({
        data: {
          mitNumber,
          sourceType: MitSourceType.EXTERNAL_VENDOR,
          status: MitStatus.IN_TRANSIT,
          destinationBranchId: branch.id,
          vendor: MOBIS_VENDOR,
          invoiceNumber,
          invoiceDate: input.invoiceDate,
          conversionRate,
          receivedMode: input.receivedMode,
          physicalReceiptDate: input.physicalReceiptDate ?? new Date(),
          sourceFileName: input.sourceFileName,
          remarks: input.remarks,
          totalCases: totals.totalCases,
          totalQuantity: totals.totalQuantity,
          totalAmount: totals.totalAmount,
          createdById: actorId,
          lines: {
            create: lines.map((l) => ({
              partId: partIdByNumber.get(l.partNumber)!,
              filePartNumber: l.partNumber,
              filePartName: l.partName,
              orderNumber: l.orderNumber,
              lineNumber: l.lineNumber,
              caseNumbers: l.caseNumber,
              intRef: l.intRef,
              weight: l.weight,
              hsCode: l.hsCode,
              quantity: l.quantity,
              orderedQuantity: l.quantity,
              unitPrice: l.unitPrice,
              amount: l.amount,
              newPart: created.has(l.partNumber),
            })),
          },
        },
        include: { lines: true },
      });
    }, TX_OPTIONS);

    const newParts = mit.lines.filter((l) => l.newPart).length;
    await this.notifyStore(branch.id, {
      type: MOBIS_NOTIFICATION_TYPES.MIT_UPLOADED,
      title: "Mobis invoice uploaded",
      message:
        `MIT ${mit.mitNumber} for Mobis invoice ${invoiceNumber}: ${totals.totalQuantity} unit(s) on ${mit.lines.length} line(s)` +
        (totals.totalCases ? ` in ${totals.totalCases} case(s)` : "") +
        (newParts ? `, ${newParts} new part(s) added to Part Master` : "") +
        ". Check the shipment and generate the MRN.",
      link: `/inventory/mobis-receipts/${mit.id}`,
    });
    return this.getMobisMit(mit.id);
  }

  async getMobisMit(id: string) {
    const mit = await prisma.materialInTransit.findUnique({
      where: { id },
      include: {
        destinationBranch: branchSelect,
        createdBy: userSelect,
        lines: {
          orderBy: [{ orderNumber: "asc" }, { lineNumber: "asc" }],
          include: {
            part: { select: { id: true, partNumber: true, name: true, partStatus: true, unitPrice: true, uom: true } },
          },
        },
        mrn: { include: { receivedBy: userSelect, lines: true } },
      },
    });
    if (!mit || mit.sourceType !== MitSourceType.EXTERNAL_VENDOR) throw new NotFoundError("Mobis MIT not found");
    return mit;
  }

  async listMobisMits(filters: { status?: MitStatus; branchId?: string; search?: string }) {
    return prisma.materialInTransit.findMany({
      where: {
        sourceType: MitSourceType.EXTERNAL_VENDOR,
        ...(filters.status && { status: filters.status }),
        ...(filters.branchId && { destinationBranchId: filters.branchId }),
        ...(filters.search && {
          OR: [
            { mitNumber: { contains: filters.search } },
            { invoiceNumber: { contains: filters.search, mode: "insensitive" } },
            { lines: { some: { orderNumber: { contains: filters.search, mode: "insensitive" } } } },
            { lines: { some: { filePartNumber: { contains: filters.search, mode: "insensitive" } } } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        destinationBranch: branchSelect,
        createdBy: userSelect,
        mrn: { select: { id: true, mrnNumber: true, receiptDate: true, totalValue: true } },
        _count: { select: { lines: true } },
      },
      take: 300,
    });
  }

  async cancelMit(id: string, actorId: string, reason?: string) {
    const mit = await this.getMobisMit(id);
    if (mit.mrn) throw new ConflictError(`MIT ${mit.mitNumber} already has MRN ${mit.mrn.mrnNumber} and cannot be cancelled`);
    const result = await prisma.materialInTransit.updateMany({
      where: { id, status: { in: [MitStatus.IN_TRANSIT, MitStatus.VERIFIED] } },
      data: {
        status: MitStatus.CANCELLED,
        cancelledAt: new Date(),
        remarks: reason ? `${mit.remarks ? `${mit.remarks}\n` : ""}Cancelled: ${reason}` : mit.remarks,
      },
    });
    if (result.count !== 1) throw new ConflictError("This MIT can no longer be cancelled");
    void actorId;
    return this.getMobisMit(id);
  }

  /** Records what arrived and posts accepted quantities to the receiving branch (CPD) once. */
  async createMrn(mitId: string, actorId: string, input: CreateMrnInput = {}) {
    const result = await prisma.$transaction(async (tx) => {
      // Lock the MIT so two MRN attempts queue here; the unique MRN.mitId is the final guard.
      const locked = await tx.$queryRaw<{ status: MitStatus; sourceType: MitSourceType }[]>`
        SELECT "status", "sourceType" FROM "MaterialInTransit" WHERE "id" = ${mitId} FOR UPDATE`;
      if (!locked[0] || locked[0].sourceType !== MitSourceType.EXTERNAL_VENDOR) throw new NotFoundError("Mobis MIT not found");
      if (locked[0].status !== MitStatus.IN_TRANSIT && locked[0].status !== MitStatus.VERIFIED) {
        throw new ConflictError(`Cannot generate an MRN for an MIT in ${locked[0].status} status`);
      }
      const mit = await tx.materialInTransit.findUniqueOrThrow({
        where: { id: mitId },
        include: { lines: { include: { part: { select: { partNumber: true } } } }, mrn: { select: { mrnNumber: true } } },
      });
      if (mit.mrn) throw new ConflictError(`MIT ${mit.mitNumber} already has MRN ${mit.mrn.mrnNumber}`);

      // One MRN closes the MIT: anything not received or damaged is recorded as short.
      const plan = planReceipt(mit.lines, input.lines, true);
      const rate = mit.conversionRate ?? DEFAULT_CONVERSION_RATE;
      const lineById = new Map(mit.lines.map((l) => [l.id, l]));
      const now = new Date();
      const mrnNumber = await nextDocumentNumber(tx, DOC_TYPES.MRN, now);

      const mrnLines = plan.lines.map((p) => {
        const mitLine = lineById.get(p.mitLineId)!;
        const cost = unitCost(mitLine.unitPrice, rate);
        return {
          mitLineId: p.mitLineId,
          partId: mitLine.partId,
          receivedQuantity: p.receivedQuantity,
          damagedQuantity: p.damagedQuantity,
          shortQuantity: p.shortQuantity,
          unitPrice: mitLine.unitPrice,
          unitCost: cost,
          amount: round2(cost * p.receivedQuantity),
          remarks: p.remarks,
        };
      });
      const totalValue = round2(mrnLines.reduce((s, l) => s + l.amount, 0));

      const mrn = await tx.materialReceiptNote.create({
        data: {
          mrnNumber,
          mitId: mit.id,
          receivingBranchId: mit.destinationBranchId,
          vendor: mit.vendor ?? MOBIS_VENDOR,
          invoiceNumber: mit.invoiceNumber,
          taxForm: input.taxForm?.trim() || MRN_TAX_FORM,
          conversionRate: rate,
          receiptDate: input.receiptDate ?? now,
          remarks: input.remarks,
          totalReceived: plan.totals.received,
          totalDamaged: plan.totals.damaged,
          totalShort: plan.totals.short,
          totalValue,
          receivedById: actorId,
          lines: { create: mrnLines },
        },
      });

      for (const line of mrnLines) {
        // The MIT line check constraint rejects anything beyond the invoiced quantity.
        await tx.materialInTransitLine.update({
          where: { id: line.mitLineId },
          data: {
            receivedQuantity: { increment: line.receivedQuantity },
            damagedQuantity: { increment: line.damagedQuantity },
            shortQuantity: { increment: line.shortQuantity },
          },
        });
        if (line.receivedQuantity > 0) {
          await tx.inventoryStock.upsert({
            where: { branchId_partId: { branchId: mit.destinationBranchId, partId: line.partId } },
            update: { quantity: { increment: line.receivedQuantity } },
            create: { branchId: mit.destinationBranchId, partId: line.partId, quantity: line.receivedQuantity },
          });
          await tx.stockTransaction.create({
            data: {
              branchId: mit.destinationBranchId,
              partId: line.partId,
              type: "RECEIVED",
              quantity: line.receivedQuantity,
              referenceId: mrn.id,
              notes: `MRN ${mrnNumber} for Mobis invoice ${mit.invoiceNumber ?? ""} (MIT ${mit.mitNumber})`.trim(),
              recordedById: actorId,
            },
          });
        }
      }

      await tx.materialInTransit.update({ where: { id: mit.id }, data: { status: MitStatus.RECEIVED } });
      return { mrnNumber, mit, totals: plan.totals, totalValue };
    }, TX_OPTIONS);

    const { mit, totals } = result;
    await this.notifyStore(mit.destinationBranchId, {
      type: MOBIS_NOTIFICATION_TYPES.MRN_POSTED,
      title: "Mobis stock received",
      message:
        `MRN ${result.mrnNumber} posted ${totals.received} unit(s) from Mobis invoice ${mit.invoiceNumber} (MIT ${mit.mitNumber})` +
        (totals.damaged ? `, ${totals.damaged} damaged` : "") +
        (totals.short ? `, ${totals.short} short` : "") +
        ".",
      link: `/inventory/mobis-receipts/${mit.id}`,
    });
    return this.getMobisMit(mitId);
  }

  async listMrns(branchId?: string) {
    return prisma.materialReceiptNote.findMany({
      where: branchId ? { receivingBranchId: branchId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        receivingBranch: branchSelect,
        receivedBy: userSelect,
        mit: { select: { id: true, mitNumber: true } },
      },
      take: 300,
    });
  }

  async getMrn(id: string) {
    const mrn = await prisma.materialReceiptNote.findUnique({
      where: { id },
      include: {
        receivingBranch: branchSelect,
        receivedBy: userSelect,
        mit: { select: { id: true, mitNumber: true, invoiceNumber: true } },
        lines: {
          include: {
            part: { select: { id: true, partNumber: true, name: true } },
            mitLine: { select: { orderNumber: true, lineNumber: true, caseNumbers: true } },
          },
        },
      },
    });
    if (!mrn) throw new NotFoundError("MRN not found");
    return mrn;
  }

  /** CPD store managers and general store managers, one notification each. */
  private async notifyStore(branchId: string, payload: { type: string; title: string; message: string; link: string }) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { name: ROLES.GENERAL_STORE_MANAGER } },
          { role: { name: ROLES.BRANCH_STORE_MANAGER }, branchId },
        ],
      },
      select: { id: true },
    });
    await this.notifications.notifyUsers(
      users.map((u) => u.id),
      { ...payload, branchId },
    );
  }
}

export default MobisPurchaseService;
