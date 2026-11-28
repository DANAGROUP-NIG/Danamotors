import { JobCardType, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { billStorage, JobBillingService } from "../finance/job-billing.service";
import { money, sumMoney } from "../finance/money";
import { getBranchSettings } from "../company-settings/company-settings.service";
import { drainJobcardNotifications } from "../notification/jobcard-notification-router";
import { governingEstimate, latestEstimateQuery } from "./estimate-approval";
import { activeBill, actualCustomerTotal } from "./job-billing-gate";
import {
  chargeGroup,
  deliveryPaymentProblem,
  estimatedVsActual,
  paymentStatus,
  type ReadyNoticeInput,
} from "./job-billing-step.logic";
import type { RepairActor } from "./job-repair.service";
import { normaliseJobStatus, STAGE_LABELS } from "./job-stage.logic";
import { JobStageService } from "./job-stage.service";

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 5000, timeout: 20000 };
const lock = (tx: Tx, jobId: string) => tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() : null);
const has = (actor: RepairActor, permission: string) => actor.role === ROLES.SUPER_ADMIN || actor.permissions.includes(permission);

const ADMINS: string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
/** The service advisor's billing tasks: notify again and the washed tick. Marking ready stays the advisor's alone. */
const ADVISORS: string[] = [ROLES.SERVICE_ADVISOR, ROLES.SERVICE_MANAGER, ...ADMINS];
/** TODO(confirm): who may approve delivery on credit. Admins before phase 8; the design adds the service manager. */
export const CREDIT_APPROVERS: string[] = [...ADMINS, ROLES.SERVICE_MANAGER];

const person = { select: { firstName: true, lastName: true } } as const;
const jobSelect = {
  id: true,
  jobNumber: true,
  branchId: true,
  jobType: true,
  stage: true,
  status: true,
  vehicleId: true,
  billedAt: true,
  readyAt: true,
  creditApprovedById: true,
  creditApprovedAt: true,
  creditApprovedBy: { select: { firstName: true, lastName: true, role: { select: { name: true } } } },
  vehicleWashedAt: true,
  vehicleWashedBy: person,
  customer: { select: { phoneNumber: true } },
  estimationCharge: { select: { status: true } },
  customerContacts: {
    orderBy: [{ contactedAt: "asc" }, { id: "asc" }],
    select: { id: true, channel: true, phone: true, note: true, contactedAt: true, contactedBy: person },
  },
} satisfies Prisma.JobCardSelect;
type BillingJob = Prisma.JobCardGetPayload<{ select: typeof jobSelect }>;

const DENIED = {
  ready: "Only the service advisor can mark the vehicle ready and record that the customer was told.",
  notify: "Only the service advisor or the service manager can record that the customer was told.",
  washed: "Only the service advisor or the service manager can tick Vehicle washed.",
};

const statusOf = (job: Pick<BillingJob, "status">) => normaliseJobStatus(job.status);
const notifiable = (job: Pick<BillingJob, "stage" | "status">) =>
  ["BILLING", "DELIVERY"].includes(job.stage) && ["READY", "BILLED"].includes(statusOf(job) ?? "");

export class JobBillingStepService {
  private readonly stages = new JobStageService();
  private readonly billing = new JobBillingService();

