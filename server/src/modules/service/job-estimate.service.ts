import { JobCardType, Prisma, type FindingPayer, type LineDecision } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { holdsPermission } from "../../shared/effectivePermissions";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { getBranchSettings } from "../company-settings/company-settings.service";
import { advanceReceiptDateLimit } from "../finance/job-advance";
import { sumMoney } from "../finance/money";
import { workshopNotification } from "../notification/notification.events";
import { signatureState, stagedContentHash } from "./estimate-signature";
import { loadAdvanceRequirement } from "./job-deposit.service";
import {
  approveBody,
  estimateOutcome,
  estimateTotals,
  estimationCharge,
  EXEMPTION_LABELS,
  exemptionBody,
  normalisePhone,
  notifyCashierBody,
  phoneApprovalBody,
  saveDraftBody,
  suggestedAdvance,
  waiverDecisionBody,
  waiverRequestBody,
  type EstimateOutcome,
} from "./job-estimate.logic";
import { canWorkStage, type EstimateStageFacts, type StageActor } from "./job-stage.logic";
import { serviceChargeReference } from "./job-service-charge";
import { branchStoreManagers, notifyStoreOfParts } from "./jobcard-parts-request.service";
import { ServiceService } from "./service.service";

export interface EstimateActor extends StageActor {
  permissions: string[];
}

const has = (actor: EstimateActor, permission: string) => actor.role === ROLES.SUPER_ADMIN || actor.permissions.includes(permission);
/** TODO(confirm): who approves an estimation charge waiver and records an advance exemption. */
const MANAGERS: readonly string[] = [ROLES.SERVICE_MANAGER, ROLES.WORKSHOP_MANAGER, ROLES.GENERAL_WORKSHOP_MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN];
const ADMIN_ROLES: readonly string[] = [ROLES.ADMIN, ROLES.SUPER_ADMIN];
const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() : null);
const TX = { maxWait: 5000, timeout: 15000 };

