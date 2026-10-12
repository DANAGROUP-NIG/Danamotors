/**
 * Physical stock taking (legacy PSTbatch.dll and PhysicalStock.dll; AutoEnhancer and CPDAutoEnhancer
 * PSTBatchHead/Detail, PhysicalStockHead/Detail, PSTDownloadHEAD/DETAIL, PhyStkUploadLog, PSTADJUSTMENT).
 *
 *   batch (parts chosen; an annual batch freezes their stock) ──► count sheets, one per checker
 *     ──► sheet upload ──► complete ──► S/E confirmation (stock adjusted) ──► bin locations updated
 *
 * A stock audit (legacy Stock Audit, TranType S) runs the same way up to complete, which is final:
 * it reports shortage and excess only, and auditors never see system stock on their sheets.
 *
 * Count sheets stand in for the handheld (HHDC) downloads until the device is integrated; the
 * device will post its scans to the same sheet upload. Legacy stopped adjusting stock after 2012;
 * here the S/E confirmation posts each shortage and excess as an ADJUSTMENT (SAN).
 */
import { Prisma, StockAuditLevel, StockTakeStatus, StockTakeType, PartStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { lockStock, nextDocumentNumber, StockTransferService } from "../stock-transfer/stockTransfer.service";
import { DOC_TYPES } from "../stock-transfer/stockTransfer.logic";
import { recordBinChange } from "../inventory/partHistory";
import {
  adjustedStock,
  Basis,
  CountEntry,
  describeCriteria,
  discrepancy,
  groupCounts,
  inRange,
  Kind,
  mergeBins,
  mergeRemarks,
  summarise,
  UncountedOnComplete,
  UncountedOnSheet,
} from "./stockTake.logic";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

// Annual counts run to tens of thousands of parts.
const TX_OPTIONS = { timeout: 180_000, maxWait: 10_000 };
const OPEN: StockTakeStatus[] = [StockTakeStatus.ACTIVE, StockTakeStatus.COMPLETED];
const CHUNK = 5000;

export interface PartSelection {
  basis?: Basis;
  from?: string;
  to?: string;
  /** Legacy "Source of Purchase" (O original, A authorised source, L local, F FOC). */
  partFlag?: string;
  /** Legacy "Part Type" (Part Master category). */
  category?: string;
  /** Legacy "Part Category" (price category). */
  priceCategoryCode?: string;
  dealerRateFrom?: number;
  dealerRateTo?: number;
  onlyWithStock?: boolean;
  /** Legacy "Top N consumed parts during last M months", optionally counting STNs. */
  topConsumed?: { count: number; months: number; includeStn?: boolean };
}

export interface CreateStockTakeInput {
  branchId: string;
  type: StockTakeType;
  remarks?: string;
  auditLevel?: StockAuditLevel;
  auditors?: string;
  selection: PartSelection;
  /** Parts unticked after loading the selection. */
  excludePartIds?: string[];
}

export interface CreateSheetInput {
  checkerId?: string;
  basis?: Basis;
  from?: string;
  to?: string;
  lineIds?: string[];
  /** Legacy "Download only those parts which are not been uploaded"; on by default. */
  uncountedOnly?: boolean;
  showSystemStock?: boolean;
}

export interface LineFilters {
  search?: string;
  filter?: "ALL" | "UNCOUNTED" | "DISCREPANCY" | "DAMAGED" | "UNKNOWN";
  page?: number;
  pageSize?: number;
}

const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;
const branchSelect = { select: { id: true, name: true, code: true } } as const;
const partSelect = { select: { id: true, partNumber: true, name: true, partFlag: true, uom: true, unitPrice: true } } as const;

const chunks = <T>(items: T[], size = CHUNK) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const sheetIsOpen = (s: { uploadedAt: Date | null; cancelledAt: Date | null } | null | undefined) => !!s && !s.uploadedAt && !s.cancelledAt;

export class StockTakeService {
  // ── Lookups ───────────────────────────────────────────────────────────────

  async searchParts(search: string, branchId: string) {
    return new StockTransferService().searchParts({ search, sourceBranchId: branchId });
  }

  /** Staff who can be given a count sheet (legacy Checker). */
  async listCheckers(branchId: string) {
    return prisma.user.findMany({
      where: { branchId, isActive: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      ...userSelect,
    });
  }

  /** Legacy "Load Parts": the parts a batch would take, flagged when already in another open count (audits are never held back). */
  async previewParts(branchId: string, selection: PartSelection, kind: Kind = "COUNT") {
    const [candidates, busy] = await Promise.all([
      this.selectParts(prisma, branchId, selection),
      kind === "AUDIT" ? new Map<string, string>() : this.partsInOpenCounts(prisma, branchId),
    ]);
    return candidates.map((c) => ({ ...c, openBatch: busy.get(c.partId) ?? null }));
  }

  /** Parts with stock records at the branch that match the selection, in part (or bin) order. */
  private async selectParts(db: Db, branchId: string, s: PartSelection) {
    const stocks = await db.inventoryStock.findMany({
      where: {
        branchId,
        ...(s.onlyWithStock && { quantity: { gt: 0 } }),
        part: {
          partStatus: PartStatus.ACTIVE,
          ...(s.partFlag && { partFlag: s.partFlag }),
          ...(s.category && { category: s.category }),
          ...(s.priceCategoryCode && { priceCategoryCode: s.priceCategoryCode }),
          ...((s.dealerRateFrom != null || s.dealerRateTo != null) && {
            unitPrice: { ...(s.dealerRateFrom != null && { gte: s.dealerRateFrom }), ...(s.dealerRateTo != null && { lte: s.dealerRateTo }) },
          }),
        },
      },
      select: {
        partId: true,
        quantity: true,
        rackLocation: true,
        part: { select: { partNumber: true, name: true, partFlag: true, unitPrice: true, binLocation: true } },
      },
    });
    let rows = stocks
      .map((st) => ({
        partId: st.partId,
        partNumber: st.part.partNumber,
        name: st.part.name,
        partFlag: st.part.partFlag,
        bin: st.rackLocation ?? st.part.binLocation ?? "",
        dealerRate: st.part.unitPrice,
        stock: st.quantity,
      }))
      .filter((r) => inRange(s.basis === "BIN" ? r.bin : r.partNumber, s.from, s.to));

    if (s.topConsumed) {
      const since = new Date();
      since.setMonth(since.getMonth() - s.topConsumed.months);
      // Issues net of returns, as legacy subtracts qtyreturned.
      const consumed = await db.stockTransaction.groupBy({
        by: ["partId"],
        where: {
          branchId,
          createdAt: { gte: since },
          type: { in: ["ISSUED", "RETURNED", ...(s.topConsumed.includeStn ? ["TRANSFER_OUT"] : [])] },
        },
        _sum: { quantity: true },
      });
      const rank = consumed
        .map((c) => ({ partId: c.partId, used: -(c._sum.quantity ?? 0) }))
        .filter((c) => c.used > 0)
        .sort((a, b) => b.used - a.used);
      const order = new Map<string, number>();
      for (const c of rank) {
        if (order.size >= s.topConsumed.count) break;
        if (rows.some((r) => r.partId === c.partId)) order.set(c.partId, order.size);
      }
      return rows.filter((r) => order.has(r.partId)).sort((a, b) => order.get(a.partId)! - order.get(b.partId)!);
    }
    rows = rows.sort((a, b) => (s.basis === "BIN" ? a.bin.localeCompare(b.bin) : 0) || a.partNumber.localeCompare(b.partNumber));
    return rows;
  }

  /** Part ids already in an ACTIVE or COMPLETED physical count at the branch, with its batch number. Audits never hold parts. */
  private async partsInOpenCounts(db: Db, branchId: string) {
    const lines = await db.stockTakeLine.findMany({
      where: { partId: { not: null }, stockTake: { branchId, status: { in: OPEN }, type: { not: StockTakeType.AUDIT } } },
      select: { partId: true, stockTake: { select: { batchNumber: true } } },
    });
    return new Map(lines.map((l) => [l.partId!, l.stockTake.batchNumber]));
  }

  private async stockOf(db: Db, branchId: string, partIds: string[]) {
    const map = new Map<string, { quantity: number; rackLocation: string | null }>();
    for (const ids of chunks(partIds)) {
      const rows = await db.inventoryStock.findMany({
        where: { branchId, partId: { in: ids } },
        select: { partId: true, quantity: true, rackLocation: true },
      });
      for (const r of rows) map.set(r.partId, r);
    }
    return map;
  }

  // ── Batches ───────────────────────────────────────────────────────────────

  async createStockTake(input: CreateStockTakeInput, actorId: string) {
    const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
    if (!branch?.isActive) throw new BadRequestError("Select an active branch");
    const excluded = new Set(input.excludePartIds ?? []);

    const { id, skipped } = await prisma.$transaction(async (tx) => {
      // One batch at a time per branch, so two batches cannot take the same part.
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branch.id} FOR UPDATE`;
      if (input.type === StockTakeType.ANNUAL) {
        const open = await tx.stockTake.findFirst({ where: { branchId: branch.id, type: StockTakeType.ANNUAL, status: { in: OPEN } } });
        if (open) throw new ConflictError(`Annual stock taking ${open.batchNumber} is still open at this branch`);
      }
      const audit = input.type === StockTakeType.AUDIT;
      const [candidates, busy] = await Promise.all([
        this.selectParts(tx, branch.id, input.selection),
        audit ? new Map<string, string>() : this.partsInOpenCounts(tx, branch.id),
      ]);
      const wanted = candidates.filter((c) => !excluded.has(c.partId));
      const chosen = wanted.filter((c) => !busy.has(c.partId));
      if (!chosen.length) {
        throw new BadRequestError(wanted.length ? "Every selected part is already in an open stock taking at this branch" : "No parts match this selection");
      }
      const take = await tx.stockTake.create({
        data: {
          batchNumber: await nextDocumentNumber(tx, DOC_TYPES.STOCK_TAKE),
          branchId: branch.id,
          type: input.type,
          remarks: input.remarks,
          ...(audit && { auditLevel: input.auditLevel, auditors: input.auditors }),
          createdById: actorId,
        },
      });
      for (const part of chunks(chosen, 2000)) {
        await tx.stockTakeLine.createMany({
          data: part.map((c) => ({
            stockTakeId: take.id,
            partId: c.partId,
            partNumber: c.partNumber,
            binLocation: c.bin || null,
            systemStock: c.stock,
          })),
        });
      }
      return { id: take.id, skipped: wanted.length - chosen.length };
    }, TX_OPTIONS);
    return { stockTake: await this.getStockTake(id), skipped };
  }

  async listStockTakes(filters: { kind?: Kind; branchId?: string; status?: StockTakeStatus; type?: StockTakeType; search?: string }) {
    const takes = await prisma.stockTake.findMany({
      where: {
        AND: [
          { type: filters.kind === "AUDIT" ? StockTakeType.AUDIT : { not: StockTakeType.AUDIT } },
          ...(filters.type ? [{ type: filters.type }] : []),
        ],
        ...(filters.branchId && { branchId: filters.branchId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.type && { type: filters.type }),
        ...(filters.search && {
          OR: [
            { batchNumber: { contains: filters.search } },
            { sheets: { some: { sheetNumber: { contains: filters.search } } } },
            { lines: { some: { partNumber: { contains: filters.search, mode: "insensitive" } } } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      include: { branch: branchSelect, createdBy: userSelect, _count: { select: { lines: true } } },
      take: 300,
    });
    const counted = takes.length
      ? await prisma.stockTakeLine.groupBy({
          by: ["stockTakeId"],
          where: { stockTakeId: { in: takes.map((t) => t.id) }, countedQuantity: { not: null } },
          _count: { _all: true },
        })
      : [];
    return takes.map((t) => ({ ...t, countedLines: counted.find((c) => c.stockTakeId === t.id)?._count._all ?? 0 }));
  }

  /** Branch and type of a count, to check the user may act on it. */
  async accessOf(id: string) {
    const take = await prisma.stockTake.findUnique({ where: { id }, select: { branchId: true, type: true } });
    if (!take) throw new NotFoundError("Stock taking not found");
    return take;
  }

  async getStockTake(id: string) {
    const take = await prisma.stockTake.findUnique({
      where: { id },
      include: {
        branch: branchSelect,
        createdBy: userSelect,
        completedBy: userSelect,
        confirmedBy: userSelect,
        cancelledBy: userSelect,
        sheets: {
          orderBy: { issuedAt: "desc" },
          include: { checker: userSelect, issuedBy: userSelect, uploadedBy: userSelect },
        },
      },
    });
    if (!take) throw new NotFoundError("Stock taking not found");
    const lines = await prisma.stockTakeLine.findMany({
      where: { stockTakeId: id },
      select: {
        partId: true,
        countedQuantity: true,
        damagedQuantity: true,
        stockAtCount: true,
        systemStock: true,
        notRequired: true,
        dealerRate: true,
        sheetId: true,
        part: { select: { unitPrice: true } },
      },
    });
    const openSheets = new Set(take.sheets.filter(sheetIsOpen).map((s) => s.id));
    const summary = summarise(
      lines.map((l) => ({ ...l, onOpenSheet: !!l.sheetId && openSheets.has(l.sheetId), rate: l.dealerRate ?? l.part?.unitPrice ?? 0 })),
    );
    return { ...take, summary };
  }

  /** The count's parts, a page at a time (an annual count has every part of the branch). */
  async listLines(id: string, f: LineFilters) {
    const all = await prisma.stockTakeLine.findMany({
      where: {
        stockTakeId: id,
        ...(f.search && {
          OR: [
            { partNumber: { contains: f.search, mode: "insensitive" } },
            { part: { name: { contains: f.search, mode: "insensitive" } } },
            { binLocation: { contains: f.search, mode: "insensitive" } },
            { countedBins: { contains: f.search, mode: "insensitive" } },
          ],
        }),
      },
      select: { id: true, partId: true, partNumber: true, countedQuantity: true, damagedQuantity: true, stockAtCount: true, systemStock: true, notRequired: true },
      orderBy: { partNumber: "asc" },
    });
    const filter = f.filter ?? "ALL";
    const matching = all.filter((l) => {
      switch (filter) {
        case "UNCOUNTED":
          return l.partId != null && l.countedQuantity == null;
        case "DISCREPANCY":
          return l.partId != null && (discrepancy(l) ?? 0) !== 0;
        case "DAMAGED":
          return l.damagedQuantity > 0;
        case "UNKNOWN":
          return l.partId == null;
        default:
          return true;
      }
    });
    const pageSize = f.pageSize ?? 50;
    const page = Math.max(1, f.page ?? 1);
    const ids = matching.slice((page - 1) * pageSize, page * pageSize).map((l) => l.id);
    const rows = await prisma.stockTakeLine.findMany({
      where: { id: { in: ids } },
      include: {
        part: partSelect,
        sheet: { select: { id: true, sheetNumber: true, uploadedAt: true, cancelledAt: true, checker: userSelect } },
      },
    });
    const lines = ids
      .map((lineId) => rows.find((r) => r.id === lineId)!)
      .map((l) => ({ ...l, discrepancy: l.partId ? discrepancy(l) : null, rate: l.dealerRate ?? l.part?.unitPrice ?? 0 }));
    return { lines, total: matching.length, page, pageSize };
  }

  /** Legacy "Stock Increase/Decrease Dtl": stock movements of the count's parts since the batch was created. */
  async listMovements(id: string) {
    const take = await prisma.stockTake.findUnique({ where: { id }, select: { id: true, branchId: true } });
    if (!take) throw new NotFoundError("Stock taking not found");
    // Compared with the batch's own column: a Date parameter would shift by the session time zone.
    return prisma.$queryRaw<
      { id: string; createdAt: Date; type: string; quantity: number; referenceId: string | null; notes: string | null; partNumber: string; name: string; by: string | null }[]
    >`
      SELECT t."id", t."createdAt", t."type", t."quantity", t."referenceId", t."notes", p."partNumber", p."name",
             NULLIF(TRIM(COALESCE(u."firstName", '') || ' ' || COALESCE(u."lastName", '')), '') AS "by"
        FROM "StockTransaction" t
        JOIN "StockTakeLine" l ON l."partId" = t."partId" AND l."stockTakeId" = ${take.id}
        JOIN "StockTake" st ON st."id" = l."stockTakeId"
        JOIN "SparePart" p ON p."id" = t."partId"
        LEFT JOIN "User" u ON u."id" = t."recordedById"
       WHERE t."branchId" = ${take.branchId} AND t."createdAt" >= st."createdAt"
       ORDER BY t."createdAt" DESC
       LIMIT 2000`;
  }

  /** Lock the count and check it is in one of the given states. */
  private async lockTake(tx: Tx, id: string, allowed: StockTakeStatus[]) {
    const locked = await tx.$queryRaw<{ status: StockTakeStatus }[]>`SELECT "status" FROM "StockTake" WHERE "id" = ${id} FOR UPDATE`;
    if (!locked[0]) throw new NotFoundError("Stock taking not found");
    if (!allowed.includes(locked[0].status)) {
      throw new ConflictError(`This stock taking is ${locked[0].status.toLowerCase()} and cannot be changed this way`);
    }
    return tx.stockTake.findUniqueOrThrow({ where: { id } });
  }

  /** Cancel a count that has not adjusted stock. Nothing it counted is kept. A completed audit is final. */
  async cancelStockTake(id: string, remark: string, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, OPEN);
      if (take.type === StockTakeType.AUDIT && take.status === StockTakeStatus.COMPLETED) {
        throw new ConflictError(`Stock audit ${take.batchNumber} is completed and can no longer be cancelled`);
      }
      const now = new Date();
      await tx.stockTakeSheet.updateMany({
        where: { stockTakeId: id, uploadedAt: null, cancelledAt: null },
        data: { cancelledAt: now, cancelRemark: "Stock taking cancelled" },
      });
      await tx.stockTake.update({
        where: { id },
        data: { status: StockTakeStatus.CANCELLED, cancelledAt: now, cancelledById: actorId, cancelRemark: remark },
      });
    }, TX_OPTIONS);
    return this.getStockTake(id);
  }

  // ── Count sheets (HHDC downloads) ─────────────────────────────────────────

  async createSheet(id: string, input: CreateSheetInput, actorId: string) {
    const sheetId = await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, [StockTakeStatus.ACTIVE]);
      if (input.checkerId) {
        const checker = await tx.user.findUnique({ where: { id: input.checkerId } });
        if (!checker?.isActive) throw new BadRequestError("Select an active checker");
      }
      const free = await tx.stockTakeLine.findMany({
        where: {
          stockTakeId: take.id,
          partId: { not: null },
          ...(input.uncountedOnly !== false && { countedQuantity: null }),
          ...(input.lineIds && { id: { in: input.lineIds } }),
          OR: [{ sheetId: null }, { sheet: { OR: [{ uploadedAt: { not: null } }, { cancelledAt: { not: null } }] } }],
        },
        select: { id: true, partNumber: true, binLocation: true },
      });
      const chosen = input.lineIds ? free : free.filter((l) => inRange(input.basis === "BIN" ? l.binLocation : l.partNumber, input.from, input.to));
      if (!chosen.length) throw new BadRequestError("No parts are left to count for this selection");
      const sheet = await tx.stockTakeSheet.create({
        data: {
          sheetNumber: await nextDocumentNumber(tx, DOC_TYPES.STOCK_TAKE_SHEET),
          stockTakeId: take.id,
          checkerId: input.checkerId,
          criteria: describeCriteria({ ...input, picked: input.lineIds?.length }),
          // An auditor counts blind.
          showSystemStock: take.type !== StockTakeType.AUDIT && (input.showSystemStock ?? false),
          lineCount: chosen.length,
          issuedById: actorId,
        },
      });
      for (const ids of chunks(chosen.map((l) => l.id))) {
        await tx.stockTakeLine.updateMany({ where: { id: { in: ids } }, data: { sheetId: sheet.id } });
      }
      return sheet.id;
    }, TX_OPTIONS);
    return this.getSheet(id, sheetId);
  }

  async getSheet(id: string, sheetId: string) {
    const sheet = await prisma.stockTakeSheet.findFirst({
      where: { id: sheetId, stockTakeId: id },
      include: {
        checker: userSelect,
        issuedBy: userSelect,
        uploadedBy: userSelect,
        stockTake: { select: { id: true, batchNumber: true, type: true, status: true, branchId: true, branch: branchSelect } },
        lines: { orderBy: [{ binLocation: "asc" }, { partNumber: "asc" }], include: { part: partSelect } },
      },
    });
    if (!sheet) throw new NotFoundError("Count sheet not found");
    return sheet;
  }

  async cancelSheet(id: string, sheetId: string, remark: string) {
    await prisma.$transaction(async (tx) => {
      await this.lockTake(tx, id, [StockTakeStatus.ACTIVE]);
      const sheet = await this.lockSheet(tx, id, sheetId);
      await tx.stockTakeSheet.update({ where: { id: sheet.id }, data: { cancelledAt: new Date(), cancelRemark: remark } });
      await tx.stockTakeLine.updateMany({ where: { sheetId: sheet.id }, data: { sheetId: null } });
    }, TX_OPTIONS);
    return this.getStockTake(id);
  }

  private async lockSheet(tx: Tx, id: string, sheetId: string) {
    await tx.$queryRaw`SELECT id FROM "StockTakeSheet" WHERE id = ${sheetId} FOR UPDATE`;
    const sheet = await tx.stockTakeSheet.findFirst({ where: { id: sheetId, stockTakeId: id } });
    if (!sheet) throw new NotFoundError("Count sheet not found");
    if (!sheetIsOpen(sheet)) throw new ConflictError(`Sheet ${sheet.sheetNumber} is already ${sheet.uploadedAt ? "uploaded" : "cancelled"}`);
    return sheet;
  }

  /**
   * Record a sheet's counts (legacy upload from the HHDC). Parts left blank are taken as none
   * counted (ZERO) or go back to the pool for another sheet (RELEASE).
   */
  async uploadSheet(id: string, sheetId: string, input: { entries: CountEntry[]; uncounted: UncountedOnSheet }, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, [StockTakeStatus.ACTIVE]);
      const sheet = await this.lockSheet(tx, id, sheetId);
      await this.applyCounts(tx, take, input.entries, actorId, sheet.id);
      if (input.uncounted === "ZERO") {
        await this.zeroUncounted(tx, take, actorId, { sheetId: sheet.id, remark: `Not found when counting sheet ${sheet.sheetNumber}` });
      } else {
        await tx.stockTakeLine.updateMany({ where: { sheetId: sheet.id, countedQuantity: null }, data: { sheetId: null } });
      }
      const countedCount = await tx.stockTakeLine.count({ where: { sheetId: sheet.id, countedQuantity: { not: null } } });
      await tx.stockTakeSheet.update({ where: { id: sheet.id }, data: { uploadedAt: new Date(), uploadedById: actorId, countedCount } });
    }, TX_OPTIONS);
    return this.getStockTake(id);
  }

  /** Counts entered on the count screen, without a sheet (legacy manual entry, ThroughHHDC = 0). */
  async recordCounts(id: string, entries: CountEntry[], actorId: string) {
    await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, [StockTakeStatus.ACTIVE]);
      await this.applyCounts(tx, take, entries, actorId);
    }, TX_OPTIONS);
    return this.getStockTake(id);
  }

  /**
   * Add counts to their lines. A part counted again (another bin, another checker) adds up, as legacy
   * merges uploads. A part found that is not in the count joins it (legacy NewPart); a part number
   * not in Part Master is kept for the store to resolve (legacy wrong part).
   */
  private async applyCounts(tx: Tx, take: { id: string; branchId: string; type: StockTakeType }, entries: CountEntry[], actorId: string, sheetId?: string) {
    // Resolve part numbers first, so a part sent by number and by id is one group.
    const byId = [...new Set(entries.filter((e) => e.partId).map((e) => e.partId!))];
    const byNumber = [...new Set(entries.filter((e) => !e.partId && e.partNumber?.trim()).map((e) => e.partNumber!.trim().toUpperCase()))];
    const parts = [
      ...(byId.length ? await tx.sparePart.findMany({ where: { id: { in: byId } }, select: { id: true, partNumber: true, binLocation: true } }) : []),
      ...(byNumber.length
        ? await tx.$queryRaw<{ id: string; partNumber: string; binLocation: string | null }[]>`
            SELECT "id", "partNumber", "binLocation" FROM "SparePart" WHERE UPPER("partNumber") = ANY(${byNumber}::text[])`
        : []),
    ];
    const missing = byId.find((pid) => !parts.some((p) => p.id === pid));
    if (missing) throw new NotFoundError(`Part ${missing} not found`);
    const groups = groupCounts(
      entries.map((e) => {
        const known = e.partId ? undefined : parts.find((p) => p.partNumber.toUpperCase() === e.partNumber?.trim().toUpperCase());
        return known ? { ...e, partId: known.id, partNumber: undefined } : e;
      }),
    );
    const partFor = (g: (typeof groups)[number]) => (g.partId ? parts.find((p) => p.id === g.partId) : undefined);

    const partIds = groups.filter((g) => g.partId).map((g) => g.partId!);
    const unknownNumbers = groups.filter((g) => !g.partId).map((g) => g.partNumber!);
    const existing = await tx.stockTakeLine.findMany({
      where: { stockTakeId: take.id, OR: [{ partId: { in: partIds } }, { partId: null, partNumber: { in: unknownNumbers } }] },
    });
    const stock = await this.stockOf(tx, take.branchId, partIds);

    const newParts = partIds.filter((pid) => !existing.some((l) => l.partId === pid));
    if (newParts.length && take.type !== StockTakeType.AUDIT) {
      const busy = await this.partsInOpenCounts(tx, take.branchId);
      const clash = newParts.filter((pid) => busy.has(pid));
      if (clash.length) {
        const part = parts.find((p) => p.id === clash[0])!;
        throw new ConflictError(`Part ${part.partNumber} is being counted in stock taking ${busy.get(clash[0])}; record its count there`);
      }
    }

    const now = new Date();
    for (const group of groups) {
      const part = partFor(group);
      let line = existing.find((l) => (part ? l.partId === part.id : l.partId == null && l.partNumber === group.partNumber));
      if (!line) {
        const st = part ? stock.get(part.id) : undefined;
        line = await tx.stockTakeLine.create({
          data: {
            stockTakeId: take.id,
            partId: part?.id ?? null,
            partNumber: part?.partNumber ?? group.partNumber!,
            binLocation: st?.rackLocation ?? part?.binLocation ?? null,
            systemStock: st?.quantity ?? 0,
            addedDuringCount: true,
          },
        });
      }
      await tx.stockTakeCount.createMany({
        data: group.entries.map((e) => ({
          lineId: line!.id,
          sheetId,
          binLocation: e.binLocation?.trim().toUpperCase() || null,
          quantity: e.quantity,
          damagedQuantity: e.damagedQuantity ?? 0,
          remarks: e.remarks?.trim() || null,
          countedAt: e.countedAt ?? now,
          recordedById: actorId,
        })),
      });
      await tx.stockTakeLine.update({
        where: { id: line.id },
        data: {
          countedQuantity: (line.countedQuantity ?? 0) + group.quantity,
          damagedQuantity: line.damagedQuantity + group.damagedQuantity,
          countedBins: mergeBins(line.countedBins, group.bins),
          remarks: mergeRemarks(line.remarks, group.remarks),
          countedAt: group.countedAt ?? now,
          stockAtCount: line.stockAtCount ?? (part ? (stock.get(part.id)?.quantity ?? 0) : 0),
          ...(sheetId && { sheetId }),
        },
      });
    }
  }

  /** Parts never counted are taken as none on hand, measured against today's stock. */
  private async zeroUncounted(tx: Tx, take: { id: string; branchId: string }, actorId: string, opts: { sheetId?: string; remark: string }) {
    const lineWhere = opts.sheetId
      ? Prisma.sql`l."sheetId" = ${opts.sheetId}`
      : Prisma.sql`l."stockTakeId" = ${take.id}`;
    await tx.$executeRaw`
      INSERT INTO "StockTakeCount" ("id", "lineId", "sheetId", "quantity", "damagedQuantity", "remarks", "correction", "countedAt", "recordedById")
      SELECT gen_random_uuid()::text, l."id", ${opts.sheetId ?? null}, 0, 0, ${opts.remark}, ${!opts.sheetId}, (NOW() AT TIME ZONE 'UTC'), ${actorId}
        FROM "StockTakeLine" l
       WHERE ${lineWhere} AND l."partId" IS NOT NULL AND l."countedQuantity" IS NULL`;
    await tx.$executeRaw`
      UPDATE "StockTakeLine" l
         SET "countedQuantity" = 0,
             "countedAt" = (NOW() AT TIME ZONE 'UTC'),
             "stockAtCount" = COALESCE((SELECT s."quantity" FROM "InventoryStock" s WHERE s."branchId" = ${take.branchId} AND s."partId" = l."partId"), 0)
       WHERE ${lineWhere} AND l."partId" IS NOT NULL AND l."countedQuantity" IS NULL`;
  }

  // ── Corrections on the count (legacy Edit, logged in PhyStkTranLog) ───────

  async correctLine(id: string, lineId: string, input: { countedQuantity: number; damagedQuantity: number; remarks?: string }, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, [StockTakeStatus.ACTIVE]);
      const line = await tx.stockTakeLine.findFirst({ where: { id: lineId, stockTakeId: take.id } });
      if (!line) throw new NotFoundError("Part is not in this stock taking");
      const quantity = input.countedQuantity - (line.countedQuantity ?? 0);
      const damaged = input.damagedQuantity - line.damagedQuantity;
      if (line.countedQuantity != null && !quantity && !damaged && (input.remarks ?? line.remarks) === line.remarks) return;
      const current = line.partId ? (await this.stockOf(tx, take.branchId, [line.partId])).get(line.partId) : undefined;
      await tx.stockTakeCount.create({
        data: { lineId, quantity, damagedQuantity: damaged, remarks: input.remarks?.trim() || null, correction: true, recordedById: actorId },
      });
      await tx.stockTakeLine.update({
        where: { id: lineId },
        data: {
          countedQuantity: input.countedQuantity,
          damagedQuantity: input.damagedQuantity,
          remarks: input.remarks?.trim() || line.remarks,
          countedAt: line.countedAt ?? new Date(),
          stockAtCount: line.stockAtCount ?? current?.quantity ?? 0,
        },
      });
    }, TX_OPTIONS);
    return this.getStockTake(id);
  }

  /** Legacy "Not Required Part": set aside a counted part number that is not in Part Master. */
  async setNotRequired(id: string, lineId: string, notRequired: boolean) {
    await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, [StockTakeStatus.ACTIVE]);
      const line = await tx.stockTakeLine.findFirst({ where: { id: lineId, stockTakeId: take.id } });
      if (!line) throw new NotFoundError("Part is not in this stock taking");
      if (line.partId) throw new BadRequestError("Only part numbers not found in Part Master can be marked not required");
      await tx.stockTakeLine.update({ where: { id: lineId }, data: { notRequired } });
    });
    return this.getStockTake(id);
  }

  // ── Complete, confirm, bins ───────────────────────────────────────────────

  /**
   * Close counting (legacy status Completed). Every sheet must be uploaded, unknown part numbers
   * resolved or set aside, and every part counted; parts nobody counted are taken as none or removed.
   */
  async completeStockTake(id: string, input: { uncounted?: UncountedOnComplete }, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, [StockTakeStatus.ACTIVE]);
      const open = await tx.stockTakeSheet.findMany({ where: { stockTakeId: id, uploadedAt: null, cancelledAt: null }, select: { sheetNumber: true } });
      if (open.length) {
        throw new ConflictError(`Count sheet(s) ${open.map((s) => s.sheetNumber).join(", ")} are not uploaded yet. Upload or cancel them first.`);
      }
      await this.relinkUnknownParts(tx, take);
      const unknown = await tx.stockTakeLine.findMany({ where: { stockTakeId: id, partId: null, notRequired: false }, select: { partNumber: true } });
      if (unknown.length) {
        const list = unknown.slice(0, 5).map((l) => l.partNumber).join(", ");
        throw new BadRequestError(
          `${unknown.length} counted part number(s) are not in Part Master (${list}${unknown.length > 5 ? ", …" : ""}). Create them in Part Master, or mark them not required.`,
        );
      }
      const uncounted = await tx.stockTakeLine.count({ where: { stockTakeId: id, partId: { not: null }, countedQuantity: null } });
      if (uncounted && !input.uncounted) {
        throw new BadRequestError(`${uncounted} part(s) have not been counted. Count them, or choose to take them as none on hand or to remove them.`);
      }
      if (uncounted && input.uncounted === "ZERO") {
        await this.zeroUncounted(tx, take, actorId, { remark: "Not counted: taken as none on hand when completing" });
      }
      if (uncounted && input.uncounted === "REMOVE") {
        await tx.stockTakeLine.deleteMany({ where: { stockTakeId: id, partId: { not: null }, countedQuantity: null } });
      }
      await tx.stockTake.update({ where: { id }, data: { status: StockTakeStatus.COMPLETED, completedAt: new Date(), completedById: actorId } });
    }, TX_OPTIONS);
    return this.getStockTake(id);
  }

  /** Part numbers created in Part Master since they were counted join their part (legacy re-join on part number). */
  private async relinkUnknownParts(tx: Tx, take: { id: string; branchId: string; type: StockTakeType }) {
    const unknown = await tx.stockTakeLine.findMany({ where: { stockTakeId: take.id, partId: null } });
    if (!unknown.length) return;
    const parts = await tx.$queryRaw<{ id: string; partNumber: string; binLocation: string | null }[]>`
      SELECT "id", "partNumber", "binLocation" FROM "SparePart" WHERE UPPER("partNumber") = ANY(${unknown.map((l) => l.partNumber.toUpperCase())}::text[])`;
    if (!parts.length) return;
    const busy = await this.partsInOpenCounts(tx, take.branchId);
    const stock = await this.stockOf(tx, take.branchId, parts.map((p) => p.id));
    for (const line of unknown) {
      const part = parts.find((p) => p.partNumber.toUpperCase() === line.partNumber.toUpperCase());
      if (!part) continue;
      const same = await tx.stockTakeLine.findUnique({ where: { stockTakeId_partId: { stockTakeId: take.id, partId: part.id } } });
      if (same) {
        await tx.stockTakeCount.updateMany({ where: { lineId: line.id }, data: { lineId: same.id } });
        await tx.stockTakeLine.update({
          where: { id: same.id },
          data: {
            countedQuantity: (same.countedQuantity ?? 0) + (line.countedQuantity ?? 0),
            damagedQuantity: same.damagedQuantity + line.damagedQuantity,
            countedBins: mergeBins(same.countedBins, (line.countedBins ?? "").split("/")),
            remarks: mergeRemarks(same.remarks, line.remarks ? [line.remarks] : []),
            stockAtCount: same.stockAtCount ?? stock.get(part.id)?.quantity ?? 0,
            countedAt: same.countedAt ?? line.countedAt,
          },
        });
        await tx.stockTakeLine.delete({ where: { id: line.id } });
      } else if (take.type === StockTakeType.AUDIT || !busy.has(part.id)) {
        const st = stock.get(part.id);
        await tx.stockTakeLine.update({
          where: { id: line.id },
          data: {
            partId: part.id,
            partNumber: part.partNumber,
            notRequired: false,
            binLocation: st?.rackLocation ?? part.binLocation,
            systemStock: st?.quantity ?? 0,
            stockAtCount: st?.quantity ?? 0,
          },
        });
      }
    }
  }

  /**
   * Legacy S/E (shortage / excess) confirmation. Posts each part's discrepancy as an ADJUSTMENT on
   * today's stock and keeps the dealer rate it was valued at. Nothing is posted if any part would
   * go below zero or below its reserved stock.
   */
  async confirmStockTake(id: string, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, [StockTakeStatus.COMPLETED]);
      if (take.type === StockTakeType.AUDIT) throw new BadRequestError("A stock audit only reports shortage and excess; it does not adjust stock");
      const counted = await tx.stockTakeLine.findMany({
        where: { stockTakeId: id, partId: { not: null }, countedQuantity: { not: null } },
        select: { id: true, partId: true, partNumber: true, countedQuantity: true, damagedQuantity: true, stockAtCount: true, systemStock: true },
      });
      const adjustments = counted
        .map((line) => ({ line, quantity: discrepancy(line)! }))
        .filter((a) => a.quantity !== 0)
        .sort((a, b) => a.line.partId!.localeCompare(b.line.partId!));

      // Lock every part first, in part order, and check before posting anything.
      const locked = [];
      const problems: string[] = [];
      for (const a of adjustments) {
        const stock = await lockStock(tx, take.branchId, a.line.partId!);
        const result = adjustedStock(stock ?? { quantity: 0, reservedQuantity: 0 }, a.quantity);
        if (result.problem) problems.push(`${a.line.partNumber}: ${result.problem}`);
        locked.push({ ...a, stock });
      }
      if (problems.length) {
        throw new ConflictError(
          `Stock has moved since these parts were counted, so the shortage cannot be posted: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "; …" : ""}`,
        );
      }

      for (const { line, quantity, stock } of locked) {
        if (stock) {
          await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantity: { increment: quantity } } });
        } else {
          await tx.inventoryStock.create({ data: { branchId: take.branchId, partId: line.partId!, quantity } });
        }
      }
      for (const part of chunks(locked, 2000)) {
        await tx.stockTransaction.createMany({
          data: part.map(({ line, quantity }) => ({
            branchId: take.branchId,
            partId: line.partId!,
            type: "ADJUSTMENT",
            quantity,
            referenceId: take.id,
            notes: `Stock taking ${take.batchNumber}: ${quantity > 0 ? "excess" : "shortage"} (counted ${
              line.countedQuantity! + line.damagedQuantity
            }, system ${line.stockAtCount ?? line.systemStock})`,
            recordedById: actorId,
          })),
        });
      }
      // Keep the valuation: today's dealer rate, and what was posted for each counted part.
      await tx.$executeRaw`
        UPDATE "StockTakeLine" l
           SET "dealerRate" = p."unitPrice",
               "adjustedQuantity" = l."countedQuantity" + l."damagedQuantity" - COALESCE(l."stockAtCount", l."systemStock")
          FROM "SparePart" p
         WHERE p."id" = l."partId" AND l."stockTakeId" = ${take.id} AND l."countedQuantity" IS NOT NULL`;
      await tx.stockTake.update({ where: { id }, data: { status: StockTakeStatus.CONFIRMED, confirmedAt: new Date(), confirmedById: actorId } });
    }, TX_OPTIONS);
    return this.getStockTake(id);
  }

  /** Parts found in a bin other than the one on record (legacy Bin Location Updation). */
  async binProposals(id: string) {
    const take = await prisma.stockTake.findUnique({ where: { id }, select: { branchId: true } });
    if (!take) throw new NotFoundError("Stock taking not found");
    const lines = await prisma.stockTakeLine.findMany({
      where: { stockTakeId: id, partId: { not: null }, countedBins: { not: null } },
      select: { id: true, partId: true, partNumber: true, countedBins: true, part: { select: { name: true, partFlag: true, binLocation: true } } },
      orderBy: { partNumber: "asc" },
    });
    const stock = await this.stockOf(prisma, take.branchId, lines.map((l) => l.partId!));
    return lines
      .map((l) => ({
        lineId: l.id,
        partId: l.partId!,
        partNumber: l.partNumber,
        name: l.part?.name ?? "",
        partFlag: l.part?.partFlag ?? "",
        currentBin: stock.get(l.partId!)?.rackLocation ?? l.part?.binLocation ?? null,
        countedBins: l.countedBins!,
      }))
      .filter((l) => (l.currentBin ?? "").toUpperCase() !== l.countedBins.toUpperCase());
  }

  /** Legacy "Update Bin Location in Part Master": set the branch bin of each part, once per count. */
  async updateBins(id: string, lines: { lineId: string; binLocation: string }[], actorId: string) {
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      const take = await this.lockTake(tx, id, [StockTakeStatus.COMPLETED, StockTakeStatus.CONFIRMED]);
      if (take.type === StockTakeType.AUDIT) throw new BadRequestError("A stock audit does not change bin locations");
      if (take.binsUpdatedAt) throw new ConflictError("Bin locations from this count have already been updated");
      const found = await tx.stockTakeLine.findMany({
        where: { stockTakeId: id, id: { in: lines.map((l) => l.lineId) }, partId: { not: null } },
        select: { id: true, partId: true },
      });
      if (found.length !== lines.length) throw new BadRequestError("A bin line does not belong to this stock taking");
      const stock = await this.stockOf(tx, take.branchId, found.map((l) => l.partId!));
      for (const { lineId, binLocation } of lines) {
        const partId = found.find((l) => l.id === lineId)!.partId!;
        const bin = binLocation.trim().toUpperCase();
        const old = stock.get(partId)?.rackLocation;
        if ((old ?? "").toUpperCase() === bin) continue;
        await tx.inventoryStock.upsert({
          where: { branchId_partId: { branchId: take.branchId, partId } },
          update: { rackLocation: bin },
          create: { branchId: take.branchId, partId, quantity: 0, rackLocation: bin },
        });
        await recordBinChange(tx, partId, take.branchId, old, bin, actorId);
        updated++;
      }
      await tx.stockTake.update({ where: { id }, data: { binsUpdatedAt: new Date() } });
    }, TX_OPTIONS);
    return { stockTake: await this.getStockTake(id), updated };
  }
}

export default StockTakeService;
