/**
 * Stock transfer workflow (issue #62, Process A).
 *
 *   create/submit indent ──► approve ──► dispatch ──► receive
 *                              │            │            │
 *                              ▼            ▼            ▼
 *                        picking list   STN, cases,     SRN,
 *                        stock reserved packing list,   stock posted
 *                        back orders    MIT, stock      to requesting
 *                                       deducted once   branch
 *
 * Each action runs in one database transaction. Status changes are claimed
 * with a conditional update and stock rows are locked with SELECT ... FOR
 * UPDATE, so a double click or two users acting at once can never deduct or
 * post stock twice. Notifications are sent after the transaction commits.
 */
import {
  IndentStatus,
  MitSourceType,
  MitStatus,
  PartStatus,
  PickingListStatus,
  Prisma,
  StnStatus,
  TransferCaseStatus,
  PackingListStatus,
  TransportMode,
} from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { NotificationPayload, NotificationService } from "../notification/notification.service";
import {
  DOC_TYPES,
  DocType,
  assertTransition,
  buildProgress,
  formatDocumentNumber,
  isSameFamily,
  planCases,
  planPick,
  planReceipt,
  resolveDispatchQuantities,
  roundMoney,
  CaseInput,
  DispatchOverride,
  ReceiptInputLine,
} from "./stockTransfer.logic";

type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

export const TRANSFER_NOTIFICATION_TYPES = {
  INDENT_SUBMITTED: "INDENT_SUBMITTED",
  INDENT_APPROVED: "INDENT_APPROVED",
  INDENT_REJECTED: "INDENT_REJECTED",
  INDENT_CANCELLED: "INDENT_CANCELLED",
  MISSING_PARTS: "INDENT_MISSING_PARTS",
  PICKING_LIST_READY: "PICKING_LIST_READY",
  STN_DISPATCHED: "STN_DISPATCHED",
  SRN_CREATED: "SRN_CREATED",
  TRANSFER_RECEIVED: "TRANSFER_RECEIVED",
  TRANSFER_DISCREPANCY: "TRANSFER_DISCREPANCY",
  LOW_STOCK: "LOW_STOCK",
} as const;

// ── Shared selects ───────────────────────────────────────────────────────────

const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;
const branchSelect = { select: { id: true, name: true } } as const;
const partSelect = {
  select: {
    id: true,
    partNumber: true,
    partCode: true,
    name: true,
    description: true,
    uom: true,
    unitPrice: true,
    binLocation: true,
    storeLocation: true,
    role: true,
    mainPartId: true,
    partStatus: true,
  },
} as const;

const indentDetailInclude = {
  requestingBranch: branchSelect,
  sourceBranch: branchSelect,
  requestedBy: userSelect,
  approvedBy: userSelect,
  rejectedBy: userSelect,
  cancelledBy: userSelect,
  lines: {
    orderBy: { lineNumber: "asc" },
    include: { part: partSelect, jobCard: { select: { id: true, jobNumber: true } } },
  },
  statusHistory: { orderBy: { createdAt: "asc" }, include: { actor: userSelect } },
  pickingList: {
    include: {
      completedBy: userSelect,
      lines: { include: { part: partSelect, requestedPart: partSelect } },
    },
  },
  stn: {
    include: {
      dispatchedBy: userSelect,
      lines: { include: { part: partSelect, requestedPart: partSelect } },
      cases: { orderBy: { caseNumber: "asc" }, include: { lines: true } },
      packingList: true,
      mit: { include: { lines: { include: { part: partSelect } } } },
      srns: {
        orderBy: { createdAt: "asc" },
        include: { receivedBy: userSelect, lines: { include: { part: partSelect } } },
      },
    },
  },
} satisfies Prisma.BranchIndentInclude;

type IndentDetail = Prisma.BranchIndentGetPayload<{ include: typeof indentDetailInclude }>;

// ── Input types ──────────────────────────────────────────────────────────────

export interface CreateIndentInput {
  requestingBranchId: string;
  sourceBranchId: string;
  remarks?: string;
  authorisedBy?: string;
  authorisedAt?: Date;
  submit?: boolean;
  lines: {
    partId: string;
    partFlag?: string;
    urgentQuantity?: number;
    stockQuantity?: number;
    jobCardId?: string;
    jobNumber?: string;
    jobDate?: Date;
    vin?: string;
    registrationNumber?: string;
    vehicleModel?: string;
    remarks?: string;
  }[];
}

export interface ApproveIndentInput {
  remarks?: string;
  lines?: { lineId: string; approvedQuantity?: number; supplyPartId?: string }[];
}

export interface PickIndentInput {
  lines?: { lineId: string; supplyPartId?: string }[];
}

export interface DispatchIndentInput {
  taxForm?: string;
  transportMode?: TransportMode;
  remarks?: string;
  waybillNumber?: string;
  courierName?: string;
  consignmentWeight?: number;
  packerName?: string;
  lines?: DispatchOverride[];
  cases?: CaseInput[];
}

export interface ReceiveIndentInput {
  remarks?: string;
  taxForm?: string;
  closeShort?: boolean;
  lines?: ReceiptInputLine[];
}

export interface ListFilters {
  status?: IndentStatus;
  requestingBranchId?: string;
  sourceBranchId?: string;
  /** Restricts results to documents where this branch is either side. */
  scopeBranchId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ── Low-level helpers ────────────────────────────────────────────────────────

interface LockedStock {
  id: string;
  quantity: number;
  reservedQuantity: number;
  minimumStock: number;
}

async function lockStock(tx: Tx, branchId: string, partId: string): Promise<LockedStock | null> {
  const rows = await tx.$queryRaw<LockedStock[]>`
    SELECT "id", "quantity", "reservedQuantity", "minimumStock"
    FROM "InventoryStock"
    WHERE "branchId" = ${branchId} AND "partId" = ${partId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

export async function nextDocumentNumber(tx: Tx, docType: DocType, at = new Date()): Promise<string> {
  const year = at.getFullYear();
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "DocumentSequence" ("docType", "year", "lastValue", "updatedAt")
    VALUES (${docType}, ${year}, 1, NOW())
    ON CONFLICT ("docType", "year")
    DO UPDATE SET "lastValue" = "DocumentSequence"."lastValue" + 1, "updatedAt" = NOW()
    RETURNING "lastValue"`;
  return formatDocumentNumber(year, Number(rows[0].lastValue));
}

/** Atomically move an indent from one of the allowed statuses to a new one. */
async function claimStatus(
  tx: Tx,
  indentId: string,
  from: IndentStatus[],
  to: IndentStatus,
  data: Prisma.BranchIndentUncheckedUpdateManyInput = {},
): Promise<void> {
  const result = await tx.branchIndent.updateMany({
    where: { id: indentId, status: { in: from } },
    data: { ...data, status: to },
  });
  if (result.count !== 1) {
    throw new ConflictError(
      "This indent was changed by someone else or is no longer in a state that allows this action. Refresh and try again.",
    );
  }
}

async function recordHistory(
  tx: Tx,
  indentId: string,
  steps: { from: IndentStatus | null; to: IndentStatus; remarks?: string | null }[],
  actorId: string,
) {
  // Space entries by a millisecond so the history keeps its order when several stages complete together.
  const base = Date.now();
  await tx.transferStatusHistory.createMany({
    data: steps.map((step, index) => ({
      indentId,
      fromStatus: step.from,
      toStatus: step.to,
      actorId,
      remarks: step.remarks ?? null,
      createdAt: new Date(base + index),
    })),
  });
}

// ── Service ──────────────────────────────────────────────────────────────────

export class StockTransferService {
  private notifications = new NotificationService();