const jobSelect = {
  id: true,
  jobNumber: true,
  branchId: true,
  jobType: true,
  stage: true,
  status: true,
  customerId: true,
  vehicleId: true,
  technicianId: true,
  serviceTypeId: true,
  serviceId: true,
  serviceCharge: true,
  createdById: true,
  advanceExemption: true,
  advanceExemptionReason: true,
  advanceExemptedAt: true,
  advanceExemptedBy: { select: { firstName: true, lastName: true } },
  technician: { select: { firstName: true, lastName: true } },
  customer: { select: { firstName: true, lastName: true } },
  vehicle: { select: { registrationNumber: true } },
  complaints: { select: { id: true, description: true }, orderBy: { id: "asc" } },
  estimationCharge: {
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      waiverRequestedBy: { select: { firstName: true, lastName: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.JobCardSelect;
type EstimateJob = Prisma.JobCardGetPayload<{ select: typeof jobSelect }>;

const estimateInclude = {
  lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { findingItem: { select: { kind: true } } } },
  approvals: {
    include: {
      signature: { select: { estimateVersion: true, totalSigned: true, contentHash: true, hashVersion: true, signerName: true, relationship: true, signerPhone: true, signedAt: true } },
      recordedBy: { select: { firstName: true, lastName: true } },
    },
  },
  partsRequest: true,
} satisfies Prisma.EstimateInclude;
type LoadedEstimate = Prisma.EstimateGetPayload<{ include: typeof estimateInclude }>;

async function loadJob(db: Prisma.TransactionClient | typeof prisma, jobId: string) {
  const job = await db.jobCard.findUnique({ where: { id: jobId }, select: jobSelect });
  if (!job) throw new NotFoundError("Job card not found");
  return job;
}

async function latestEstimate(db: Prisma.TransactionClient | typeof prisma, jobId: string) {
  return db.estimate.findFirst({
    where: { jobCardId: jobId },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    include: estimateInclude,
  });
}

const outcomeOf = (estimate: { status: string; approvals: unknown[]; lines: { payer: FindingPayer; customerDecision: LineDecision | null }[] }): EstimateOutcome | null =>
  estimate.approvals.length ? estimateOutcome(estimate.lines) : null;

/** Where the estimate step is, for the stage rules (sub-step, Release and the all-declined handoff). */
export async function loadEstimateStageFacts(tx: Prisma.TransactionClient, jobId: string): Promise<EstimateStageFacts> {
  const [estimate, charge] = await Promise.all([
    tx.estimate.findFirst({
      where: { jobCardId: jobId },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { status: true, presentedAt: true, approvals: { select: { id: true } }, lines: { select: { payer: true, customerDecision: true } } },
    }),
    tx.estimationCharge.findUnique({ where: { jobCardId: jobId }, select: { status: true } }),
  ]);
  return {
    hasEstimate: !!estimate,
    presented: !!estimate?.presentedAt,
    decided: !!estimate?.approvals.length,
    outcome: estimate ? outcomeOf(estimate) : null,
    charge: charge?.status ?? "NONE",
  };
}

/** Recommended work the customer declined on earlier visits of this vehicle (latest revision of each job). */
export async function vehicleDeclinedItems(db: Prisma.TransactionClient | typeof prisma, vehicleId: string, excludeJobId?: string) {
  const lines = await db.estimateLine.findMany({
    where: {
      customerDecision: "DECLINED",
      estimate: { status: { not: "SUPERSEDED" }, jobCard: { vehicleId, jobType: JobCardType.SERVICE, ...(excludeJobId ? { id: { not: excludeJobId } } : {}) } },
    },
    orderBy: [{ estimate: { createdAt: "desc" } }, { sortOrder: "asc" }],
    take: 20,
    select: {
      id: true,
      description: true,
      amount: true,
      estimate: {
        select: {
          vatRate: true,
          approvals: { select: { decisionDate: true }, take: 1 },
          jobCard: { select: { id: true, jobNumber: true } },
        },
      },
    },
  });
  return lines.map((line) => ({
    id: line.id,
    description: line.description,
    amount: line.amount.toFixed(2),
    declinedAt: line.estimate.approvals[0]?.decisionDate ?? null,
    jobCardId: line.estimate.jobCard!.id,
    jobNumber: line.estimate.jobCard!.jobNumber,
  }));
}

/** Branch users who can record a receipt (the cashier role is not fixed by name). Admins only when nobody else can. */
async function branchCashiers(db: Prisma.TransactionClient | typeof prisma, branchId: string) {
  const users = await db.user.findMany({
    where: { branchId, isActive: true, ...holdsPermission(PERMISSIONS.RECEIPT_CREATE) },
    select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  const staff = users.filter((user) => !ADMIN_ROLES.includes(user.role?.name ?? ""));
  return staff.length ? staff : users;
}

function access(job: EstimateJob, actor: EstimateActor) {
  const atEstimate = job.stage === "ESTIMATE" && job.jobType !== JobCardType.PDI;
  const canEdit = atEstimate && has(actor, PERMISSIONS.JOBCARD_UPDATE) && has(actor, PERMISSIONS.ESTIMATE_CREATE) && canWorkStage("ESTIMATE", actor, job.technicianId);
  return {
    canEdit,
    canSign: canEdit && has(actor, PERMISSIONS.ESTIMATE_SIGN),
    // Approvals by a manager, not edits of the job: the role decides (a service manager has no jobcard:update).
    canDecideWaiver: atEstimate && MANAGERS.includes(actor.role),
    canExempt: atEstimate && MANAGERS.includes(actor.role),
    canReceive: atEstimate && has(actor, PERMISSIONS.RECEIPT_CREATE),
  };
}
type Access = ReturnType<typeof access>;

function assertAccess(allowed: boolean, message: string) {
  if (!allowed) throw new ForbiddenError(message);
}
const EDIT_DENIED = "Only the service advisor can change the estimate while the job is at the estimate step.";

function lineKind(line: LoadedEstimate["lines"][number]) {
  if (line.findingItem?.kind === "OIL") return "OIL" as const;
  const base = line.type.replace("INCLUDED_", "");
  return base === "LABOUR" ? ("LABOUR" as const) : base === "SERVICE" ? ("SERVICE" as const) : base === "COMPLAINT" ? ("REQUEST" as const) : ("PART" as const);
}

/** The approved part lines (customer-approved and other payers), merged by part, that the store should prepare. */
function partsToRequest(estimate: LoadedEstimate) {
  const parts = new Map<string, { sparePartId: string; description: string; quantity: Prisma.Decimal }>();
  for (const line of estimate.lines) {
    if (!["PART", "INCLUDED_PART"].includes(line.type) || !line.referenceId || line.customerDecision === "DECLINED") continue;
    const current = parts.get(line.referenceId);
    parts.set(line.referenceId, { sparePartId: line.referenceId, description: line.description, quantity: current ? current.quantity.plus(line.quantity) : line.quantity });
  }
  return [...parts.values()];
}

export class JobEstimateService {
  private readonly service = new ServiceService();

  /** The estimate step for one job: the draft or decided revision, totals, approval, charge, advance and parts request. */
  async view(jobId: string, actor: EstimateActor) {
    const job = await loadJob(prisma, jobId);
    const rights = access(job, actor);
    const [estimate, findings, settings, cashiers, receipts, requirement, storeManagers] = await Promise.all([
      latestEstimate(prisma, jobId),
      prisma.jobFindingItem.count({ where: { finding: { jobCardId: jobId } } }),
      getBranchSettings(job.branchId),
      branchCashiers(prisma, job.branchId),
      prisma.receipt.findMany({
        where: { advanceJobCardId: jobId, status: "ACTIVE", category: "SERVICE_PARTS", mode: { not: "CHEQUE" }, issuedAt: { lte: advanceReceiptDateLimit() } },
        orderBy: { issuedAt: "asc" },
        select: { id: true, receiptNumber: true, advanceAmount: true, mode: true, issuedAt: true, createdAt: true, issuedBy: { select: { firstName: true, lastName: true } } },
      }),
      prisma.$transaction((tx) => loadAdvanceRequirement(tx, jobId)),
      prisma.$transaction((tx) => branchStoreManagers(tx, job.branchId, "")),
    ]);
    return this.present(job, rights, { estimate, findings, settings, cashiers, receipts, requirement, storeManagers });
  }

  private present(
    job: EstimateJob,
    rights: Access,
    data: {
      estimate: LoadedEstimate | null;
      findings: number;
      settings: Awaited<ReturnType<typeof getBranchSettings>>;
      cashiers: Awaited<ReturnType<typeof branchCashiers>>;
      receipts: { id: string; receiptNumber: string; advanceAmount: number; mode: string; issuedAt: Date | null; createdAt: Date; issuedBy: { firstName: string; lastName: string } | null }[];
      requirement: Awaited<ReturnType<typeof loadAdvanceRequirement>>;
      storeManagers: { firstName: string; lastName: string }[];
    },
  ) {
    const { estimate } = data;
    const totals = estimate ? estimateTotals(estimate.lines, estimate.vatRate) : null;
    const approval = estimate?.approvals[0] ?? null;
    const outcome = estimate ? outcomeOf(estimate) : null;
    const received = sumMoney(data.receipts.map((receipt) => receipt.advanceAmount));
    const payable = totals ? (approval ? totals.approvedTotal : totals.customerTotal) : "0.00";
    const percent = estimate?.upfrontPaymentPercent.toFixed(2) ?? "60.00";
    const requests = job.complaints.map((complaint, index) => ({ id: complaint.id, number: index + 1, description: complaint.description }));
    const partsNeeded = estimate && approval && outcome !== "ALL_DECLINED" ? partsToRequest(estimate).length : 0;
    const charge = job.estimationCharge;
    return {
      jobCardId: job.id,
      jobNumber: job.jobNumber,
      stage: job.stage,
      access: rights,
      findingsCount: data.findings,
      /** Prepare is possible from findings or the service type's charge. */
      canPrepare: data.findings > 0 || !!serviceChargeReference(job),
      requests,
      estimate: estimate && {
        id: estimate.id,
        number: estimate.estimateNumber,
        version: estimate.version,
        status: estimate.status.toUpperCase(),
        outcome,
        createdAt: estimate.createdAt,
        updatedAt: estimate.updatedAt,
        presentedAt: estimate.presentedAt,
        vatRate: estimate.vatRate.toFixed(2),
        upfrontPaymentPercent: percent,
        contentHash: stagedContentHash(estimate),
        lines: estimate.lines.map((line) => ({
          id: line.id,
          type: line.type,
          kind: lineKind(line),
          includedInService: line.type.startsWith("INCLUDED_"),
          referenceId: line.referenceId,
          description: line.description,
          quantity: line.quantity.toFixed(2),
          rate: line.rate.toFixed(2),
          amount: line.amount.toFixed(2),
          payer: line.payer,
          customerDecision: line.customerDecision,
          findingItemId: line.findingItemId,
          complaintId: line.complaintId,
        })),
        totals: totals ?? estimateTotals(estimate.lines, estimate.vatRate),
        approval: approval && {
          channel: approval.channel,
          decidedAt: approval.decisionDate ?? approval.createdAt,
          approvedCount: estimate.lines.filter((line) => line.customerDecision !== "DECLINED").length,
          declinedCount: estimate.lines.filter((line) => line.customerDecision === "DECLINED").length,
          signatureState: signatureState(estimate, approval),
          signerName: approval.signature?.signerName ?? null,
          relationship: approval.signature?.relationship ?? null,
          signerPhone: approval.signature?.signerPhone ?? null,
          signedAt: approval.signature?.signedAt ?? null,
          approverName: approval.approverName,
          approverPhone: approval.approverPhone,
          approvedAt: approval.approvedAt,
          recordedBy: fullName(approval.recordedBy),
          note: approval.comments,
          signatureDueAtDelivery: approval.signatureDueAtDelivery,
        },
      },
      estimationCharge:
        outcome === "ALL_DECLINED" || charge
          ? {
              proposedAmount: totals ? estimationCharge(totals.customerTotal, { minimum: data.settings.estimationChargeMinimum, percent: data.settings.estimationChargePercent }) : null,
              minimum: data.settings.estimationChargeMinimum.toFixed(2),
              percent: data.settings.estimationChargePercent.toFixed(2),
              record: charge && {
                status: charge.status,
                amount: charge.amount.toFixed(2),
                createdBy: fullName(charge.createdBy),
                createdAt: charge.createdAt,
                waiverReason: charge.waiverReason,
                waiverRequestedBy: fullName(charge.waiverRequestedBy),
                waiverRequestedAt: charge.waiverRequestedAt,
                decidedBy: fullName(charge.decidedBy),
                decidedAt: charge.decidedAt,
                decisionNote: charge.decisionNote,
              },
            }
          : null,
      advance: {
        required: data.requirement.required,
        exemption: data.requirement.required ? null : data.requirement.exemption,
        exemptionLabel: data.requirement.required ? null : EXEMPTION_LABELS[data.requirement.exemption],
        exemptionReason: data.requirement.required ? null : data.requirement.reason,
        automatic: data.requirement.required ? false : data.requirement.automatic,
        exemptedBy: fullName(job.advanceExemptedBy),
        exemptedAt: job.advanceExemptedAt,
        payable,
        suggestedPercent: percent,
        suggestedAmount: suggestedAdvance(payable, percent),
        received: received.toFixed(2),
        balance: sumMoney([Number(payable), -received]).toFixed(2),
        receipts: data.receipts.map((receipt) => ({
          id: receipt.id,
          number: receipt.receiptNumber,
          amount: receipt.advanceAmount.toFixed(2),
          mode: receipt.mode,
          at: receipt.issuedAt ?? receipt.createdAt,
          recordedBy: fullName(receipt.issuedBy),
        })),
        cashiers: data.cashiers.map((user) => fullName(user)!),
      },
      partsRequest: {
        needed: partsNeeded > 0,
        status: estimate?.partsRequest?.status ?? null,
        itemCount: estimate?.partsRequest?.itemCount ?? partsNeeded,
        failure: estimate?.partsRequest?.failure ?? null,
        sentAt: estimate?.partsRequest?.sentAt ?? null,
        storeManagers: data.storeManagers.map((user) => fullName(user)!),
      },
      technician: fullName(job.technician),
      customerName: fullName(job.customer),
      registration: job.vehicle?.registrationNumber ?? null,
    };
  }

  /** "Prepare estimate": revision 1 from the diagnosed items, priced from the catalogue. Repeating it returns the estimate. */
  async prepare(jobId: string, actor: EstimateActor) {
    const job = await loadJob(prisma, jobId);
    assertAccess(access(job, actor).canEdit, EDIT_DENIED);
    if (await latestEstimate(prisma, jobId)) return this.view(jobId, actor);
    const items = await prisma.jobFindingItem.findMany({
      where: { finding: { jobCardId: jobId } },
      orderBy: [{ finding: { createdAt: "asc" } }, { sortOrder: "asc" }],
      select: { id: true, kind: true, referenceId: true, description: true, quantity: true, payer: true, finding: { select: { complaintId: true } } },
    });
    const chargeReference = serviceChargeReference(job);
    if (!items.length && !chargeReference)
      throw new BadRequestError("There is nothing to price yet. The diagnosis has no work or parts and the job has no service type.");
    type Draft = { type: "PART" | "LABOUR" | "SERVICE"; referenceId: string; quantity: number; payer: FindingPayer; findingItemId: string | null; complaintId: string | null };
    const lines: Draft[] = chargeReference ? [{ type: "SERVICE", referenceId: chargeReference, quantity: 1, payer: "CUSTOMER", findingItemId: null, complaintId: null }] : [];
    for (const item of items) {
      const type = item.kind === "LABOUR" ? "LABOUR" : "PART";
      const payer = item.payer ?? "CUSTOMER";
      const same = lines.find((line) => line.type === type && line.referenceId === item.referenceId);
      if (same && same.payer !== payer)
        throw new BadRequestError(`${item.description} appears twice with different payers. Ask the warranty officer to decide one payer for it.`);
      if (same) same.quantity = Number(new Prisma.Decimal(same.quantity).plus(item.quantity));
      else lines.push({ type, referenceId: item.referenceId, quantity: item.quantity.toNumber(), payer, findingItemId: item.id, complaintId: item.finding.complaintId });
    }
    try {
      await this.service.addEstimate(jobId, { description: `Estimate for job ${job.jobNumber}`, upfrontPaymentPercent: 60, lines }, actor.id);
    } catch (error) {
      // A second click while the first is saving: the estimate exists now, so show it.
      if (!(error instanceof ConflictError)) throw error;
    }
    return this.view(jobId, actor);
  }

  /** Saves the draft revision in place: lines, quantities and the suggested advance. Prices stay server-side. */
  async saveDraft(jobId: string, actor: EstimateActor, input: z.infer<typeof saveDraftBody>) {
    const body = saveDraftBody.parse(input);
    const job = await loadJob(prisma, jobId);
    assertAccess(access(job, actor).canEdit, EDIT_DENIED);
    await this.service.addEstimate(
      jobId,
      { description: `Estimate for job ${job.jobNumber}`, upfrontPaymentPercent: body.upfrontPaymentPercent, lines: body.lines },
      actor.id,
      undefined,
      { draft: { estimateId: body.estimateId, updatedAt: new Date(body.updatedAt) } },
    );
    return this.view(jobId, actor);
  }

  /** "Present to customer": the draft is final for this revision until someone edits it again. */
  async presentToCustomer(jobId: string, actor: EstimateActor, estimateId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
      const job = await loadJob(tx, jobId);
      assertAccess(access(job, actor).canEdit, EDIT_DENIED);
      const estimate = await latestEstimate(tx, jobId);
      if (!estimate || estimate.id !== estimateId) throw new ConflictError("This estimate has a newer revision. Reload the estimate.");
      if (estimate.approvals.length) throw new ConflictError("The customer has already answered this estimate.");
      if (estimate.presentedAt) return;
      await tx.estimate.update({ where: { id: estimate.id }, data: { presentedAt: new Date() } });
      await tx.auditLog.create({
        data: { userId: actor.id, action: "ESTIMATE_PRESENTED", details: JSON.stringify({ jobCardId: jobId, estimateId, version: estimate.version, contentHash: stagedContentHash(estimate) }) },
      });
    }, TX);
    return this.view(jobId, actor);
  }

  /** The customer approves or declines each customer-pay line and signs on the tablet. */
  async approve(jobId: string, actor: EstimateActor, input: z.infer<typeof approveBody>, deviceOrIp: string) {
    const body = approveBody.parse(input);
    const job = await loadJob(prisma, jobId);
    assertAccess(access(job, actor).canSign, "Only the service advisor can take the customer's approval and signature.");
    const estimate = await latestEstimate(prisma, jobId);
    if (!estimate || estimate.id !== body.estimateId) throw new ConflictError("This estimate has a newer revision. Reload the estimate.");
    const replay = await prisma.customerApproval.findUnique({ where: { requestId: body.requestId }, select: { id: true } });
    if (!estimate.presentedAt && !replay) throw new BadRequestError("Present the estimate to the customer before they approve it.");
    await this.service.addApproval(
      estimate.id,
      {
        customerId: job.customerId!,
        decisions: body.decisions,
        expectedHash: body.expectedHash,
        consentAccepted: body.consentAccepted,
        signerName: body.signerName,
        relationship: body.signer === "REPRESENTATIVE" ? "Representative" : "Owner",
        signerPhone: body.signerPhone ? normalisePhone(body.signerPhone) : undefined,
        signatureImage: body.signatureImage,
        requestId: body.requestId,
      },
      actor.id,
      { deviceOrIp },
    );
    await this.requestApprovedParts(jobId, estimate.id, actor.id);
    return this.view(jobId, actor);
  }

  /** The advisor records an approval given on the phone. No signature now: the customer signs at delivery. */
  async phoneApproval(jobId: string, actor: EstimateActor, input: z.infer<typeof phoneApprovalBody>) {
    const body = phoneApprovalBody.parse(input);
    const job = await loadJob(prisma, jobId);
    assertAccess(access(job, actor).canSign, "Only the service advisor can record a phone approval.");
    const estimate = await latestEstimate(prisma, jobId);
    if (!estimate || estimate.id !== body.estimateId) throw new ConflictError("This estimate has a newer revision. Reload the estimate.");
    const approvedAt = new Date(body.approvedAt);
    if (approvedAt.getTime() > Date.now() + 5 * 60 * 1000)
      throw new BadRequestError("The date and time of the call cannot be in the future").withCode("FIELD_VALIDATION", { field: "approvedAt" });
    if (approvedAt.getTime() < estimate.createdAt.getTime() - 60 * 1000)
      throw new BadRequestError("The call must be after the estimate was prepared").withCode("FIELD_VALIDATION", { field: "approvedAt" });
    const approved = new Set(body.approvedLineIds);
    const foreign = body.approvedLineIds.find((id) => !estimate.lines.some((line) => line.id === id && line.payer === "CUSTOMER"));
    if (foreign) throw new BadRequestError("An approved item is no longer on this estimate. Reload the estimate and try again.").withCode("FIELD_VALIDATION", { field: "approvedLineIds" });
    await this.service.addApproval(
      estimate.id,
      {
        customerId: job.customerId!,
        channel: "PHONE",
        decisions: estimate.lines.filter((line) => line.payer === "CUSTOMER").map((line) => ({ lineId: line.id, decision: approved.has(line.id) ? "APPROVED" : "DECLINED" })),
        expectedHash: body.expectedHash,
        phone: { approverName: body.approverName, approverPhone: normalisePhone(body.approverPhone), approvedAt },
        comments: body.note || undefined,
        requestId: body.requestId,
      },
      actor.id,
    );
    await this.requestApprovedParts(jobId, estimate.id, actor.id);
    return this.view(jobId, actor);
  }

  /**
   * The store request for the approved part lines of a revision: once per revision (a retry or a second
   * call reuses the record), only parts not already requested for an earlier revision, and no stock change.
   * A failure (for example no store manager in the branch) is recorded so the advisor can retry.
   */
  async requestApprovedParts(jobId: string, estimateId: string, actorId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
      const estimate = await tx.estimate.findUnique({ where: { id: estimateId }, include: estimateInclude });
      if (!estimate || estimate.jobCardId !== jobId || !estimate.approvals.length) return;
      if (estimate.partsRequest?.status === "SENT") return;
      if (outcomeOf(estimate) === "ALL_DECLINED") return;
      const earlier = await tx.jobPartsRequest.findMany({ where: { jobCardId: jobId, status: "SENT", estimateId: { not: estimateId } }, select: { lines: true } });
      const already = new Map<string, Prisma.Decimal>();
      for (const request of earlier)
        for (const line of z.array(z.object({ sparePartId: z.string(), quantity: z.string() })).parse(request.lines))
          already.set(line.sparePartId, (already.get(line.sparePartId) ?? new Prisma.Decimal(0)).plus(line.quantity));
      const lines = partsToRequest(estimate)
        .map((part) => ({ ...part, quantity: part.quantity.minus(already.get(part.sparePartId) ?? 0) }))
        .filter((part) => part.quantity.gt(0))
        .map((part) => ({ sparePartId: part.sparePartId, description: part.description, quantity: part.quantity.toFixed(2) }));
      if (!lines.length) return;
      const job = await tx.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { branchId: true } });
      let failure: string | null = null;
      try {
        await notifyStoreOfParts(tx, jobId, job.branchId, actorId, `estimate:${estimateId}`);
      } catch (error) {
        if (!(error instanceof BadRequestError)) throw error;
        failure = error.message;
      }
      const status = failure ? "FAILED" : "SENT";
      await tx.jobPartsRequest.upsert({
        where: { estimateId },
        create: { jobCardId: jobId, estimateId, lines, itemCount: lines.length, status, failure, sentAt: failure ? null : new Date(), createdById: actorId },
        update: { lines, itemCount: lines.length, status, failure, sentAt: failure ? null : new Date(), attempts: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: { userId: actorId, action: failure ? "JOB_PARTS_REQUEST_FAILED" : "JOB_PARTS_REQUEST_SENT", details: JSON.stringify({ jobCardId: jobId, estimateId, lines, failure }) },
      });
    }, TX);
  }

  async retryPartsRequest(jobId: string, actor: EstimateActor) {
    const job = await loadJob(prisma, jobId);
    assertAccess(access(job, actor).canEdit, EDIT_DENIED);
    const estimate = await latestEstimate(prisma, jobId);
    if (!estimate?.approvals.length) throw new BadRequestError("The customer has not approved the estimate yet.");
    await this.requestApprovedParts(jobId, estimate.id, actor.id);
    return this.view(jobId, actor);
  }

  /** Terms clause 4: the customer declined everything, so the estimation charge is added to the bill. */
  async addEstimationCharge(jobId: string, actor: EstimateActor) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
      const job = await loadJob(tx, jobId);
      assertAccess(access(job, actor).canEdit, EDIT_DENIED);
      const { estimate, amount } = await this.declinedEstimate(tx, job);
      const current = job.estimationCharge;
      if (current?.status === "ADDED") return;
      if (current?.status === "WAIVER_REQUESTED") throw new ConflictError("A manager is deciding the waiver request. Wait for their answer.");
      if (current?.status === "WAIVED") throw new ConflictError("A manager has waived the estimation charge for this job.");
      await tx.estimationCharge.create({ data: { jobCardId: jobId, estimateId: estimate.id, amount, status: "ADDED", createdById: actor.id } });
      await tx.auditLog.create({ data: { userId: actor.id, action: "ESTIMATION_CHARGE_ADDED", details: JSON.stringify({ jobCardId: jobId, estimateId: estimate.id, amount }) } });
    }, TX);
    return this.view(jobId, actor);
  }

  /** The advisor asks a manager to waive the estimation charge, with a reason. */
  async requestWaiver(jobId: string, actor: EstimateActor, input: z.infer<typeof waiverRequestBody>) {
    const body = waiverRequestBody.parse(input);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
      const job = await loadJob(tx, jobId);
      assertAccess(access(job, actor).canEdit, EDIT_DENIED);
      const { estimate, amount } = await this.declinedEstimate(tx, job);
      const current = job.estimationCharge;
      if (current?.status === "WAIVER_REQUESTED") return;
      if (current?.status === "WAIVED") throw new ConflictError("A manager has already waived the estimation charge.");
      const data = { status: "WAIVER_REQUESTED" as const, waiverReason: body.reason, waiverRequestedById: actor.id, waiverRequestedAt: new Date(), decidedById: null, decidedAt: null, decisionNote: null };
      await tx.estimationCharge.upsert({
        where: { jobCardId: jobId },
        create: { jobCardId: jobId, estimateId: estimate.id, amount, createdById: actor.id, ...data },
        update: data,
      });
      const managers = await tx.user.findMany({
        where: { branchId: job.branchId, isActive: true, id: { not: actor.id }, role: { name: { in: [ROLES.SERVICE_MANAGER, ROLES.WORKSHOP_MANAGER] } } },
        select: { id: true },
      });
      if (!managers.length) throw new BadRequestError("No service manager or workshop manager is active in this branch to approve a waiver.");
      await this.notify(tx, job, managers, "ESTIMATION_WAIVER_REQUESTED", body.requestId);
      await tx.auditLog.create({ data: { userId: actor.id, action: "ESTIMATION_WAIVER_REQUESTED", details: JSON.stringify({ jobCardId: jobId, estimateId: estimate.id, amount, reason: body.reason }) } });
    }, TX);
    return this.view(jobId, actor);
  }

  /** A service or workshop manager approves the waiver (no charge) or declines it (the charge stays). */
  async decideWaiver(jobId: string, actor: EstimateActor, input: z.infer<typeof waiverDecisionBody>) {
    const body = waiverDecisionBody.parse(input);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
      const job = await loadJob(tx, jobId);
      assertAccess(access(job, actor).canDecideWaiver, "Only a service manager or workshop manager can decide a waiver.");
      const charge = job.estimationCharge;
      if (!charge || charge.status !== "WAIVER_REQUESTED") {
        if (charge && charge.decidedById && charge.status === (body.approve ? "WAIVED" : "ADDED")) return;
        throw new ConflictError("There is no waiver request waiting on this job.");
      }
      await tx.estimationCharge.update({
        where: { jobCardId: jobId },
        data: { status: body.approve ? "WAIVED" : "ADDED", decidedById: actor.id, decidedAt: new Date(), decisionNote: body.note || null },
      });
      if (charge.waiverRequestedById) await this.notify(tx, job, [{ id: charge.waiverRequestedById }], body.approve ? "ESTIMATION_WAIVER_APPROVED" : "ESTIMATION_WAIVER_DECLINED", body.requestId);
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: body.approve ? "ESTIMATION_WAIVER_APPROVED" : "ESTIMATION_WAIVER_DECLINED",
          details: JSON.stringify({ jobCardId: jobId, amount: charge.amount.toFixed(2), reason: charge.waiverReason, note: body.note }),
        },
      });
    }, TX);
    return this.view(jobId, actor);
  }

  /** A manager records why no advance is needed (free service, internal, credit approved), or clears it. */
  async setExemption(jobId: string, actor: EstimateActor, input: z.infer<typeof exemptionBody>) {
    const body = exemptionBody.parse(input);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
      const job = await loadJob(tx, jobId);
      assertAccess(access(job, actor).canExempt, "Only a service manager or workshop manager can record that no advance is needed.");
      await tx.jobCard.update({
        where: { id: jobId },
        data: body.exemption
          ? { advanceExemption: body.exemption, advanceExemptionReason: body.reason!, advanceExemptedById: actor.id, advanceExemptedAt: new Date() }
          : { advanceExemption: null, advanceExemptionReason: null, advanceExemptedById: null, advanceExemptedAt: null },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: body.exemption ? "ADVANCE_EXEMPTION_RECORDED" : "ADVANCE_EXEMPTION_CLEARED",
          details: JSON.stringify({ jobCardId: jobId, before: job.advanceExemption, after: body.exemption, reason: body.reason }),
        },
      });
    }, TX);
    return this.view(jobId, actor);
  }

  /** "Notify cashier": an in-app notice to everyone in the branch who can record a receipt. */
  async notifyCashier(jobId: string, actor: EstimateActor, input: z.infer<typeof notifyCashierBody>) {
    const body = notifyCashierBody.parse(input);
    const names = await prisma.$transaction(async (tx) => {
      const job = await loadJob(tx, jobId);
      assertAccess(access(job, actor).canEdit, EDIT_DENIED);
      const estimate = await latestEstimate(tx, jobId);
      if (!estimate?.approvals.length) throw new BadRequestError("The customer has not approved the estimate yet.");
      const requirement = await loadAdvanceRequirement(tx, jobId);
      if (!requirement.required) throw new BadRequestError("This job does not need an advance.");
      const cashiers = (await branchCashiers(tx, job.branchId)).filter((user) => user.id !== actor.id);
      if (!cashiers.length) throw new BadRequestError("Nobody in this branch can record receipts. Ask an administrator to give a cashier access.");
      await this.notify(tx, job, cashiers, "ADVANCE_REQUESTED", body.requestId);
      await tx.auditLog.create({
        data: { userId: actor.id, action: "ADVANCE_REQUEST_SENT", details: JSON.stringify({ jobCardId: jobId, recipients: cashiers.map((user) => user.id) }) },
      });
      return cashiers.map((user) => fullName(user)!);
    }, TX);
    return { notified: names, estimate: await this.view(jobId, actor) };
  }

  private async declinedEstimate(tx: Prisma.TransactionClient, job: EstimateJob) {
    const estimate = await latestEstimate(tx, job.id);
    if (!estimate || outcomeOf(estimate) !== "ALL_DECLINED") throw new ConflictError("The estimation charge applies only when the customer declined all work.");
    const settings = await getBranchSettings(job.branchId, tx);
    const totals = estimateTotals(estimate.lines, estimate.vatRate);
    return { estimate, amount: estimationCharge(totals.customerTotal, { minimum: settings.estimationChargeMinimum, percent: settings.estimationChargePercent }) };
  }

  private async notify(tx: Prisma.TransactionClient, job: EstimateJob, users: { id: string }[], event: EstimateNoticeEvent, requestId: string) {
    const notice = workshopNotification(event, {
      dedupeKey: `${job.id}:${requestId}`,
      jobCardId: job.id,
      jobNumber: job.jobNumber,
      branchId: job.branchId,
      customer: fullName(job.customer) ?? "Customer not recorded",
      registration: job.vehicle?.registrationNumber ?? "Registration not recorded",
    });
    await tx.notification.createMany({ data: users.map((user) => ({ ...notice, userId: user.id })), skipDuplicates: true });
  }
}

type EstimateNoticeEvent = "ADVANCE_REQUESTED" | "ESTIMATION_WAIVER_REQUESTED" | "ESTIMATION_WAIVER_APPROVED" | "ESTIMATION_WAIVER_DECLINED";

