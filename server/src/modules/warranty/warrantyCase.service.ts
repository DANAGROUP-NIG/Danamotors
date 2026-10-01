import {
  ChargeType,
  JobCardLineKind,
  Prisma,
  WarrantyCaseStatus,
  WarrantyCoverageStatus,
  WarrantyLineRole,
} from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { ROLES } from "../../shared/constants/roles";
import { nextSequenceNumber } from "../../shared/db/documentSequence";
import { NOTIFICATION_TYPES, NotificationPayload, NotificationService } from "../notification/notification.service";
import {
  CaseState,
  EDITABLE_CASE_STATUSES,
  WarrantyCaseAction,
  actionPast,
  allowedActions,
  label,
  lineAmounts,
  planTransition,
  round2,
} from "./warranty.logic";

type Tx = Prisma.TransactionClient;

export const WARRANTY_CASE_DOC_TYPE = "WTY";
const CASE_NUMBER_PREFIX = "WTY";

const personSelect = { id: true, firstName: true, lastName: true } as const;

const caseDetailInclude = {
  jobCard: {
    select: {
      id: true,
      jobNumber: true,
      description: true,
      status: true,
      createdAt: true,
      mileage: true,
      warrantyStatusAtCreation: true,
      createdById: true,
      invoices: { select: { id: true, invoiceNumber: true, issuedDate: true, status: true }, orderBy: { issuedDate: "asc" } },
    },
  },
  vehicle: {
    select: {
      id: true,
      vin: true,
      registrationNumber: true,
      make: true,
      model: true,
      trim: true,
      year: true,
      warrantyStartDate: true,
      lastRecordedMileage: true,
      vehicleModel: { select: { id: true, code: true, name: true } },
    },
  },
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true } },
  branch: { select: { id: true, name: true } },
  complaintCode: true,
  rejectReason: true,
  assignedOfficer: { select: personSelect },
  createdBy: { select: personSelect },
  lines: {
    orderBy: { seq: "asc" },
    include: {
      defectCode: true,
      positionCode: true,
      sparePart: { select: { id: true, partNumber: true, name: true, warrantyApplicable: true } },
    },
  },
  statusHistory: { orderBy: { createdAt: "desc" }, include: { actor: { select: personSelect } } },
} satisfies Prisma.WarrantyCaseInclude;

export type WarrantyCaseDetail = Prisma.WarrantyCaseGetPayload<{ include: typeof caseDetailInclude }>;

// ── Progress stepper ─────────────────────────────────────────────────────────

const STEPS: { key: string; label: string; statuses: WarrantyCaseStatus[] }[] = [
  { key: "OPEN", label: "Open", statuses: ["OPEN"] },
  { key: "IN_REVIEW", label: "In review", statuses: ["IN_REVIEW"] },
  { key: "SUBMITTED", label: "Submitted", statuses: ["SUBMITTED"] },
  { key: "DECISION", label: "Decision", statuses: ["APPROVED", "PARTIALLY_APPROVED", "REJECTED", "RETURNED"] },
  { key: "SETTLED", label: "Settled", statuses: ["SETTLED"] },
  { key: "CLOSED", label: "Closed", statuses: ["CLOSED"] },
];

const RANK: Record<WarrantyCaseStatus, number> = {
  OPEN: 0,
  IN_REVIEW: 1,
  SUBMITTED: 2,
  APPROVED: 3,
  PARTIALLY_APPROVED: 3,
  REJECTED: 3,
  RETURNED: 3,
  SETTLED: 4,
  CLOSED: 5,
};