  // ── Read helpers ───────────────────────────────────────────────────────────

  async getIndentBranches(id: string) {
    const indent = await prisma.branchIndent.findUnique({
      where: { id },
      select: { id: true, requestingBranchId: true, sourceBranchId: true, status: true },
    });
    if (!indent) throw new NotFoundError("Indent not found");
    return indent;
  }

  async getIndent(id: string) {
    const indent = await prisma.branchIndent.findUnique({
      where: { id },
      include: indentDetailInclude,
    });
    if (!indent) throw new NotFoundError("Indent not found");
    return this.present(indent);
  }

  /** Adds per-line quantity summaries and the progress stepper to an indent. */
  private present(indent: IndentDetail) {
    const pickingLines = indent.pickingList?.lines ?? [];
    const stnLines = indent.stn?.lines ?? [];
    const mitLines = indent.stn?.mit?.lines ?? [];

    const lines = indent.lines.map((line) => {
      const picked = pickingLines
        .filter((p) => p.indentLineId === line.id && indent.pickingList?.status !== PickingListStatus.CANCELLED)
        .reduce((sum, p) => sum + p.pickedQuantity, 0);
      const lineStn = stnLines.filter((s) => s.indentLineId === line.id);
      const dispatched = lineStn.reduce((sum, s) => sum + s.quantity, 0);
      const lineMit = mitLines.filter((m) => lineStn.some((s) => s.id === m.stnLineId));
      const received = lineMit.reduce((sum, m) => sum + m.receivedQuantity, 0);
      const damaged = lineMit.reduce((sum, m) => sum + m.damagedQuantity, 0);
      const short = lineMit.reduce((sum, m) => sum + m.shortQuantity, 0);
      const approved = line.approvedQuantity;
      return {
        ...line,
        summary: {
          requested: line.requestedQuantity,
          approved,
          rejected: approved === null ? 0 : line.requestedQuantity - approved,
          picked,
          backOrder: line.backOrderQuantity,
          dispatched,
          received,
          damaged,
          short,
          inTransit: dispatched - received - damaged - short,
          suppliedWithAlternate: lineStn.some((s) => s.isAlternate),
        },
      };
    });

    return { ...indent, lines, progress: buildProgress(indent.statusHistory) };
  }