  /** Everything the Billing step shows: notice and storage, washed, estimated and actual, invoice, credit, the delivery gate. */
  async view(jobId: string, actor: RepairActor, now: Date = new Date()) {
    const job = await prisma.jobCard.findUnique({ where: { id: jobId }, select: jobSelect });
    if (!job) throw new NotFoundError("Job card not found");
    const status = statusOf(job);
    const bill = await this.billOf(jobId);
    const advanceHeld = bill ? 0 : await this.advanceHeld(jobId);
    const settings = await getBranchSettings(job.branchId);
    const firstNotice = job.customerContacts[0] ?? null;
    const storage = await billStorage(prisma, [jobId], job.branchId, bill?.issuedDate ?? now);
    const comparison = await this.comparison(jobId);
    const charged = bill || job.estimationCharge?.status === "ADDED" ? null : await actualCustomerTotal(prisma, jobId);
    const nothingToPay = !bill && !job.billedAt && charged === 0;
    const facts = { billed: !!bill || !!job.billedAt, balanceDue: bill?.balanceDue ?? null, creditApproved: !!job.creditApprovedById, nothingToPay };
    const ready = status === "READY" && !bill;
    return {
      jobCardId: job.id,
      stage: job.stage,
      status,
      readyAt: job.readyAt,
      customerPhone: job.customer?.phoneNumber ?? null,
      notices: [...job.customerContacts].reverse().map((contact) => ({
        id: contact.id,
        channel: contact.channel,
        phone: contact.phone,
        note: contact.note,
        at: contact.contactedAt,
        by: fullName(contact.contactedBy),
      })),
      storage: storage
        ? { ...storage, running: !bill }
        : firstNotice
          ? null
          : { notifiedAt: null, freeHours: settings.storageFreeHours, dailyRate: money(settings.storageDailyRate).toFixed(2) },
      washed: job.vehicleWashedAt ? { at: job.vehicleWashedAt, by: fullName(job.vehicleWashedBy) } : null,
      comparison,
      warrantyClaim: await this.warrantyClaim(jobId),
      invoice: bill
        ? {
            id: bill.id,
            number: bill.invoiceNumber,
            issuedAt: bill.issuedDate,
            total: bill.total.toFixed(2),
            advancePaid: bill.advancePaid.toFixed(2),
            paymentsReceived: bill.paymentsReceived.toFixed(2),
            balanceDue: bill.balanceDue.toFixed(2),
            jobs: bill.jobs,
          }
        : null,
      paymentStatus: paymentStatus(bill ? { total: bill.total, balanceDue: bill.balanceDue, advancePaid: bill.advancePaid } : null, nothingToPay),
      // Before the invoice: what it will be, what blocks it, and the other open jobs on the vehicle.
      draft: ready ? await this.draft(jobId, advanceHeld) : null,
      otherVehicleJobs: ready && job.vehicleId ? await this.otherVehicleJobs(jobId, job.vehicleId) : [],
      cancelledBill: bill ? null : await this.lastCancelledBill(jobId),
      credit: job.creditApprovedById
        ? { by: fullName(job.creditApprovedBy), role: job.creditApprovedBy?.role.name ?? null, at: job.creditApprovedAt }
        : null,
      nothingToPay,
      deliveryProblem: deliveryPaymentProblem(facts),
      access: {
        canMarkReady: actor.role === ROLES.SERVICE_ADVISOR && has(actor, PERMISSIONS.JOBCARD_UPDATE) && job.stage === "BILLING" && status === "QC",
        canNotify: ADVISORS.includes(actor.role) && has(actor, PERMISSIONS.JOBCARD_UPDATE) && notifiable(job),
        canMarkWashed: ADVISORS.includes(actor.role) && has(actor, PERMISSIONS.JOBCARD_UPDATE) && job.stage === "BILLING",
        canCreateInvoice: has(actor, PERMISSIONS.JOB_BILL_CREATE) && job.stage === "BILLING" && ready && !nothingToPay,
        canRecordPayment: has(actor, PERMISSIONS.RECEIPT_CREATE) && !!bill && bill.balanceDue.gt(0),
        canApproveCredit:
          CREDIT_APPROVERS.includes(actor.role) && job.stage === "BILLING" && ["READY", "BILLED"].includes(status ?? "") && !job.creditApprovedById,
      },
    };
  }