function buildProgress(detail: WarrantyCaseDetail) {
  const history = [...detail.statusHistory].reverse(); // oldest first
  const rank = RANK[detail.status];
  // A returned case is being reworked: steps after "In review" are pending again.
  const effectiveRank = detail.status === "IN_REVIEW" ? 1 : rank;
  const closedWithout = (key: string) =>
    detail.status === "CLOSED" && !history.some((h) => STEPS.find((s) => s.key === key)!.statuses.includes(h.toStatus));
  return STEPS.map((step, index) => {
    const entries = history.filter((h) => step.statuses.includes(h.toStatus));
    const last = entries[entries.length - 1];
    const completed = index <= effectiveRank && (Boolean(last) || index === 0);
    return {
      key: step.key,
      label: step.key === "DECISION" && last && completed ? label(last.toStatus).replace(/^./, (c) => c.toUpperCase()) : step.label,
      completed,
      skipped: !completed && closedWithout(step.key) && index < 5,
      at: completed ? last?.createdAt ?? detail.createdAt : null,
      by: completed ? last?.actor ?? null : null,
    };
  });
}

function presentCase(detail: WarrantyCaseDetail) {
  const billDate = detail.jobCard?.invoices.find((i) => !/cancel|void/i.test(i.status))?.issuedDate ?? null;
  return {
    ...detail,
    billDate,
    allowedActions: allowedActions(detail.status),
    editable: EDITABLE_CASE_STATUSES.includes(detail.status),
    progress: buildProgress(detail),
  };
}

// ── Notifications ────────────────────────────────────────────────────────────

/** Notifies the branch's warranty officers, or every warranty officer when the branch has none. */
export async function notifyWarrantyOfficers(branchId: string, payload: NotificationPayload) {
  const notifications = new NotificationService();
  const atBranch = await prisma.user.count({ where: { role: { name: ROLES.WARRANTY_OFFICER }, isActive: true, branchId } });
  await notifications.notifyRole(ROLES.WARRANTY_OFFICER, atBranch > 0 ? branchId : undefined, { ...payload, branchId });
}

// ── Service ──────────────────────────────────────────────────────────────────

export interface CaseListFilters {
  status?: WarrantyCaseStatus;
  scopeBranchId?: string;
  branchId?: string;
  from?: Date;
  to?: Date;
  basedOn?: "CASE_DATE" | "BILL_DATE";
  claimNo?: "GENERATED" | "NOT_GENERATED";
  billing?: "BILLED" | "UNBILLED";
  search?: string;
  page?: number;
  limit?: number;
}

export class WarrantyCaseService {
  /**
   * Opens a case for a job card inside the caller's transaction. Idempotent:
   * returns the existing case when the job card already has one.
   */
  async openForJobCard(
    tx: Tx,
    input: {
      jobCardId: string;
      vehicleId: string;
      customerId: string | null;
      branchId: string;
      complaint: string;
      mileage: number | null;
      coverageStatus: WarrantyCoverageStatus | null;
      actorId: string | null;
      automatic: boolean;
    },
  ) {
    const existing = await tx.warrantyCase.findUnique({ where: { jobCardId: input.jobCardId } });
    if (existing) return existing;
    const caseNumber = `${CASE_NUMBER_PREFIX}${await nextSequenceNumber(tx, WARRANTY_CASE_DOC_TYPE)}`;
    const created = await tx.warrantyCase.create({
      data: {
        caseNumber,
        jobCardId: input.jobCardId,
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        branchId: input.branchId,
        complaint: input.complaint,
        mileage: input.mileage,
        coverageStatus: input.coverageStatus,
        openedAutomatically: input.automatic,
        createdById: input.actorId,
      },
    });
    await tx.warrantyCaseStatusHistory.create({
      data: {
        caseId: created.id,
        fromStatus: null,
        toStatus: WarrantyCaseStatus.OPEN,
        actorId: input.actorId,
        remarks: input.automatic ? "Case opened automatically from the job card" : "Case opened manually",
      },
    });
    return created;
  }