  async listIndents(filters: ListFilters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where: Prisma.BranchIndentWhereInput = {
      ...(filters.status && { status: filters.status }),
      ...(filters.requestingBranchId && { requestingBranchId: filters.requestingBranchId }),
      ...(filters.sourceBranchId && { sourceBranchId: filters.sourceBranchId }),
      ...(filters.scopeBranchId && {
        OR: [
          { requestingBranchId: filters.scopeBranchId },
          { sourceBranchId: filters.scopeBranchId },
        ],
      }),
      ...(filters.search && {
        AND: [
          {
            OR: [
              { indentNumber: { contains: filters.search } },
              { stn: { stnNumber: { contains: filters.search } } },
              { lines: { some: { part: { partNumber: { contains: filters.search, mode: "insensitive" } } } } },
              { lines: { some: { registrationNumber: { contains: filters.search, mode: "insensitive" } } } },
            ],
          },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.branchIndent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          requestingBranch: branchSelect,
          sourceBranch: branchSelect,
          requestedBy: userSelect,
          stn: { select: { id: true, stnNumber: true, status: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.branchIndent.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * Everything the indent form needs to prefill one part: Part Master fields,
   * stock at both branches, and alternates with their source stock.
   */
  async lookupPart(params: {
    partId?: string;
    partNumber?: string;
    requestingBranchId?: string;
    sourceBranchId?: string;
  }) {
    const part = await prisma.sparePart.findFirst({
      where: params.partId ? { id: params.partId } : { partNumber: params.partNumber },
      ...partSelect,
    });
    if (!part) throw new NotFoundError("Part not found");

    const rootId = part.mainPartId ?? part.id;
    const family = await prisma.sparePart.findMany({
      where: {
        id: { not: part.id },
        partStatus: PartStatus.ACTIVE,
        OR: [{ id: rootId }, { mainPartId: rootId }],
      },
      ...partSelect,
    });

    const branchIds = [params.requestingBranchId, params.sourceBranchId].filter(Boolean) as string[];
    const stocks = branchIds.length
      ? await prisma.inventoryStock.findMany({
          where: { branchId: { in: branchIds }, partId: { in: [part.id, ...family.map((f) => f.id)] } },
        })
      : [];
    const stockOf = (branchId: string | undefined, partId: string) => {
      const s = stocks.find((x) => x.branchId === branchId && x.partId === partId);
      return {
        quantity: s?.quantity ?? 0,
        reserved: s?.reservedQuantity ?? 0,
        available: (s?.quantity ?? 0) - (s?.reservedQuantity ?? 0),
        rackLocation: s?.rackLocation ?? null,
      };
    };

    return {
      part: { ...part, unitRate: part.unitPrice },
      requestingBranchStock: params.requestingBranchId ? stockOf(params.requestingBranchId, part.id) : null,
      sourceBranchStock: params.sourceBranchId ? stockOf(params.sourceBranchId, part.id) : null,
      alternates: family.map((alt) => ({
        part: { ...alt, unitRate: alt.unitPrice },
        sourceBranchStock: params.sourceBranchId ? stockOf(params.sourceBranchId, alt.id) : null,
      })),
    };
  }

  // ── 1. Create / submit ────────────────────────────────────────────────────

  async createIndent(input: CreateIndentInput, actorId: string) {
    if (input.requestingBranchId === input.sourceBranchId) {
      throw new BadRequestError("The requesting branch and the supplying branch must be different");
    }
    const branches = await prisma.branch.findMany({
      where: { id: { in: [input.requestingBranchId, input.sourceBranchId] } },
      select: { id: true, name: true, isActive: true },
    });
    const requesting = branches.find((b) => b.id === input.requestingBranchId);
    const source = branches.find((b) => b.id === input.sourceBranchId);
    if (!requesting) throw new NotFoundError("Requesting branch not found");
    if (!source) throw new NotFoundError("Supplying branch not found");
    if (!requesting.isActive || !source.isActive) throw new BadRequestError("Both branches must be active");

    const partIds = [...new Set(input.lines.map((l) => l.partId))];
    const parts = await prisma.sparePart.findMany({ where: { id: { in: partIds } } });
    const partMap = new Map(parts.map((p) => [p.id, p]));
    for (const id of partIds) {
      const part = partMap.get(id);
      if (!part) throw new NotFoundError(`Part ${id} not found`);
      if (part.partStatus !== PartStatus.ACTIVE) {
        throw new BadRequestError(`Part ${part.partNumber} is blocked and cannot be requested`);
      }
    }

    const jobCardIds = [...new Set(input.lines.map((l) => l.jobCardId).filter(Boolean))] as string[];
    const jobCards = jobCardIds.length
      ? await prisma.jobCard.findMany({
          where: { id: { in: jobCardIds } },
          include: { vehicle: { select: { vin: true, registrationNumber: true, model: true } } },
        })
      : [];
    const jobCardMap = new Map(jobCards.map((j) => [j.id, j]));
    for (const id of jobCardIds) {
      const jobCard = jobCardMap.get(id);
      if (!jobCard) throw new NotFoundError(`Job card ${id} not found`);
      if (jobCard.branchId !== input.requestingBranchId) {
        throw new BadRequestError(`Job card ${jobCard.jobNumber} belongs to a different branch`);
      }
    }

    const currentStock = await prisma.inventoryStock.findMany({
      where: { branchId: input.requestingBranchId, partId: { in: partIds } },
      select: { partId: true, quantity: true },
    });
    const stockMap = new Map(currentStock.map((s) => [s.partId, s.quantity]));

    const lineData = input.lines.map((line, index) => {
      const part = partMap.get(line.partId)!;
      const urgent = line.urgentQuantity ?? 0;
      const normal = line.stockQuantity ?? 0;
      const requested = urgent + normal;
      if (requested <= 0) {
        throw new BadRequestError(`Line ${index + 1}: enter an urgent or a stock quantity`);
      }
      const jobCard = line.jobCardId ? jobCardMap.get(line.jobCardId) : undefined;
      return {
        lineNumber: index + 1,
        partId: part.id,
        partFlag: line.partFlag ?? null,
        urgentQuantity: urgent,
        stockQuantity: normal,
        requestedQuantity: requested,
        unitRate: part.unitPrice,
        amount: roundMoney(part.unitPrice * requested),
        currentStock: stockMap.get(part.id) ?? 0,
        jobCardId: jobCard?.id ?? null,
        jobNumber: line.jobNumber ?? jobCard?.jobNumber ?? null,
        jobDate: line.jobDate ?? jobCard?.createdAt ?? null,
        vin: line.vin ?? jobCard?.vehicle?.vin ?? null,
        registrationNumber: line.registrationNumber ?? jobCard?.vehicle?.registrationNumber ?? null,
        vehicleModel: line.vehicleModel ?? jobCard?.vehicle?.model ?? null,
        remarks: line.remarks ?? null,
      };
    });

    const submit = input.submit !== false;
    const created = await prisma.$transaction(async (tx) => {
      const indentNumber = await nextDocumentNumber(tx, DOC_TYPES.INDENT);
      const now = new Date();
      const indent = await tx.branchIndent.create({
        data: {
          indentNumber,
          requestingBranchId: input.requestingBranchId,
          sourceBranchId: input.sourceBranchId,
          status: submit ? IndentStatus.SUBMITTED : IndentStatus.DRAFT,
          remarks: input.remarks,
          authorisedBy: input.authorisedBy,
          authorisedAt: input.authorisedAt ?? (input.authorisedBy ? now : undefined),
          requestedById: actorId,
          submittedAt: submit ? now : undefined,
          lines: { create: lineData },
        },
      });
      await recordHistory(
        tx,
        indent.id,
        submit
          ? [
              { from: null, to: IndentStatus.DRAFT },
              { from: IndentStatus.DRAFT, to: IndentStatus.SUBMITTED },
            ]
          : [{ from: null, to: IndentStatus.DRAFT }],
        actorId,
      );
      return indent;
    }, TX_OPTIONS);

    if (submit) await this.notifySubmitted(created.id);
    return this.getIndent(created.id);
  }

  async submitIndent(id: string, actorId: string) {
    const indent = await this.getIndentBranches(id);
    assertTransition(indent.status, "submit");
    await prisma.$transaction(async (tx) => {
      await claimStatus(tx, id, [IndentStatus.DRAFT], IndentStatus.SUBMITTED, { submittedAt: new Date() });
      await recordHistory(tx, id, [{ from: IndentStatus.DRAFT, to: IndentStatus.SUBMITTED }], actorId);
    }, TX_OPTIONS);
    await this.notifySubmitted(id);
    return this.getIndent(id);
  }

  // ── 2. Approve (auto-picks and reserves stock) ────────────────────────────

  async approveIndent(id: string, actorId: string, input: ApproveIndentInput = {}) {
    const indent = await this.getIndentBranches(id);
    assertTransition(indent.status, "approve");

    const outcome = await prisma.$transaction(async (tx) => {
      await claimStatus(tx, id, [IndentStatus.SUBMITTED], IndentStatus.APPROVED, {
        approvedById: actorId,
        approvedAt: new Date(),
        approvalRemarks: input.remarks ?? null,
      });
      await recordHistory(
        tx,
        id,
        [{ from: IndentStatus.SUBMITTED, to: IndentStatus.APPROVED, remarks: input.remarks }],
        actorId,
      );

      const lines = await tx.branchIndentLine.findMany({ where: { indentId: id } });
      const overrides = new Map((input.lines ?? []).map((l) => [l.lineId, l]));
      for (const lineId of overrides.keys()) {
        if (!lines.some((l) => l.id === lineId)) {
          throw new BadRequestError(`Line ${lineId} does not belong to this indent`);
        }
      }
      for (const line of lines) {
        const approved = overrides.get(line.id)?.approvedQuantity ?? line.requestedQuantity;
        if (!Number.isInteger(approved) || approved < 0 || approved > line.requestedQuantity) {
          throw new BadRequestError(
            `Line ${line.lineNumber}: approved quantity must be between 0 and ${line.requestedQuantity}`,
          );
        }
        await tx.branchIndentLine.update({ where: { id: line.id }, data: { approvedQuantity: approved } });
      }
      if (lines.every((l) => (overrides.get(l.id)?.approvedQuantity ?? l.requestedQuantity) === 0)) {
        throw new BadRequestError("At least one line must have an approved quantity; reject the indent instead");
      }

      return this.pickInTx(tx, id, indent.sourceBranchId, actorId, input.lines);
    }, TX_OPTIONS);

    await this.notifyApproved(id, outcome);
    return this.getIndent(id);
  }

  /** Re-runs picking for an approved indent where nothing could be picked earlier. */
  async pickIndent(id: string, actorId: string, input: PickIndentInput = {}) {
    const indent = await this.getIndentBranches(id);
    assertTransition(indent.status, "pick");
    const existing = await prisma.pickingList.findUnique({ where: { indentId: id } });
    if (existing) throw new ConflictError("A picking list already exists for this indent");

    const outcome = await prisma.$transaction(async (tx) => {
      // Lock the indent row so two pick attempts cannot run together.
      await claimStatus(tx, id, [IndentStatus.APPROVED], IndentStatus.APPROVED);
      return this.pickInTx(tx, id, indent.sourceBranchId, actorId, input.lines);
    }, TX_OPTIONS);

    if (outcome.pickedTotal === 0) {
      throw new ConflictError("Still no stock available at the supplying branch for any line");
    }
    await this.notifyApproved(id, outcome, true);
    return this.getIndent(id);
  }

  private async pickInTx(
    tx: Tx,
    indentId: string,
    sourceBranchId: string,
    actorId: string,
    supplyOverrides?: { lineId: string; supplyPartId?: string }[],
  ) {
    const lines = await tx.branchIndentLine.findMany({
      where: { indentId },
      orderBy: { lineNumber: "asc" },
      include: { part: true },
    });
    const supplyMap = new Map((supplyOverrides ?? []).map((l) => [l.lineId, l.supplyPartId]));
    const supplyIds = [...new Set([...supplyMap.values()].filter(Boolean))] as string[];
    const supplyParts = supplyIds.length
      ? await tx.sparePart.findMany({ where: { id: { in: supplyIds } } })
      : [];

    const planned: {
      indentLineId: string;
      requestedPartId: string;
      partId: string;
      isAlternate: boolean;
      availableQuantity: number;
      pickedQuantity: number;
      binLocation: string | null;
    }[] = [];
    const missing: { partNumber: string; name: string; quantity: number }[] = [];

    for (const line of lines) {
      const approved = line.approvedQuantity ?? 0;
      if (approved === 0) {
        await tx.branchIndentLine.update({ where: { id: line.id }, data: { backOrderQuantity: 0 } });
        continue;
      }
      let supplied = line.part;
      const supplyId = supplyMap.get(line.id);
      if (supplyId && supplyId !== line.partId) {
        const alt = supplyParts.find((p) => p.id === supplyId);
        if (!alt) throw new NotFoundError(`Supply part ${supplyId} not found`);
        if (alt.partStatus !== PartStatus.ACTIVE) {
          throw new BadRequestError(`Alternate part ${alt.partNumber} is blocked`);
        }
        if (!isSameFamily(line.part, alt)) {
          throw new BadRequestError(
            `Part ${alt.partNumber} is not an alternate of requested part ${line.part.partNumber}`,
          );
        }
        supplied = alt;
      }

      const stock = await lockStock(tx, sourceBranchId, supplied.id);
      const available = stock ? stock.quantity - stock.reservedQuantity : 0;
      const plan = planPick(approved, available);

      if (plan.pickedQuantity > 0 && stock) {
        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { reservedQuantity: { increment: plan.pickedQuantity } },
        });
        planned.push({
          indentLineId: line.id,
          requestedPartId: line.partId,
          partId: supplied.id,
          isAlternate: supplied.id !== line.partId,
          availableQuantity: Math.max(0, available),
          pickedQuantity: plan.pickedQuantity,
          binLocation: supplied.binLocation,
        });
      }
      if (plan.backOrderQuantity > 0) {
        missing.push({ partNumber: supplied.partNumber, name: supplied.name, quantity: plan.backOrderQuantity });
      }
      await tx.branchIndentLine.update({
        where: { id: line.id },
        data: { backOrderQuantity: plan.backOrderQuantity },
      });
    }

    const pickedTotal = planned.reduce((sum, p) => sum + p.pickedQuantity, 0);
    let pickingNumber: string | null = null;
    if (pickedTotal > 0) {
      pickingNumber = await nextDocumentNumber(tx, DOC_TYPES.PICKING);
      await tx.pickingList.create({
        data: {
          pickingNumber,
          indentId,
          branchId: sourceBranchId,
          createdById: actorId,
          lines: { create: planned },
        },
      });
      await claimStatus(tx, indentId, [IndentStatus.APPROVED], IndentStatus.PICKED);
      await recordHistory(
        tx,
        indentId,
        [
          {
            from: IndentStatus.APPROVED,
            to: IndentStatus.PICKED,
            remarks: `Picking list ${pickingNumber}: ${pickedTotal} unit(s) reserved`,
          },
        ],
        actorId,
      );
    }
    return { pickedTotal, pickingNumber, missing };
  }

  // ── 3. Reject / cancel ────────────────────────────────────────────────────

  async rejectIndent(id: string, actorId: string, reason: string) {
    const indent = await this.getIndentBranches(id);
    assertTransition(indent.status, "reject");
    await prisma.$transaction(async (tx) => {
      await claimStatus(tx, id, [IndentStatus.SUBMITTED], IndentStatus.REJECTED, {
        rejectedById: actorId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      });
      await recordHistory(tx, id, [{ from: IndentStatus.SUBMITTED, to: IndentStatus.REJECTED, remarks: reason }], actorId);
    }, TX_OPTIONS);

    const full = await prisma.branchIndent.findUniqueOrThrow({ where: { id }, include: { sourceBranch: true } });
    const payload = {
      type: TRANSFER_NOTIFICATION_TYPES.INDENT_REJECTED,
      title: "Indent rejected",
      message: `Indent ${full.indentNumber} was rejected by ${full.sourceBranch.name}: ${reason}`,
      link: this.link(id),
      branchId: full.requestingBranchId,
    };
    await this.notifyAudience(payload, {
      userIds: [full.requestedById],
      roles: [{ role: ROLES.BRANCH_STORE_MANAGER, branchId: full.requestingBranchId }],
    });
    return this.getIndent(id);
  }

  async cancelIndent(id: string, actorId: string, reason?: string) {
    const indent = await this.getIndentBranches(id);
    assertTransition(indent.status, "cancel");
    await prisma.$transaction(async (tx) => {
      const from = indent.status;
      await claimStatus(tx, id, [from], IndentStatus.CANCELLED, {
        cancelledById: actorId,
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
      });
      // Release any stock that picking reserved.
      const picking = await tx.pickingList.findUnique({ where: { indentId: id }, include: { lines: true } });
      if (picking && picking.status === PickingListStatus.OPEN) {
        for (const line of picking.lines) {
          const stock = await lockStock(tx, picking.branchId, line.partId);
          if (!stock || stock.reservedQuantity < line.pickedQuantity) {
            throw new ConflictError("Reserved stock does not match the picking list; contact an administrator");
          }
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { reservedQuantity: { decrement: line.pickedQuantity } },
          });
        }
        await tx.pickingList.update({ where: { id: picking.id }, data: { status: PickingListStatus.CANCELLED } });
      }
      await recordHistory(tx, id, [{ from, to: IndentStatus.CANCELLED, remarks: reason }], actorId);
    }, TX_OPTIONS);

    const full = await prisma.branchIndent.findUniqueOrThrow({ where: { id } });
    const payload = {
      type: TRANSFER_NOTIFICATION_TYPES.INDENT_CANCELLED,
      title: "Indent cancelled",
      message: `Indent ${full.indentNumber} was cancelled${reason ? `: ${reason}` : "."}`,
      link: this.link(id),
    };
    await this.notifyAudience(payload, {
      userIds: [full.requestedById],
      roles:
        indent.status === IndentStatus.DRAFT
          ? []
          : [{ role: ROLES.BRANCH_STORE_MANAGER, branchId: full.sourceBranchId }],
    });
    return this.getIndent(id);
  }

  // ── 4. Dispatch: STN + cases + packing list + stock deduction + MIT ───────

  async dispatchIndent(id: string, actorId: string, input: DispatchIndentInput = {}) {
    const indent = await this.getIndentBranches(id);
    assertTransition(indent.status, "dispatch");

    const result = await prisma.$transaction(async (tx) => {
      // Claiming the status first means a second dispatch attempt fails here,
      // before any stock is touched.
      await claimStatus(tx, id, [IndentStatus.PICKED], IndentStatus.IN_TRANSIT);

      const picking = await tx.pickingList.findUnique({
        where: { indentId: id },
        include: { lines: { include: { part: true, indentLine: true } } },
      });
      if (!picking || picking.status !== PickingListStatus.OPEN) {
        throw new ConflictError("This indent has no open picking list");
      }

      const dispatched = resolveDispatchQuantities(
        picking.lines.map((l) => ({ id: l.id, pickedQuantity: l.pickedQuantity })),
        input.lines,
      );
      const casePlans = planCases(dispatched, input.cases, input.packerName);
      const now = new Date();

      // Deduct stock exactly once and release the reservation for every picked line.
      const lowStock: { partId: string; name: string; quantity: number; minimumStock: number }[] = [];
      for (const line of picking.lines) {
        const qty = dispatched.get(line.id) ?? 0;
        const stock = await lockStock(tx, picking.branchId, line.partId);
        if (!stock || stock.reservedQuantity < line.pickedQuantity || stock.quantity < qty) {
          throw new ConflictError(
            `Stock for ${line.part.partNumber} no longer covers the picked quantity; dispatch was not posted`,
          );
        }
        const remaining = stock.quantity - qty;
        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: {
            quantity: { decrement: qty },
            reservedQuantity: { decrement: line.pickedQuantity },
          },
        });
        if (stock.minimumStock > 0 && remaining <= stock.minimumStock) {
          lowStock.push({ partId: line.partId, name: line.part.name, quantity: remaining, minimumStock: stock.minimumStock });
        }
        // Anything picked but not shipped goes back to back order on the indent line.
        const shortfall = line.pickedQuantity - qty;
        if (shortfall > 0) {
          await tx.branchIndentLine.update({
            where: { id: line.indentLineId },
            data: { backOrderQuantity: { increment: shortfall } },
          });
        }
      }

      // STN
      const stnNumber = await nextDocumentNumber(tx, DOC_TYPES.STN, now);
      const shipping = picking.lines.filter((l) => (dispatched.get(l.id) ?? 0) > 0);
      const stnLineData = shipping.map((l) => {
        const qty = dispatched.get(l.id)!;
        return {
          indentLineId: l.indentLineId,
          pickingLineId: l.id,
          requestedPartId: l.requestedPartId,
          partId: l.partId,
          isAlternate: l.isAlternate,
          quantity: qty,
          unitRate: l.part.unitPrice,
          amount: roundMoney(l.part.unitPrice * qty),
        };
      });
      const totalQuantity = stnLineData.reduce((sum, l) => sum + l.quantity, 0);
      const totalValue = roundMoney(stnLineData.reduce((sum, l) => sum + l.amount, 0));
      const stn = await tx.stockTransferNote.create({
        data: {
          stnNumber,
          indentId: id,
          pickingListId: picking.id,
          sourceBranchId: picking.branchId,
          destinationBranchId: indent.requestingBranchId,
          status: StnStatus.DISPATCHED,
          documentDate: now,
          taxForm: input.taxForm,
          transportMode: input.transportMode,
          remarks: input.remarks,
          stockDeducted: true,
          totalQuantity,
          totalValue,
          createdById: actorId,
          dispatchedById: actorId,
          dispatchedAt: now,
          lines: { create: stnLineData },
        },
        include: { lines: true },
      });
      const stnLineByPicking = new Map(stn.lines.map((l) => [l.pickingLineId, l]));

      for (const line of stn.lines) {
        await tx.stockTransaction.create({
          data: {
            branchId: picking.branchId,
            partId: line.partId,
            type: "TRANSFER_OUT",
            quantity: -line.quantity,
            referenceId: stn.id,
            notes: `STN ${stnNumber} to indent ${id}${line.isAlternate ? " (alternate supplied)" : ""}`,
            recordedById: actorId,
          },
        });
      }

      // Packing list and cases
      const packingNumber = await nextDocumentNumber(tx, DOC_TYPES.PACKING, now);
      const caseWeights = casePlans.map((c) => c.weight ?? 0);
      const packing = await tx.packingList.create({
        data: {
          packingNumber,
          stnId: stn.id,
          branchId: picking.branchId,
          status: PackingListStatus.DISPATCHED,
          dispatchMode: input.transportMode,
          waybillNumber: input.waybillNumber,
          courierName: input.courierName,
          consignmentWeight:
            input.consignmentWeight ?? (caseWeights.some((w) => w > 0) ? caseWeights.reduce((a, b) => a + b, 0) : null),
          packingDate: now,
          dispatchedAt: now,
          remarks: input.remarks,
          createdById: actorId,
        },
      });

      const caseNumbersByStnLine = new Map<string, string[]>();
      for (const plan of casePlans) {
        const caseNumber = await nextDocumentNumber(tx, DOC_TYPES.CASE, now);
        await tx.transferCase.create({
          data: {
            caseNumber,
            stnId: stn.id,
            packingListId: packing.id,
            branchId: picking.branchId,
            status: TransferCaseStatus.DISPATCHED,
            packerName: plan.packerName,
            weight: plan.weight,
            totalQuantity: plan.lines.reduce((sum, l) => sum + l.quantity, 0),
            createdById: actorId,
            lines: {
              create: plan.lines.map((l) => {
                const stnLine = stnLineByPicking.get(l.pickingLineId)!;
                caseNumbersByStnLine.set(stnLine.id, [...(caseNumbersByStnLine.get(stnLine.id) ?? []), caseNumber]);
                return { stnLineId: stnLine.id, quantity: l.quantity };
              }),
            },
          },
        });
      }

      // Internal material in transit
      const mitNumber = await nextDocumentNumber(tx, DOC_TYPES.MIT, now);
      const mit = await tx.materialInTransit.create({
        data: {
          mitNumber,
          sourceType: MitSourceType.INTERNAL_TRANSFER,
          status: MitStatus.IN_TRANSIT,
          stnId: stn.id,
          sourceBranchId: picking.branchId,
          destinationBranchId: indent.requestingBranchId,
          dispatchMode: input.transportMode,
          waybillNumber: input.waybillNumber,
          transitDate: now,
          totalCases: casePlans.length,
          totalQuantity,
          totalAmount: totalValue,
          remarks: input.remarks,
          createdById: actorId,
          lines: {
            create: stn.lines.map((l) => ({
              stnLineId: l.id,
              partId: l.partId,
              requestedPartId: l.requestedPartId,
              caseNumbers: (caseNumbersByStnLine.get(l.id) ?? []).join(","),
              quantity: l.quantity,
              unitPrice: l.unitRate,
              amount: l.amount,
            })),
          },
        },
      });

      await tx.pickingList.update({
        where: { id: picking.id },
        data: { status: PickingListStatus.COMPLETED, completedById: actorId, completedAt: now },
      });

      await recordHistory(
        tx,
        id,
        [
          { from: IndentStatus.PICKED, to: IndentStatus.STN_CREATED, remarks: `STN ${stnNumber}` },
          {
            from: IndentStatus.STN_CREATED,
            to: IndentStatus.PACKED,
            remarks: `Packing list ${packingNumber}, ${casePlans.length} case(s)`,
          },
          { from: IndentStatus.PACKED, to: IndentStatus.DISPATCHED, remarks: input.waybillNumber ? `Waybill ${input.waybillNumber}` : null },
          { from: IndentStatus.DISPATCHED, to: IndentStatus.IN_TRANSIT, remarks: `MIT ${mitNumber}` },
        ],
        actorId,
      );

      return {
        stnNumber,
        packingNumber,
        mitNumber,
        caseCount: casePlans.length,
        totalQuantity,
        sourceBranchId: picking.branchId,
        lowStock,
        mitId: mit.id,
      };
    }, TX_OPTIONS);

    await this.notifyDispatched(id, result);
    return this.getIndent(id);
  }

  // ── 5. Receive: SRN + stock posting ───────────────────────────────────────

  async receiveIndent(id: string, actorId: string, input: ReceiveIndentInput = {}) {
    const indent = await this.getIndentBranches(id);
    assertTransition(indent.status, "receive");

    const result = await prisma.$transaction(async (tx) => {
      // Lock the indent row: concurrent receipts queue here and re-read fresh tallies.
      const locked = await tx.$queryRaw<{ status: IndentStatus }[]>`
        SELECT "status" FROM "BranchIndent" WHERE "id" = ${id} FOR UPDATE`;
      const current = locked[0]?.status;
      if (!current) throw new NotFoundError("Indent not found");
      assertTransition(current, "receive");

      const stn = await tx.stockTransferNote.findUnique({
        where: { indentId: id },
        include: { mit: { include: { lines: true } } },
      });
      if (!stn || !stn.mit) throw new ConflictError("This indent has no material in transit to receive");
      const mit = stn.mit;

      const plan = planReceipt(mit.lines, input.lines, input.closeShort === true);
      const now = new Date();
      const srnNumber = await nextDocumentNumber(tx, DOC_TYPES.SRN, now);
      const mitLineMap = new Map(mit.lines.map((l) => [l.id, l]));

      const srn = await tx.stockReceiptNote.create({
        data: {
          srnNumber,
          mitId: mit.id,
          stnId: stn.id,
          receivingBranchId: stn.destinationBranchId,
          sourceBranchId: stn.sourceBranchId,
          receiptDate: now,
          taxForm: input.taxForm ?? stn.taxForm,
          transportMode: stn.transportMode,
          remarks: input.remarks,
          totalReceived: plan.totals.received,
          totalDamaged: plan.totals.damaged,
          totalShort: plan.totals.short,
          receivedById: actorId,
          lines: {
            create: plan.lines.map((l) => ({
              mitLineId: l.mitLineId,
              partId: mitLineMap.get(l.mitLineId)!.partId,
              receivedQuantity: l.receivedQuantity,
              damagedQuantity: l.damagedQuantity,
              shortQuantity: l.shortQuantity,
              remarks: l.remarks,
            })),
          },
        },
      });

      for (const line of plan.lines) {
        const mitLine = mitLineMap.get(line.mitLineId)!;
        // The database check constraint rejects any update that would receive more than was sent.
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
            where: { branchId_partId: { branchId: stn.destinationBranchId, partId: mitLine.partId } },
            update: { quantity: { increment: line.receivedQuantity } },
            create: {
              branchId: stn.destinationBranchId,
              partId: mitLine.partId,
              quantity: line.receivedQuantity,
            },
          });
          await tx.stockTransaction.create({
            data: {
              branchId: stn.destinationBranchId,
              partId: mitLine.partId,
              type: "TRANSFER_IN",
              quantity: line.receivedQuantity,
              referenceId: srn.id,
              notes: `SRN ${srnNumber} against STN ${stn.stnNumber}`,
              recordedById: actorId,
            },
          });
        }
      }

      const nextStatus = plan.fullyAccounted ? IndentStatus.COMPLETED : IndentStatus.PARTIALLY_RECEIVED;
      await claimStatus(tx, id, [current], nextStatus, plan.fullyAccounted ? { completedAt: now } : {});
      await tx.materialInTransit.update({
        where: { id: mit.id },
        data: { status: plan.fullyAccounted ? MitStatus.RECEIVED : MitStatus.PARTIALLY_RECEIVED },
      });
      await tx.stockTransferNote.update({
        where: { id: stn.id },
        data: { status: plan.fullyAccounted ? StnStatus.RECEIVED : StnStatus.PARTIALLY_RECEIVED },
      });
      if (plan.fullyAccounted) {
        await tx.transferCase.updateMany({ where: { stnId: stn.id }, data: { status: TransferCaseStatus.RECEIVED } });
      }

      const totalsText = `received ${plan.totals.received}, damaged ${plan.totals.damaged}, short ${plan.totals.short}`;
      await recordHistory(
        tx,
        id,
        plan.fullyAccounted
          ? [
              { from: current, to: IndentStatus.SRN_CREATED, remarks: `SRN ${srnNumber}: ${totalsText}` },
              { from: IndentStatus.SRN_CREATED, to: IndentStatus.RECEIVED },
              { from: IndentStatus.RECEIVED, to: IndentStatus.COMPLETED },
            ]
          : [
              { from: current, to: IndentStatus.SRN_CREATED, remarks: `SRN ${srnNumber}: ${totalsText}` },
              { from: IndentStatus.SRN_CREATED, to: IndentStatus.PARTIALLY_RECEIVED },
            ],
        actorId,
      );

      return {
        srnNumber,
        stnNumber: stn.stnNumber,
        fullyAccounted: plan.fullyAccounted,
        totals: plan.totals,
        sourceBranchId: stn.sourceBranchId,
        receivingBranchId: stn.destinationBranchId,
      };
    }, TX_OPTIONS);

