/**
 * MRN returns: parts sent back to a vendor against a vendor MRN (legacy MRN Return, MrnRetHead).
 *
 *   vendor MRN ──► return (some lines, or Full return) ──► stock out (VENDOR_RETURN), MRN line returned qty
 *
 * Legacy use since 2021: Lagos 51 returns, Abuja 47 (CPD none since 2017). Every return named its MRN,
 * took the MRN's rate and tax form, and 98% came within 30 days. The vendor defaults to the MRN's but can
 * be changed (Lagos returned six Royal Iyke MRNs to Seun Nigeria). Charges were always zero. The dealer
 * rate is not touched. Tally posting is deferred.
 */
import { MrnSource, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { sourceLabel } from "../inventory/partSource";
import { partyName } from "../parts-report/partsReport.common";
import { nextDocumentNumber } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import { planReturn, receiptTotals, returnableQuantity } from "./vendorReceipt.logic";
import { roundsMrnTotal } from "./vendorReceipt.service";

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

export interface CreateVendorReturnInput {
  /** Defaults to the MRN's vendor. */
  vendorId?: string;
  returnDate?: Date;
  fullReturn?: boolean;
  remarks?: string;
  lines?: { mrnLineId: string; quantity: number }[];
}

const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;
const branchSelect = { select: { id: true, name: true, code: true } } as const;
const vendorSelect = { select: { id: true, code: true, companyName: true, firstName: true, lastName: true } } as const;

export class VendorReturnService {
  async createReturn(mrnId: string, input: CreateVendorReturnInput, actorId: string) {
    const returnId = await prisma.$transaction(async (tx) => {
      // One return (or edit) at a time per MRN, so returned quantities cannot be overrun.
      await tx.$queryRaw`SELECT id FROM "MaterialReceiptNote" WHERE id = ${mrnId} FOR UPDATE`;
      const mrn = await tx.materialReceiptNote.findUnique({
        where: { id: mrnId },
        include: { lines: { include: { part: { select: { partNumber: true } } } } },
      });
      if (!mrn || mrn.source !== MrnSource.VENDOR) throw new NotFoundError("Vendor receipt not found");

      const vendorId = input.vendorId ?? mrn.vendorId;
      if (!vendorId) throw new BadRequestError("Choose the vendor the parts go back to");
      const vendor = await tx.customer.findUnique({ where: { id: vendorId }, select: { ...vendorSelect.select, type: true, partyStatus: true, mergedIntoId: true } });
      if (!vendor || vendor.mergedIntoId || (vendor.partyStatus !== "VENDOR" && vendor.type !== "VENDOR")) throw new BadRequestError("Choose a party with Vendor status");

      const lines = planReturn(
        mrn.lines.map((l) => ({ id: l.id, partId: l.partId, partNumber: l.part.partNumber, receivedQuantity: l.receivedQuantity, returnedQuantity: l.returnedQuantity, unitCost: l.unitCost, vatPercent: l.vatPercent })),
        input,
      );
      const fullReturn = mrn.lines.every((l) => returnableQuantity(l) === (lines.find((r) => r.mrnLineId === l.id)?.quantity ?? 0));
      const totals = receiptTotals(lines, await roundsMrnTotal(tx, mrn.receivingBranchId));

      const now = new Date();
      const returnNumber = await nextDocumentNumber(tx, DOC_TYPES.VENDOR_RETURN, now);
      const created = await tx.vendorReturn.create({
        data: {
          returnNumber,
          mrnId: mrn.id,
          branchId: mrn.receivingBranchId,
          vendorId: vendor.id,
          returnDate: input.returnDate ?? now,
          taxForm: mrn.taxForm,
          fullReturn,
          remarks: input.remarks?.trim() || null,
          totalQuantity: totals.totalReceived,
          totalValue: totals.totalValue,
          taxAmount: totals.taxAmount,
          roundOff: totals.roundOff,
          netAmount: totals.netAmount,
          createdById: actorId,
          lines: {
            create: lines.map((l) => ({ mrnLineId: l.mrnLineId, partId: l.partId, quantity: l.quantity, unitCost: l.unitCost, amount: l.amount, vatPercent: l.vatPercent, taxAmount: l.taxAmount })),
          },
        },
      });

      for (const line of [...lines].sort((a, b) => a.partId.localeCompare(b.partId))) {
        const taken = await tx.inventoryStock.updateMany({
          where: { branchId: mrn.receivingBranchId, partId: line.partId, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (taken.count !== 1) throw new ConflictError(`${line.partNumber}: fewer than ${line.quantity} are in stock to send back`);
        await tx.materialReceiptLine.update({ where: { id: line.mrnLineId }, data: { returnedQuantity: { increment: line.quantity } } });
        await tx.stockTransaction.create({
          data: {
            branchId: mrn.receivingBranchId,
            partId: line.partId,
            type: "VENDOR_RETURN",
            quantity: -line.quantity,
            referenceId: created.id,
            notes: `MRN return ${returnNumber} (MRN ${mrn.mrnNumber}) to ${partyName(vendor)}`,
            recordedById: actorId,
          },
        });
      }
      return created.id;
    }, TX_OPTIONS);
    return this.getReturn(returnId);
  }

  async listReturns(filters: { branchId?: string; search?: string }) {
    const search = filters.search?.trim();
    const where: Prisma.VendorReturnWhereInput = {
      ...(filters.branchId && { branchId: filters.branchId }),
      ...(search && {
        OR: [
          { returnNumber: { contains: search } },
          { mrn: { mrnNumber: { contains: search } } },
          { mrn: { invoiceNumber: { contains: search, mode: "insensitive" } } },
          { vendor: { companyName: { contains: search, mode: "insensitive" } } },
          { lines: { some: { part: { partNumber: { contains: search, mode: "insensitive" } } } } },
        ],
      }),
    };
    const rows = await prisma.vendorReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        branch: branchSelect,
        vendor: vendorSelect,
        createdBy: userSelect,
        mrn: { select: { id: true, mrnNumber: true, invoiceNumber: true, receiptDate: true } },
        _count: { select: { lines: true } },
      },
      take: 300,
    });
    return rows.map((r) => ({ ...r, vendorName: partyName(r.vendor) }));
  }

  async getReturn(id: string) {
    const ret = await prisma.vendorReturn.findUnique({
      where: { id },
      include: {
        branch: branchSelect,
        vendor: vendorSelect,
        createdBy: userSelect,
        mrn: { select: { id: true, mrnNumber: true, receiptDate: true, invoiceNumber: true, invoiceDate: true, vendor: true, taxForm: true } },
        lines: { include: { part: { select: { id: true, partNumber: true, name: true, uom: true, partFlag: true } } }, orderBy: { part: { partNumber: "asc" } } },
      },
    });
    if (!ret) throw new NotFoundError("MRN return not found");
    return { ...ret, vendorName: partyName(ret.vendor), lines: ret.lines.map((l) => ({ ...l, sourceLabel: sourceLabel(l.part.partFlag) })) };
  }
}

export default VendorReturnService;