  /** Manual open by a warranty officer, e.g. after verifying an UNKNOWN vehicle. */
  async openManually(jobCardId: string, actorId: string, complaint?: string) {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: jobCardId },
      select: { id: true, jobNumber: true, vehicleId: true, customerId: true, branchId: true, description: true, mileage: true, warrantyStatusAtCreation: true },
    });
    if (!jobCard) throw new NotFoundError("Job card not found");
    if (!jobCard.vehicleId) throw new BadRequestError("The job card has no vehicle, so no warranty case can be opened");
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.warrantyCase.findUnique({ where: { jobCardId } });
      if (existing) throw new ConflictError(`Job card ${jobCard.jobNumber} already has warranty case ${existing.caseNumber}`);
      return this.openForJobCard(tx, {
        jobCardId,
        vehicleId: jobCard.vehicleId!,
        customerId: jobCard.customerId,
        branchId: jobCard.branchId,
        complaint: complaint?.trim() || jobCard.description,
        mileage: jobCard.mileage,
        coverageStatus: jobCard.warrantyStatusAtCreation,
        actorId,
        automatic: false,
      });
    });
    return this.get(created.id);
  }

  async branchOf(caseId: string): Promise<string> {
    const found = await prisma.warrantyCase.findUnique({ where: { id: caseId }, select: { branchId: true } });
    if (!found) throw new NotFoundError("Warranty case not found");
    return found.branchId;
  }

  async get(id: string) {
    const detail = await prisma.warrantyCase.findUnique({ where: { id }, include: caseDetailInclude });
    if (!detail) throw new NotFoundError("Warranty case not found");
    return presentCase(detail);
  }

  private buildWhere(f: CaseListFilters): Prisma.WarrantyCaseWhereInput {
    const and: Prisma.WarrantyCaseWhereInput[] = [];
    if (f.scopeBranchId) and.push({ branchId: f.scopeBranchId });
    if (f.branchId) and.push({ branchId: f.branchId });
    if (f.status) and.push({ status: f.status });
    if (f.claimNo === "GENERATED") and.push({ manufacturerClaimNo: { not: null } });
    if (f.claimNo === "NOT_GENERATED") and.push({ manufacturerClaimNo: null });
    if (f.billing === "BILLED") and.push({ jobCard: { invoices: { some: {} } } });
    if (f.billing === "UNBILLED") and.push({ OR: [{ jobCardId: null }, { jobCard: { invoices: { none: {} } } }] });
    if (f.from || f.to) {
      const range = { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) };
      if (f.basedOn === "BILL_DATE") and.push({ jobCard: { invoices: { some: { issuedDate: range } } } });
      else and.push({ createdAt: range });
    }
    if (f.search) {
      const q = { contains: f.search, mode: "insensitive" as const };
      and.push({
        OR: [
          { caseNumber: q },
          { manufacturerClaimNo: q },
          { jobCard: { jobNumber: q } },
          { vehicle: { vin: q } },
          { vehicle: { registrationNumber: q } },
          { customer: { firstName: q } },
          { customer: { lastName: q } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  async list(f: CaseListFilters) {
    const page = f.page ?? 1;
    const limit = f.limit ?? 10;
    const where = this.buildWhere(f);
    const [items, total] = await Promise.all([
      prisma.warrantyCase.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          jobCard: { select: { id: true, jobNumber: true, invoices: { select: { issuedDate: true }, take: 1 } } },
          vehicle: { select: { id: true, vin: true, make: true, model: true, trim: true, registrationNumber: true } },
          customer: { select: { id: true, firstName: true, lastName: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.warrantyCase.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /** KPI counts for the list page, within the caller's branch scope. */
  async summary(scopeBranchId?: string) {
    const scope: Prisma.WarrantyCaseWhereInput = scopeBranchId ? { branchId: scopeBranchId } : {};
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [byStatus, submitted, approved30] = await Promise.all([
      prisma.warrantyCase.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
      prisma.warrantyCase.aggregate({ where: { ...scope, status: "SUBMITTED" }, _sum: { claimedAmount: true } }),
      prisma.warrantyCase.aggregate({
        where: { ...scope, status: { in: ["APPROVED", "PARTIALLY_APPROVED", "SETTLED"] }, decisionAt: { gte: since } },
        _count: { _all: true },
        _sum: { approvedAmount: true },
      }),
    ]);
    const count = (s: WarrantyCaseStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    return {
      open: count("OPEN"),
      inReview: count("IN_REVIEW"),
      submitted: count("SUBMITTED"),
      submittedClaimedAmount: round2(submitted._sum.claimedAmount ?? 0),
      approvedLast30Days: approved30._count._all,
      approvedLast30DaysAmount: round2(approved30._sum.approvedAmount ?? 0),
      rejectedOrReturned: count("REJECTED") + count("RETURNED"),
    };
  }

  // ── Header ───────────────────────────────────────────────────────────────

  async updateHeader(
    id: string,
    data: {
      complaintCodeId?: string | null;
      complaint?: string | null;
      manufacturerClaimNo?: string | null;
      manufacturerClaimDate?: Date | null;
      assignedOfficerId?: string | null;
    },
  ) {
    await prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.status === "CLOSED") throw new BadRequestError("A closed case cannot be edited");
      const editingComplaint = data.complaintCodeId !== undefined || data.complaint !== undefined;
      if (editingComplaint && !EDITABLE_CASE_STATUSES.includes(current.status)) {
        throw new BadRequestError(`The complaint cannot be changed once the case is ${label(current.status)}`);
      }
      if (data.complaintCodeId) await this.assertCode(tx, "complaint", data.complaintCodeId);
      if (data.assignedOfficerId) {
        const officer = await tx.user.findUnique({ where: { id: data.assignedOfficerId }, select: { isActive: true } });
        if (!officer?.isActive) throw new BadRequestError("The assigned officer is not an active user");
      }
      await tx.warrantyCase.update({ where: { id }, data });
    });
    return this.get(id);
  }

  // ── Lines ────────────────────────────────────────────────────────────────

  async addLine(
    caseId: string,
    input: {
      kind: JobCardLineKind;
      role?: WarrantyLineRole | null;
      sparePartId?: string | null;
      operationCode?: string | null;
      description?: string | null;
      defectCodeId?: string | null;
      positionCodeId?: string | null;
      batchNo?: string | null;
      quantity: number;
      rate?: number | null;
      jobCardLineId?: string | null;
    },
  ) {
    await prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, caseId);
      const line = await this.prepareLine(tx, caseId, input);
      const last = await tx.warrantyCaseLine.aggregate({ where: { caseId }, _max: { seq: true } });
      await tx.warrantyCaseLine.create({ data: { ...line, caseId, seq: (last._max.seq ?? 0) + 1 } });
      await this.recalculate(tx, caseId);
    });
    return this.get(caseId);
  }

  async updateLine(
    caseId: string,
    lineId: string,
    input: {
      role?: WarrantyLineRole | null;
      operationCode?: string | null;
      description?: string;
      defectCodeId?: string | null;
      positionCodeId?: string | null;
      batchNo?: string | null;
      quantity?: number;
      rate?: number;
    },
  ) {
    await prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, caseId);
      const line = await tx.warrantyCaseLine.findFirst({ where: { id: lineId, caseId } });
      if (!line) throw new NotFoundError("Claim line not found");
      if (line.kind === "PART" && input.role === null) throw new BadRequestError("Part lines must be causal or consequential");
      if (line.kind === "LABOUR" && input.role) throw new BadRequestError("Labour lines have no causal or consequential role");
      if (input.role === "CAUSAL" && line.role !== "CAUSAL") await this.assertSingleCausal(tx, caseId, lineId);
      if (input.defectCodeId) await this.assertCode(tx, "defect", input.defectCodeId);
      if (input.positionCodeId) await this.assertCode(tx, "position", input.positionCodeId);
      const quantity = input.quantity ?? line.quantity;
      const rate = input.rate ?? line.rate;
      const { claimedAmount, approvedAmount } = lineAmounts(quantity, rate, line.approvalPercent);
      await tx.warrantyCaseLine.update({
        where: { id: lineId },
        data: { ...input, quantity, rate, claimedAmount, approvedAmount: line.approvedAmount === null ? null : approvedAmount },
      });
      await this.recalculate(tx, caseId);
    });
    return this.get(caseId);
  }

  async deleteLine(caseId: string, lineId: string) {
    await prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, caseId);
      const deleted = await tx.warrantyCaseLine.deleteMany({ where: { id: lineId, caseId } });
      if (deleted.count === 0) throw new NotFoundError("Claim line not found");
      await this.recalculate(tx, caseId);
    });
    return this.get(caseId);
  }

  /**
   * Copies the job card's WARRANTY lines that are not on the claim yet. Parts that are
   * not warranty-applicable are skipped. The first part becomes the causal part if the claim has none.
   */
  async importFromJobCard(caseId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const current = await this.lockEditable(tx, caseId);
      if (!current.jobCardId) throw new BadRequestError("This case is not linked to a job card");
      const [jobLines, existing] = await Promise.all([
        tx.jobCardLine.findMany({
          where: { jobCardId: current.jobCardId, chargeType: ChargeType.WARRANTY },
          include: { sparePart: { select: { partNumber: true, warrantyApplicable: true } } },
          orderBy: { createdAt: "asc" },
        }),
        tx.warrantyCaseLine.findMany({ where: { caseId }, select: { jobCardLineId: true, role: true, seq: true } }),
      ]);
      const already = new Set(existing.map((l) => l.jobCardLineId).filter(Boolean));
      let hasCausal = existing.some((l) => l.role === "CAUSAL");
      let seq = existing.reduce((m, l) => Math.max(m, l.seq), 0);
      let imported = 0;
      const skipped: string[] = [];
      for (const line of jobLines) {
        if (already.has(line.id)) continue;
        if (line.kind === "PART" && !line.sparePart?.warrantyApplicable) {
          skipped.push(`${line.sparePart?.partNumber ?? line.description} is not warranty-applicable`);
          continue;
        }
        const role = line.kind === "PART" ? (hasCausal ? WarrantyLineRole.CONSEQUENTIAL : WarrantyLineRole.CAUSAL) : null;
        if (role === "CAUSAL") hasCausal = true;
        const { claimedAmount } = lineAmounts(line.quantity, line.rate, null);
        await tx.warrantyCaseLine.create({
          data: {
            caseId,
            seq: ++seq,
            kind: line.kind,
            role,
            sparePartId: line.sparePartId,
            partNumber: line.sparePart?.partNumber ?? null,
            operationCode: line.operationCode,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            claimedAmount,
            jobCardLineId: line.id,
          },
        });
        imported++;
      }
      await this.recalculate(tx, caseId);
      return { imported, skipped };
    });
    return { ...result, case: await this.get(caseId) };
  }

  // ── Workflow ─────────────────────────────────────────────────────────────

  async transition(
    caseId: string,
    action: WarrantyCaseAction,
    input: {
      remarks?: string | null;
      rejectReasonId?: string | null;
      settlementRef?: string | null;
      settledAmount?: number | null;
      settledAt?: Date | null;
      decisionAt?: Date | null;
      manufacturerClaimNo?: string | null;
      manufacturerClaimDate?: Date | null;
      lineApprovals?: { lineId: string; approvalPercent: number }[];
    },
    actorId: string,
  ) {
    const { from, to, detail } = await prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, caseId);
      const lines = await tx.warrantyCaseLine.findMany({
        where: { caseId },
        include: { sparePart: { select: { warrantyApplicable: true } } },
      });
      const state: CaseState = {
        status: current.status,
        complaintCodeId: current.complaintCodeId,
        complaint: current.complaint,
        lines: lines.map((l) => ({
          id: l.id,
          kind: l.kind,
          role: l.role,
          defectCodeId: l.defectCodeId,
          claimedAmount: l.claimedAmount,
          approvalPercent: l.approvalPercent,
          partWarrantyApplicable: l.sparePart ? l.sparePart.warrantyApplicable : null,
        })),
      };
      if (action === "REJECT" && input.rejectReasonId) await this.assertCode(tx, "reject", input.rejectReasonId);
      const plan = planTransition(state, action, input);

      const data: Prisma.WarrantyCaseUncheckedUpdateManyInput = { status: plan.to };
      const now = new Date();
      if (action === "SUBMIT") {
        data.submittedAt = now;
        if (input.manufacturerClaimNo) data.manufacturerClaimNo = input.manufacturerClaimNo;
        if (input.manufacturerClaimDate) data.manufacturerClaimDate = input.manufacturerClaimDate;
        else if (input.manufacturerClaimNo && !current.manufacturerClaimDate) data.manufacturerClaimDate = now;
      }
      if (plan.approvals) {
        let approvedTotal = 0;
        for (const line of lines) {
          const percent = plan.approvals.get(line.id)!;
          const { approvedAmount } = lineAmounts(line.quantity, line.rate, percent);
          approvedTotal += approvedAmount!;
          await tx.warrantyCaseLine.update({ where: { id: line.id }, data: { approvalPercent: percent, approvedAmount } });
        }
        data.approvedAmount = round2(approvedTotal);
        data.decisionAt = input.decisionAt ?? now;
      }
      if (action === "REJECT") data.rejectReasonId = input.rejectReasonId!;
      if (action === "RETURN") data.decisionAt = input.decisionAt ?? now;
      if (action === "RESUME") {
        // Back to a draft claim: clear the previous decision.
        await tx.warrantyCaseLine.updateMany({ where: { caseId }, data: { approvalPercent: 100, approvedAmount: null } });
        data.approvedAmount = null;
        data.rejectReasonId = null;
      }
      if (action === "SETTLE") {
        data.settledAt = input.settledAt ?? now;
        data.settlementRef = input.settlementRef!.trim();
        data.settledAmount = input.settledAmount ?? current.approvedAmount;
      }
      if (action === "CLOSE") data.closedAt = now;

      const claimed = await tx.warrantyCase.updateMany({ where: { id: caseId, status: current.status }, data });
      if (claimed.count !== 1) {
        throw new ConflictError("This case was changed by someone else. Refresh and try again.");
      }
      await tx.warrantyCaseStatusHistory.create({
        data: { caseId, fromStatus: current.status, toStatus: plan.to, actorId, remarks: input.remarks?.trim() || null },
      });
      return { from: current.status, to: plan.to, detail: current };
    });

    await this.notifyStatusChange(detail.id, from, to, action);
    return this.get(caseId);
  }

  private async notifyStatusChange(caseId: string, from: WarrantyCaseStatus, to: WarrantyCaseStatus, action: WarrantyCaseAction) {
    const c = await prisma.warrantyCase.findUnique({
      where: { id: caseId },
      select: { caseNumber: true, branchId: true, jobCard: { select: { jobNumber: true, createdById: true } } },
    });
    if (!c) return;
    const payload: NotificationPayload = {
      type: NOTIFICATION_TYPES.WARRANTY_CASE_STATUS,
      title: `Warranty case ${actionPast(action)}`,
      message: `Warranty case ${c.caseNumber}${c.jobCard ? ` (job card ${c.jobCard.jobNumber})` : ""} moved from ${label(from)} to ${label(to)}.`,
      link: `/warranty/${caseId}`,
      branchId: c.branchId,
    };
    const notifications = new NotificationService();
    await Promise.all([
      c.jobCard?.createdById ? notifications.notifyUsers([c.jobCard.createdById], payload) : Promise.resolve(),
      notifications.notifyRole(ROLES.WORKSHOP_MANAGER, c.branchId, payload),
    ]);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async lock(tx: Tx, caseId: string) {
    await tx.$queryRaw`SELECT "id" FROM "WarrantyCase" WHERE "id" = ${caseId} FOR UPDATE`;
    const current = await tx.warrantyCase.findUnique({ where: { id: caseId } });
    if (!current) throw new NotFoundError("Warranty case not found");
    return current;
  }

  private async lockEditable(tx: Tx, caseId: string) {
    const current = await this.lock(tx, caseId);
    if (!EDITABLE_CASE_STATUSES.includes(current.status)) {
      throw new BadRequestError(`Claim lines cannot be changed once the case is ${label(current.status)}`);
    }
    return current;
  }

  private async prepareLine(
    tx: Tx,
    caseId: string,
    input: Parameters<WarrantyCaseService["addLine"]>[1],
  ): Promise<Omit<Prisma.WarrantyCaseLineUncheckedCreateInput, "caseId" | "seq">> {
    if (input.defectCodeId) await this.assertCode(tx, "defect", input.defectCodeId);
    if (input.positionCodeId) await this.assertCode(tx, "position", input.positionCodeId);
    if (input.jobCardLineId) {
      const jobLine = await tx.jobCardLine.findUnique({ where: { id: input.jobCardLineId }, select: { jobCardId: true } });
      const owner = await tx.warrantyCase.findUnique({ where: { id: caseId }, select: { jobCardId: true } });
      if (!jobLine || jobLine.jobCardId !== owner?.jobCardId) throw new BadRequestError("The job card line is not on this case's job card");
    }

    if (input.kind === "PART") {
      if (!input.sparePartId) throw new BadRequestError("Choose the part");
      if (!input.role) throw new BadRequestError("Part lines must be causal or consequential");
      const part = await tx.sparePart.findUnique({ where: { id: input.sparePartId } });
      if (!part) throw new NotFoundError("Part not found");
      if (!part.warrantyApplicable) {
        throw new BadRequestError(`Part ${part.partNumber} is not warranty-applicable and cannot be claimed`);
      }
      if (input.role === "CAUSAL") await this.assertSingleCausal(tx, caseId);
      const rate = input.rate ?? part.warrantyRate ?? part.retailRate ?? part.unitPrice;
      return {
        kind: "PART",
        role: input.role,
        sparePartId: part.id,
        partNumber: part.partNumber,
        description: input.description?.trim() || part.name,
        defectCodeId: input.defectCodeId ?? null,
        positionCodeId: input.positionCodeId ?? null,
        batchNo: input.batchNo ?? null,
        quantity: input.quantity,
        rate,
        claimedAmount: lineAmounts(input.quantity, rate, null).claimedAmount,
        jobCardLineId: input.jobCardLineId ?? null,
      };
    }

    if (input.role) throw new BadRequestError("Labour lines have no causal or consequential role");
    if (!input.description?.trim()) throw new BadRequestError("Describe the labour operation");
    if (input.rate == null) throw new BadRequestError("Enter the labour rate");
    return {
      kind: "LABOUR",
      role: null,
      operationCode: input.operationCode ?? null,
      description: input.description.trim(),
      defectCodeId: input.defectCodeId ?? null,
      positionCodeId: input.positionCodeId ?? null,
      quantity: input.quantity,
      rate: input.rate,
      claimedAmount: lineAmounts(input.quantity, input.rate, null).claimedAmount,
      jobCardLineId: input.jobCardLineId ?? null,
    };
  }

  private async assertSingleCausal(tx: Tx, caseId: string, exceptLineId?: string) {
    const causal = await tx.warrantyCaseLine.count({
      where: { caseId, role: "CAUSAL", ...(exceptLineId && { id: { not: exceptLineId } }) },
    });
    if (causal > 0) throw new BadRequestError("The claim already has a causal part. Change it, or add this one as consequential.");
  }

  private async assertCode(tx: Tx, type: "complaint" | "defect" | "position" | "reject", id: string) {
    const where = { id };
    const found =
      type === "complaint"
        ? await tx.warrantyComplaintCode.findUnique({ where })
        : type === "defect"
          ? await tx.warrantyDefectCode.findUnique({ where })
          : type === "position"
            ? await tx.warrantyPositionCode.findUnique({ where })
            : await tx.warrantyRejectReason.findUnique({ where });
    if (!found || !found.isActive) throw new BadRequestError(`Unknown or inactive ${type} code`);
  }

  private async recalculate(tx: Tx, caseId: string) {
    const sums = await tx.warrantyCaseLine.aggregate({ where: { caseId }, _sum: { claimedAmount: true } });
    await tx.warrantyCase.update({ where: { id: caseId }, data: { claimedAmount: round2(sums._sum.claimedAmount ?? 0) } });
  }
}