    await this.notifyReceived(id, result);
    return this.getIndent(id);
  }

  // ── Document views ─────────────────────────────────────────────────────────

  private scopeEither(scopeBranchId: string | undefined, a: string, b: string) {
    return scopeBranchId ? { OR: [{ [a]: scopeBranchId }, { [b]: scopeBranchId }] } : {};
  }

  async listPickingLists(scopeBranchId?: string, status?: PickingListStatus) {
    return prisma.pickingList.findMany({
      where: {
        ...(status && { status }),
        ...(scopeBranchId && {
          OR: [{ branchId: scopeBranchId }, { indent: { requestingBranchId: scopeBranchId } }],
        }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        branch: branchSelect,
        indent: { select: { id: true, indentNumber: true, requestingBranch: branchSelect } },
        lines: { include: { part: partSelect, requestedPart: partSelect } },
      },
      take: 200,
    });
  }

  async getPickingList(id: string) {
    const doc = await prisma.pickingList.findUnique({
      where: { id },
      include: {
        branch: branchSelect,
        indent: { select: { id: true, indentNumber: true, requestingBranchId: true, sourceBranchId: true } },
        lines: { include: { part: partSelect, requestedPart: partSelect, indentLine: true } },
      },
    });
    if (!doc) throw new NotFoundError("Picking list not found");
    return doc;
  }

  async listStns(scopeBranchId?: string, status?: StnStatus) {
    return prisma.stockTransferNote.findMany({
      where: {
        ...(status && { status }),
        ...this.scopeEither(scopeBranchId, "sourceBranchId", "destinationBranchId"),
      },
      orderBy: { createdAt: "desc" },
      include: {
        sourceBranch: branchSelect,
        destinationBranch: branchSelect,
        indent: { select: { id: true, indentNumber: true } },
        mit: { select: { id: true, mitNumber: true, status: true } },
        _count: { select: { lines: true, cases: true } },
      },
      take: 200,
    });
  }

  async getStn(id: string) {
    const doc = await prisma.stockTransferNote.findUnique({
      where: { id },
      include: {
        sourceBranch: branchSelect,
        destinationBranch: branchSelect,
        createdBy: userSelect,
        dispatchedBy: userSelect,
        indent: { select: { id: true, indentNumber: true } },
        lines: { include: { part: partSelect, requestedPart: partSelect } },
        cases: { include: { lines: true } },
        packingList: true,
        mit: { select: { id: true, mitNumber: true, status: true } },
        srns: { select: { id: true, srnNumber: true, receiptDate: true } },
      },
    });
    if (!doc) throw new NotFoundError("STN not found");
    return doc;
  }

  async getCase(id: string) {
    const doc = await prisma.transferCase.findUnique({
      where: { id },
      include: {
        branch: branchSelect,
        stn: { select: { id: true, stnNumber: true, sourceBranchId: true, destinationBranchId: true } },
        packingList: { select: { id: true, packingNumber: true } },
        lines: { include: { stnLine: { include: { part: partSelect, requestedPart: partSelect } } } },
      },
    });
    if (!doc) throw new NotFoundError("Case not found");
    return doc;
  }

  async getPackingList(id: string) {
    const doc = await prisma.packingList.findUnique({
      where: { id },
      include: {
        branch: branchSelect,
        createdBy: userSelect,
        stn: { select: { id: true, stnNumber: true, sourceBranchId: true, destinationBranchId: true } },
        cases: { include: { lines: { include: { stnLine: { include: { part: partSelect } } } } } },
      },
    });
    if (!doc) throw new NotFoundError("Packing list not found");
    return doc;
  }

  async listMits(scopeBranchId?: string, filters: { status?: MitStatus; sourceType?: MitSourceType } = {}) {
    return prisma.materialInTransit.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.sourceType && { sourceType: filters.sourceType }),
        ...this.scopeEither(scopeBranchId, "sourceBranchId", "destinationBranchId"),
      },
      orderBy: { createdAt: "desc" },
      include: {
        sourceBranch: branchSelect,
        destinationBranch: branchSelect,
        stn: { select: { id: true, stnNumber: true, indentId: true } },
        _count: { select: { lines: true, srns: true } },
      },
      take: 200,
    });
  }

  async getMit(id: string) {
    const doc = await prisma.materialInTransit.findUnique({
      where: { id },
      include: {
        sourceBranch: branchSelect,
        destinationBranch: branchSelect,
        createdBy: userSelect,
        stn: { select: { id: true, stnNumber: true, indentId: true } },
        lines: { include: { part: partSelect, requestedPart: partSelect } },
        srns: { select: { id: true, srnNumber: true, receiptDate: true } },
      },
    });
    if (!doc) throw new NotFoundError("MIT not found");
    return doc;
  }

  async listSrns(scopeBranchId?: string) {
    return prisma.stockReceiptNote.findMany({
      where: this.scopeEither(scopeBranchId, "receivingBranchId", "sourceBranchId"),
      orderBy: { createdAt: "desc" },
      include: {
        receivingBranch: branchSelect,
        sourceBranch: branchSelect,
        receivedBy: userSelect,
        stn: { select: { id: true, stnNumber: true, indentId: true } },
        mit: { select: { id: true, mitNumber: true } },
      },
      take: 200,
    });
  }

  async getSrn(id: string) {
    const doc = await prisma.stockReceiptNote.findUnique({
      where: { id },
      include: {
        receivingBranch: branchSelect,
        sourceBranch: branchSelect,
        receivedBy: userSelect,
        stn: { select: { id: true, stnNumber: true, indentId: true } },
        mit: { select: { id: true, mitNumber: true } },
        lines: { include: { part: partSelect, mitLine: true } },
      },
    });
    if (!doc) throw new NotFoundError("SRN not found");
    return doc;
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  private link(indentId: string) {
    return `/transfers/indents/${indentId}`;
  }

  /**
   * Sends one notification per person, even when someone qualifies twice
   * (for example the requester is also the branch store manager).
   */
  private async notifyAudience(
    payload: NotificationPayload,
    audience: { userIds?: string[]; roles?: { role: string; branchId?: string }[] },
  ) {
    const roles = audience.roles ?? [];
    const roleUsers = roles.length
      ? await prisma.user.findMany({
          where: {
            isActive: true,
            OR: roles.map((r) => ({ role: { name: r.role }, ...(r.branchId ? { branchId: r.branchId } : {}) })),
          },
          select: { id: true },
        })
      : [];
    await this.notifications.notifyUsers(
      [...(audience.userIds ?? []), ...roleUsers.map((u) => u.id)],
      { ...payload, branchId: payload.branchId ?? null },
    );
  }

  private async notifySubmitted(id: string) {
    const indent = await prisma.branchIndent.findUniqueOrThrow({
      where: { id },
      include: { requestingBranch: true, _count: { select: { lines: true } } },
    });
    const payload = {
      type: TRANSFER_NOTIFICATION_TYPES.INDENT_SUBMITTED,
      title: "New branch indent",
      message: `${indent.requestingBranch.name} submitted indent ${indent.indentNumber} with ${indent._count.lines} line(s).`,
      link: this.link(id),
    };
    await this.notifyAudience(
      { ...payload, branchId: indent.sourceBranchId },
      {
        roles: [
          { role: ROLES.BRANCH_STORE_MANAGER, branchId: indent.sourceBranchId },
          { role: ROLES.GENERAL_STORE_MANAGER },
        ],
      },
    );
  }

  private async notifyApproved(
    id: string,
    outcome: { pickedTotal: number; pickingNumber: string | null; missing: { partNumber: string; name: string; quantity: number }[] },
    repick = false,
  ) {
    const indent = await prisma.branchIndent.findUniqueOrThrow({
      where: { id },
      include: { sourceBranch: true, requestingBranch: true },
    });
    if (!repick) {
      const approved = {
        type: TRANSFER_NOTIFICATION_TYPES.INDENT_APPROVED,
        title: "Indent approved",
        message:
          `Indent ${indent.indentNumber} was approved by ${indent.sourceBranch.name}.` +
          (outcome.missing.length ? ` ${outcome.missing.length} line(s) are on back order.` : ""),
        link: this.link(id),
        branchId: indent.requestingBranchId,
      };
      await this.notifyAudience(approved, {
        userIds: [indent.requestedById],
        roles: [{ role: ROLES.BRANCH_STORE_MANAGER, branchId: indent.requestingBranchId }],
      });
    }
    if (outcome.pickingNumber) {
      await this.notifications.notifyRole(ROLES.BRANCH_STORE_MANAGER, indent.sourceBranchId, {
        type: TRANSFER_NOTIFICATION_TYPES.PICKING_LIST_READY,
        title: "Picking list ready",
        message: `Picking list ${outcome.pickingNumber} for indent ${indent.indentNumber} (${outcome.pickedTotal} unit(s)) is ready to dispatch to ${indent.requestingBranch.name}.`,
        link: this.link(id),
      });
    }
    if (outcome.missing.length) {
      const list = outcome.missing.map((m) => `${m.partNumber} x${m.quantity}`).join(", ");
      await this.notifications.notifyRole(ROLES.GENERAL_STORE_MANAGER, undefined, {
        type: TRANSFER_NOTIFICATION_TYPES.MISSING_PARTS,
        title: "Parts missing for indent",
        message: `${indent.sourceBranch.name} cannot supply for indent ${indent.indentNumber}: ${list}. These are on back order.`,
        link: this.link(id),
      });
    }
  }

  private async notifyDispatched(
    id: string,
    result: {
      stnNumber: string;
      packingNumber: string;
      mitNumber: string;
      caseCount: number;
      totalQuantity: number;
      sourceBranchId: string;
      lowStock: { partId: string; name: string; quantity: number; minimumStock: number }[];
    },
  ) {
    const indent = await prisma.branchIndent.findUniqueOrThrow({
      where: { id },
      include: { sourceBranch: true, stn: { include: { packingList: true } } },
    });
    const waybill = indent.stn?.packingList?.waybillNumber;
    // One consolidated message replaces separate STN, case, packing and MIT alerts,
    // because the system creates all of them in the same step.
    const payload = {
      type: TRANSFER_NOTIFICATION_TYPES.STN_DISPATCHED,
      title: "Stock dispatched to your branch",
      message:
        `${indent.sourceBranch.name} dispatched STN ${result.stnNumber} for indent ${indent.indentNumber}: ` +
        `${result.totalQuantity} unit(s) in ${result.caseCount} case(s), MIT ${result.mitNumber}` +
        (waybill ? `, waybill ${waybill}` : "") +
        ".",
      link: this.link(id),
      branchId: indent.requestingBranchId,
    };
    await this.notifyAudience(payload, {
      userIds: [indent.requestedById],
      roles: [{ role: ROLES.BRANCH_STORE_MANAGER, branchId: indent.requestingBranchId }],
    });

    for (const item of result.lowStock) {
      const low = {
        type: TRANSFER_NOTIFICATION_TYPES.LOW_STOCK,
        title: "Low stock alert",
        message: `Stock for ${item.name} is low (${item.quantity} remaining, minimum ${item.minimumStock}).`,
        link: `/inventory/${item.partId}`,
      };
      await this.notifyAudience(
        { ...low, branchId: result.sourceBranchId },
        {
          roles: [
            { role: ROLES.BRANCH_STORE_MANAGER, branchId: result.sourceBranchId },
            { role: ROLES.GENERAL_STORE_MANAGER },
          ],
        },
      );
    }
  }

  private async notifyReceived(
    id: string,
    result: {
      srnNumber: string;
      stnNumber: string;
      fullyAccounted: boolean;
      totals: { received: number; damaged: number; short: number };
      sourceBranchId: string;
      receivingBranchId: string;
    },
  ) {
    const indent = await prisma.branchIndent.findUniqueOrThrow({ where: { id }, include: { requestingBranch: true } });
    const payload = {
      type: result.fullyAccounted
        ? TRANSFER_NOTIFICATION_TYPES.TRANSFER_RECEIVED
        : TRANSFER_NOTIFICATION_TYPES.SRN_CREATED,
      title: result.fullyAccounted ? "Transfer received" : "Transfer partly received",
      message:
        `${indent.requestingBranch.name} posted SRN ${result.srnNumber} against STN ${result.stnNumber}: ` +
        `${result.totals.received} received` +
        (result.totals.damaged ? `, ${result.totals.damaged} damaged` : "") +
        (result.totals.short ? `, ${result.totals.short} short` : "") +
        (result.fullyAccounted ? ". The transfer is closed." : ". Some items are still outstanding."),
      link: this.link(id),
    };
    await this.notifyAudience(
      { ...payload, branchId: result.sourceBranchId },
      {
        roles: [
          { role: ROLES.BRANCH_STORE_MANAGER, branchId: result.sourceBranchId },
          { role: ROLES.GENERAL_STORE_MANAGER },
        ],
      },
    );

    if (result.totals.damaged > 0 || result.totals.short > 0) {
      await this.notifications.notifyRole(ROLES.GENERAL_STORE_MANAGER, undefined, {
        type: TRANSFER_NOTIFICATION_TYPES.TRANSFER_DISCREPANCY,
        title: "Transfer discrepancy",
        message: `SRN ${result.srnNumber} for STN ${result.stnNumber} recorded ${result.totals.damaged} damaged and ${result.totals.short} short unit(s).`,
        link: this.link(id),
      });
    }
  }
}

export default StockTransferService;