  /**
   * Mark ready and notify: the existing QC to READY move (service advisor only, every existing gate)
   * and the customer contact entry that starts the storage counter, in one transaction under the job lock.
   */
  async markReady(jobId: string, actor: RepairActor, input: ReadyNoticeInput) {
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      if (await this.replayed(tx, jobId, input.requestId)) return;
      const job = await this.lockedJob(tx, jobId);
      if (actor.role !== ROLES.SERVICE_ADVISOR || !has(actor, PERMISSIONS.JOBCARD_UPDATE))
        throw new ForbiddenError(DENIED.ready).withCode("BILLING_FORBIDDEN");
      if (job.stage !== "BILLING" || statusOf(job) !== "QC")
        throw new ConflictError("This vehicle is not waiting to be marked ready. Reload the job.").withCode("BILLING_BLOCKED", {
          reasons: ["This vehicle is not waiting to be marked ready. Reload the job."],
        });
      await this.stages.actInTx(tx, jobId, { action: "MARK_READY", requestId: input.requestId }, actor);
      await this.recordContact(tx, job, actor, input, "JOB_VEHICLE_READY_NOTIFIED");
    }, TX);
    await drainJobcardNotifications(jobId);
    return this.view(jobId, actor);
  }

  /** Send again: another contact entry. The storage counter keeps the first one. */
  async notifyAgain(jobId: string, actor: RepairActor, input: ReadyNoticeInput) {
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      if (await this.replayed(tx, jobId, input.requestId)) return;
      const job = await this.lockedJob(tx, jobId);
      if (!ADVISORS.includes(actor.role) || !has(actor, PERMISSIONS.JOBCARD_UPDATE))
        throw new ForbiddenError(DENIED.notify).withCode("BILLING_FORBIDDEN");
      if (!notifiable(job)) {
        const reason =
          job.stage === "BILLING" && statusOf(job) === "QC"
            ? "Mark the vehicle ready first. That records the first notice."
            : `This job is at ${STAGE_LABELS[job.stage]}. Reload the job.`;
        throw new ConflictError(reason).withCode("BILLING_BLOCKED", { reasons: [reason] });
      }
      await this.recordContact(tx, job, actor, input, "JOB_CUSTOMER_NOTIFIED_AGAIN");
    }, TX);
    return this.view(jobId, actor);
  }

  /** The Vehicle washed tick (with who and when), on the Billing step only. */
  async setWashed(jobId: string, actor: RepairActor, washed: boolean) {
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      const job = await this.lockedJob(tx, jobId);
      if (!ADVISORS.includes(actor.role) || !has(actor, PERMISSIONS.JOBCARD_UPDATE))
        throw new ForbiddenError(DENIED.washed).withCode("BILLING_FORBIDDEN");
      if (job.stage !== "BILLING")
        throw new ConflictError("Vehicle washed is ticked on the Billing step. Reload the job.").withCode("BILLING_BLOCKED", {
          reasons: ["Vehicle washed is ticked on the Billing step. Reload the job."],
        });
      if (!!job.vehicleWashedAt === washed) return;
      await tx.jobCard.update({
        where: { id: jobId },
        data: washed ? { vehicleWashedAt: new Date(), vehicleWashedById: actor.id } : { vehicleWashedAt: null, vehicleWashedById: null },
      });
      await tx.auditLog.create({
        data: { userId: actor.id, action: "JOB_VEHICLE_WASHED", details: JSON.stringify({ jobCardId: jobId, branchId: job.branchId, washed }) },
      });
    }, TX);
    return this.view(jobId, actor);
  }

  private async lockedJob(tx: Tx, jobId: string) {
    const job = await tx.jobCard.findUnique({ where: { id: jobId }, select: jobSelect });
    if (!job) throw new NotFoundError("Job card not found");
    if (job.jobType === JobCardType.PDI)
      throw new ConflictError("PDI job cards are billed from the PDI menu.").withCode("BILLING_BLOCKED", {
        reasons: ["PDI job cards are billed from the PDI menu."],
      });
    return job;
  }

  private async replayed(tx: Tx, jobCardId: string, requestId: string) {
    return !!(await tx.customerContact.findUnique({ where: { jobCardId_requestId: { jobCardId, requestId } }, select: { id: true } }));
  }

  private async recordContact(tx: Tx, job: BillingJob, actor: RepairActor, input: ReadyNoticeInput, action: string) {
    const contact = await tx.customerContact.create({
      data: {
        jobCardId: job.id,
        channel: input.channel,
        phone: job.customer?.phoneNumber ?? null,
        note: input.note?.trim() || null,
        contactedById: actor.id,
        requestId: input.requestId,
      },
    });
    // TODO(confirm): there is no SMS gateway. SMS records that the advisor sent one from their phone.
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action,
        details: JSON.stringify({ jobCardId: job.id, branchId: job.branchId, contactId: contact.id, channel: input.channel }),
      },
    });
  }

  /** The job's active bill with the advance and other payments allocated to it. */
  private async billOf(jobCardId: string) {
    const bills = await prisma.invoice.findMany({
      where: { OR: [{ jobCardId }, { jobCards: { some: { id: jobCardId } } }] },
      orderBy: [{ issuedDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        issuedDate: true,
        total: true,
        outstandingAmount: true,
        jobCard: { select: { id: true, jobNumber: true } },
        jobCards: { select: { id: true, jobNumber: true } },
        allocations: { where: { reversedAt: null }, select: { amount: true, receipt: { select: { advanceJobCardId: true } } } },
      },
    });
    const bill = bills.find((row) => activeBill(row.status));
    if (!bill) return null;
    const total = new Prisma.Decimal(money(bill.total));
    const balanceDue = new Prisma.Decimal(money(Math.max(bill.outstandingAmount, 0)));
    const advancePaid = new Prisma.Decimal(
      sumMoney(bill.allocations.filter((row) => row.receipt?.advanceJobCardId).map((row) => row.amount)),
    );
    const paid = total.minus(balanceDue);
    const jobs = new Map([bill.jobCard, ...bill.jobCards].filter(Boolean).map((card) => [card!.id, card!.jobNumber]));
    return {
      id: bill.id,
      invoiceNumber: bill.invoiceNumber,
      issuedDate: bill.issuedDate,
      total,
      balanceDue,
      advancePaid: Prisma.Decimal.min(advancePaid, paid),
      paymentsReceived: Prisma.Decimal.max(paid.minus(advancePaid), new Prisma.Decimal(0)),
      jobs: [...jobs].map(([id, jobNumber]) => ({ id, jobNumber })),
    };
  }

  /** Advance receipts still held for the job (not yet applied to a bill). */
  private async advanceHeld(jobCardId: string) {
    const receipts = await prisma.receipt.findMany({
      where: { advanceJobCardId: jobCardId, status: "ACTIVE", mode: { not: "CHEQUE" }, advanceAmount: { gt: 0 } },
      select: { advanceAmount: true },
    });
    return sumMoney(receipts.map((receipt) => receipt.advanceAmount));
  }

  /** What the invoice will be (no discount), or the existing readiness reasons it cannot be created yet. */
  private async draft(jobCardId: string, advanceHeld: number) {
    try {
      const preview = await this.billing.previewJobBill({ jobCardId, partsDiscountPercent: 0, labourDiscountPercent: 0 });
      const total = new Prisma.Decimal(preview.totals.total);
      const advance = Prisma.Decimal.min(new Prisma.Decimal(advanceHeld), total);
      return {
        total: total.toFixed(2),
        advancePaid: advance.toFixed(2),
        balanceDue: total.minus(advance).toFixed(2),
        blockers: preview.review.canBill ? [] : preview.review.issues,
        storage: preview.storage,
      };
    } catch (error) {
      if (error instanceof AppError && error.statusCode < 500)
        return { total: null, advancePaid: new Prisma.Decimal(advanceHeld).toFixed(2), balanceDue: null, blockers: [error.message], storage: null };
      throw error;
    }
  }

  /** Other open, unbilled jobs on the same vehicle: they can be billed together on one invoice. */
  private async otherVehicleJobs(jobCardId: string, vehicleId: string) {
    const jobs = await prisma.jobCard.findMany({
      where: {
        vehicleId,
        id: { not: jobCardId },
        jobType: JobCardType.SERVICE,
        billedAt: null,
        stage: { notIn: ["CLOSED", "CANCELLED"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, jobNumber: true, stage: true, status: true },
    });
    return jobs.map((job) => ({ id: job.id, jobNumber: job.jobNumber, stage: job.stage, ready: normaliseJobStatus(job.status) === "READY" }));
  }

  private async lastCancelledBill(jobCardId: string) {
    const bill = await prisma.invoice.findFirst({
      where: { OR: [{ jobCardId }, { jobCards: { some: { id: jobCardId } } }], cancelledAt: { not: null } },
      orderBy: { cancelledAt: "desc" },
      select: { invoiceNumber: true, cancelledAt: true, cancelRemark: true, cancelledBy: person },
    });
    if (!bill) return null;
    return { number: bill.invoiceNumber, at: bill.cancelledAt, reason: bill.cancelRemark, by: fullName(bill.cancelledBy) };
  }

  /**
   * Estimated: the customer's lines on the governing approved estimate, declined lines left out (a supplementary
   * revision carries the earlier approved lines). Actual: what the bill would charge the customer now.
   */
  /** The paper card's estimated and actual table (also printed on the job card, phase 11). */
  async comparison(jobCardId: string) {
    const estimates = await prisma.estimate.findMany({ where: { jobCardId }, ...latestEstimateQuery, take: 2 });
    const estimate = governingEstimate(estimates);
    const decided = estimate?.approvals.some((approval) => approval.approved !== null);
    const estimateLines = decided
      ? (estimate?.lines ?? []).filter((line) => line.payer === "CUSTOMER" && line.customerDecision !== "DECLINED" && line.type !== "COMPLAINT")
      : [];
    let actual: Awaited<ReturnType<JobBillingService["actualCustomerLines"]>>;
    try {
      actual = await this.billing.actualCustomerLines(jobCardId);
    } catch (error) {
      if (error instanceof AppError && error.statusCode < 500) return { rows: null, problem: error.message };
      throw error;
    }
    // Oil is told apart from other parts by the part type (O).
    const isPart = (line: { type: string; referenceId?: string | null }) => line.type.replace("INCLUDED_", "") === "PART" && !!line.referenceId;
    const partIds = [...new Set([...estimateLines, ...actual].filter(isPart).map((line) => line.referenceId!))];
    const parts = partIds.length ? await prisma.sparePart.findMany({ where: { id: { in: partIds } }, select: { id: true, partType: true } }) : [];
    const partType = new Map(parts.map((part) => [part.id, part.partType]));
    const typeOf = (line: { referenceId?: string | null }) => (line.referenceId ? partType.get(line.referenceId) : null);
    const rows = estimatedVsActual(
      estimateLines.map((line) => ({ group: chargeGroup(line.type, typeOf(line)), amount: line.type.startsWith("INCLUDED_") ? 0 : line.amount })),
      actual.map((line) => ({ group: chargeGroup(line.type, typeOf(line)), amount: line.amount })),
    );
    return { rows, problem: null };
  }

  /** Warranty, goodwill and campaign work on the approved estimate, and the officer who did the warranty check. */
  private async warrantyClaim(jobCardId: string) {
    const estimates = await prisma.estimate.findMany({ where: { jobCardId }, ...latestEstimateQuery, take: 2 });
    const estimate = governingEstimate(estimates);
    const lines = (estimate?.lines ?? []).filter((line) => line.payer === "WARRANTY");
    if (!lines.length) return null;
    const check = await prisma.jobStageEvent.findFirst({
      where: { jobCardId, action: "WARRANTY_TO_ADVISOR" },
      orderBy: { createdAt: "desc" },
      select: { actor: person },
    });
    return { amount: sumMoney(lines.map((line) => Number(line.amount))).toFixed(2), officer: fullName(check?.actor) };
  }
}
