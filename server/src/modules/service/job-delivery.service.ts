import { JobCardType, Prisma } from "@prisma/client";
import type { z } from "zod";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { reasonProblem } from "../late-delivery/late-delivery.logic";
import { workshopNotification } from "../notification/notification.events";
import { drainJobcardNotifications } from "../notification/jobcard-notification-router";
import { governingEstimate, latestEstimateQuery } from "./estimate-approval";
import { approvedCustomerTotal, assertSignaturePng, signatureState, stagedContentHash } from "./estimate-signature";
import { activeBillFor, loadDeliveryPaymentProblem } from "./job-billing-gate";
import {
  belongingsList,
  collectorFor,
  collectorProblem,
  deliveryBody,
  deliveryDocument,
  deliveryEvidenceHash,
  deliveryProblems,
  isLate,
  PHONE_APPROVAL_STATEMENT,
  phoneSignatureBody,
  releaseApprovalBody,
  releaseRequestBody,
  representativeSigner,
  workDoneLines,
  type CollectorFacts,
  type CollectorType,
  type DeliveryInput,
  type PhoneSignatureInput,
  type ReleaseApprovalInput,
  type ReleaseRequestInput,
} from "./job-delivery.logic";
import { ESTIMATE_HASH_VERSION } from "./job-estimate.logic";
import { openingHash } from "./job-opening-signature.logic";
import type { RepairActor } from "./job-repair.service";
import { normaliseJobStatus, STAGE_LABELS } from "./job-stage.logic";
import { JobStageService } from "./job-stage.service";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
const TX = { maxWait: 5000, timeout: 20000 };
const lock = (tx: Tx, jobId: string) => tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobId} FOR UPDATE`);
const fullName = (user: { firstName: string; lastName: string } | null | undefined) => (user ? `${user.firstName} ${user.lastName}`.trim() : null);
const has = (actor: RepairActor, permission: string) => actor.role === ROLES.SUPER_ADMIN || actor.permissions.includes(permission);

const ADMINS: string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
/** Who hands the vehicle over: the delivery stage roles. */
const ADVISORS: string[] = [ROLES.SERVICE_ADVISOR, ROLES.SERVICE_MANAGER, ...ADMINS];
/** TODO(confirm): who may approve releasing a vehicle to someone other than the owner or the job card signer. */
export const RELEASE_APPROVERS: string[] = [ROLES.SERVICE_MANAGER, ROLES.WORKSHOP_MANAGER, ...ADMINS];

const DENIED = {
  deliver: "Only the service advisor or the service manager can hand the vehicle over and take the customer's signature.",
  approve: "Only a service manager or workshop manager can approve releasing the vehicle to someone else.",
  request: "Only the service advisor or the service manager can ask a manager to approve the release.",
};

const person = { select: { firstName: true, lastName: true } } as const;
const jobSelect = {
  id: true,
  jobNumber: true,
  branchId: true,
  jobType: true,
  stage: true,
  status: true,
  promisedAt: true,
  deliveredAt: true,
  gatePassNumber: true,
  psfFollowUpDueAt: true,
  workDone: true,
  lateReasonIds: true,
  lateRemarks: true,
  serviceAdvisorId: true,
  deliveryAdvisorId: true,
  deliveryAdvisor: person,
  customer: { select: { firstName: true, lastName: true, companyName: true, phoneNumber: true } },
  vehicle: { select: { registrationNumber: true } },
  checkIn: { select: { checklist: true, belongingsNote: true } },
  openingSignatures: { orderBy: { revision: "desc" }, take: 1, select: { signerName: true, signerPhone: true } },
  workLines: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { description: true, supplementary: true, payer: true },
  },
  releaseApprovals: {
    orderBy: { approvedAt: "desc" },
    take: 1,
    select: {
      id: true,
      collectorName: true,
      collectorPhone: true,
      reason: true,
      approvedAt: true,
      approvedBy: { select: { firstName: true, lastName: true, role: { select: { name: true } } } },
    },
  },
  deliverySignature: {
    select: { id: true, collectorType: true, signerName: true, signerPhone: true, signedAt: true, belongingsReturned: true, snapshot: true },
  },
} satisfies Prisma.JobCardSelect;
type DeliveryJob = Prisma.JobCardGetPayload<{ select: typeof jobSelect }>;

const ownerName = (customer: DeliveryJob["customer"]) =>
  customer ? customer.companyName || `${customer.firstName} ${customer.lastName}`.trim() : "The customer";

function collectorFacts(job: DeliveryJob): CollectorFacts {
  const owner = { name: ownerName(job.customer), phone: job.customer?.phoneNumber ?? null };
  const signer = job.openingSignatures[0];
  const approval = job.releaseApprovals[0];
  return {
    owner,
    checkInSigner: representativeSigner(signer ? { name: signer.signerName, phone: signer.signerPhone } : null, owner.name),
    approval: approval ? { name: approval.collectorName, phone: approval.collectorPhone } : null,
  };
}

/** Estimate revisions the customer approved on the phone and still has to sign, with what they approved. */
async function phoneApprovalsDue(db: Db, jobCardId: string) {
  const approvals = await db.customerApproval.findMany({
    where: { estimate: { jobCardId }, channel: "PHONE", signatureDueAtDelivery: true, signature: null },
    orderBy: { createdAt: "asc" },
    include: { estimate: { include: { lines: { orderBy: { sortOrder: "asc" } } } } },
  });
  return approvals.map((approval) => ({
    approval,
    estimate: approval.estimate,
    // The approval covers this exact revision; a changed revision cannot be signed here.
    matches: signatureState(approval.estimate, { ...approval, signature: null }) === "phone",
  }));
}

/** The work the customer declined on this visit (the governing revision): "Declined, recommended for next visit". */
async function declinedItems(db: Db, jobCardId: string): Promise<string[]> {
  const estimates = await db.estimate.findMany({ where: { jobCardId }, ...latestEstimateQuery, take: 2 });
  const estimate = governingEstimate(estimates);
  return (estimate?.lines ?? [])
    .filter((line) => line.payer === "CUSTOMER" && line.customerDecision === "DECLINED" && line.type !== "COMPLAINT")
    .map((line) => line.description);
}

async function lateReasonOptions(db: Db) {
  return db.workshopMaster.findMany({ where: { kind: "LATE_REASON" }, select: { id: true, active: true, description: true } });
}

export class JobDeliveryService {
  private readonly stages = new JobStageService();

  /** Everything the Delivery step shows, before and after the handover. */
  async view(jobId: string, actor: RepairActor, now: Date = new Date()) {
    const job = await this.load(prisma, jobId);
    const status = normaliseJobStatus(job.status);
    const atDelivery = job.stage === "DELIVERY";
    const belongings = belongingsList(job.checkIn?.checklist, job.checkIn?.belongingsNote);
    const facts = collectorFacts(job);
    const approval = job.releaseApprovals[0];
    const due = atDelivery ? await phoneApprovalsDue(prisma, jobId) : [];
    const paymentProblem = atDelivery ? await loadDeliveryPaymentProblem(prisma, jobId) : null;
    const late = isLate(job.promisedAt, job.deliveredAt ?? now);
    const lateReasons = job.lateReasonIds.length
      ? (await prisma.workshopMaster.findMany({ where: { id: { in: job.lateReasonIds } }, select: { id: true, description: true } })).map((reason) => reason.description)
      : [];
    const canDeliver = atDelivery && ADVISORS.includes(actor.role) && has(actor, PERMISSIONS.JOBCARD_UPDATE) && has(actor, PERMISSIONS.ESTIMATE_SIGN);
    const signature = job.deliverySignature;
    return {
      jobCardId: job.id,
      jobNumber: job.jobNumber,
      stage: job.stage,
      status,
      promisedAt: job.promisedAt,
      late,
      workDone: workDoneLines(job.workLines, job.workDone),
      declined: await declinedItems(prisma, jobId),
      belongings,
      owner: facts.owner,
      checkInSigner: facts.checkInSigner,
      releaseApproval: approval
        ? {
            id: approval.id,
            collectorName: approval.collectorName,
            collectorPhone: approval.collectorPhone,
            reason: approval.reason,
            approvedAt: approval.approvedAt,
            approvedBy: fullName(approval.approvedBy),
            approvedByRole: approval.approvedBy.role.name,
          }
        : null,
      phoneApprovals: due.map(({ approval: row, estimate, matches }) => ({
        approvalId: row.id,
        version: estimate.version,
        approverName: row.approverName,
        approverPhone: row.approverPhone,
        approvedAt: row.approvedAt,
        approvedTotal: approvedCustomerTotal(estimate),
        items: estimate.lines
          .filter((line) => line.payer === "CUSTOMER" && line.customerDecision === "APPROVED" && line.type !== "COMPLAINT")
          .map((line) => ({ description: line.description, amount: line.amount.toFixed(2) })),
        matches,
      })),
      paymentProblem,
      /** The open invoice, so a payment problem can link to it. */
      invoiceId: paymentProblem ? ((await activeBillFor(prisma, jobId))?.id ?? null) : null,
      delivered: job.deliveredAt
        ? {
            at: job.deliveredAt,
            by: fullName(job.deliveryAdvisor),
            gatePassNumber: job.gatePassNumber,
            psfFollowUpDueAt: job.psfFollowUpDueAt,
            lateReasons,
            lateRemarks: job.lateRemarks,
            collector: signature
              ? { type: signature.collectorType, name: signature.signerName, phone: signature.signerPhone, signedAt: signature.signedAt }
              : null,
            belongingsReturned: signature ? (signature.belongingsReturned as { code: string; label: string; returned: boolean }[]) : [],
          }
        : null,
      access: {
        canDeliver: canDeliver && status !== null && ["READY", "BILLED"].includes(status),
        canSignEstimate: canDeliver && due.length > 0,
        // A manager's decision, like credit approval: the role decides, not job card editing rights.
        canApproveRelease: atDelivery && RELEASE_APPROVERS.includes(actor.role),
        canRequestRelease: atDelivery && ADVISORS.includes(actor.role) && has(actor, PERMISSIONS.JOBCARD_UPDATE) && !approval,
      },
    };
  }

  /** The customer signs, at delivery, the estimate revisions they approved on the phone. */
  async signPhoneApprovals(jobId: string, actor: RepairActor, body: PhoneSignatureInput, deviceOrIp: string) {
    const input = phoneSignatureBody.parse(body);
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      const job = await this.lockedJob(tx, jobId);
      this.assertCanDeliver(job, actor);
      assertSignaturePng(input.signatureImage);
      const due = await phoneApprovalsDue(tx, jobId);
      // A repeat after success finds nothing left to sign.
      if (!due.length) return;
      const changed = due.find((row) => !row.matches);
      if (changed)
        throw new ConflictError(`Estimate revision ${changed.estimate.version} changed after the phone approval. Ask the service manager to review it.`).withCode(
          "DELIVERY_BLOCKED",
          { reasons: [`Estimate revision ${changed.estimate.version} changed after the phone approval.`] },
        );
      const terms = await tx.documentTerms.findFirst({
        where: { type: "JOB_ESTIMATE", OR: [{ branchId: job.branchId }, { branchId: null }] },
        orderBy: { branchId: { sort: "asc", nulls: "last" } },
      });
      for (const { approval, estimate } of due) {
        await tx.estimateSignature.create({
          data: {
            estimateId: estimate.id,
            approvalId: approval.id,
            imageReference: input.signatureImage,
            signerName: input.signerName,
            capturedByUserId: actor.id,
            deviceOrIp,
            estimateVersion: estimate.version,
            totalSigned: approvedCustomerTotal(estimate),
            contentHash: stagedContentHash(estimate),
            hashVersion: ESTIMATE_HASH_VERSION,
            channel: "DELIVERY",
            consentStatement: [PHONE_APPROVAL_STATEMENT, ...(terms?.terms ?? [])].join("\n"),
          },
        });
        await tx.customerApproval.update({ where: { id: approval.id }, data: { signatureDueAtDelivery: false } });
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "ESTIMATE_PHONE_APPROVAL_SIGNED",
          details: JSON.stringify({
            jobCardId: jobId,
            branchId: job.branchId,
            requestId: input.requestId,
            revisions: due.map((row) => ({ estimateId: row.estimate.id, version: row.estimate.version, approvalId: row.approval.id })),
          }),
        },
      });
    }, TX);
    return this.view(jobId, actor);
  }

  /** A manager approves releasing the vehicle to someone other than the owner or the job card signer. */
  async approveRelease(jobId: string, actor: RepairActor, body: z.input<typeof releaseApprovalBody>) {
    const input: ReleaseApprovalInput = releaseApprovalBody.parse(body);
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      const replay = await tx.jobReleaseApproval.findUnique({ where: { jobCardId_requestId: { jobCardId: jobId, requestId: input.requestId } } });
      if (replay) return;
      const job = await this.lockedJob(tx, jobId);
      if (!RELEASE_APPROVERS.includes(actor.role))
        throw new ForbiddenError(DENIED.approve).withCode("DELIVERY_FORBIDDEN");
      this.assertAtDelivery(job);
      const approval = await tx.jobReleaseApproval.create({
        data: {
          jobCardId: jobId,
          collectorName: input.collectorName,
          collectorPhone: input.collectorPhone,
          reason: input.reason,
          approvedById: actor.id,
          requestId: input.requestId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "JOB_RELEASE_APPROVED",
          details: JSON.stringify({ jobCardId: jobId, branchId: job.branchId, approvalId: approval.id, reason: input.reason }),
        },
      });
    }, TX);
    return this.view(jobId, actor);
  }

  /** Ask the branch's service and workshop managers, in the app, to approve releasing the vehicle to someone else. */
  async requestRelease(jobId: string, actor: RepairActor, body: ReleaseRequestInput) {
    const input = releaseRequestBody.parse(body);
    const names = await prisma.$transaction(async (tx) => {
      const job = await this.lockedJob(tx, jobId);
      if (!ADVISORS.includes(actor.role) || !has(actor, PERMISSIONS.JOBCARD_UPDATE))
        throw new ForbiddenError(DENIED.request).withCode("DELIVERY_FORBIDDEN");
      this.assertAtDelivery(job);
      const managers = await tx.user.findMany({
        where: {
          branchId: job.branchId,
          isActive: true,
          id: { not: actor.id },
          role: { name: { in: [ROLES.SERVICE_MANAGER, ROLES.WORKSHOP_MANAGER] } },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!managers.length)
        throw new BadRequestError("No service manager or workshop manager is active in this branch to approve the release.");
      const notice = workshopNotification("RELEASE_APPROVAL_REQUESTED", {
        dedupeKey: `${job.id}:${input.requestId}`,
        jobCardId: job.id,
        jobNumber: job.jobNumber,
        branchId: job.branchId,
        customer: ownerName(job.customer),
        registration: job.vehicle?.registrationNumber ?? "Registration not recorded",
        detail: `Collected by ${input.collectorName}, not the owner or the job card signer`,
      });
      await tx.notification.createMany({ data: managers.map((user) => ({ ...notice, userId: user.id })), skipDuplicates: true });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "JOB_RELEASE_APPROVAL_REQUESTED",
          details: JSON.stringify({ jobCardId: jobId, branchId: job.branchId, recipients: managers.map((user) => user.id) }),
        },
      });
      return managers.map((user) => fullName(user)!);
    }, TX);
    return { notified: names, delivery: await this.view(jobId, actor) };
  }

  /**
   * Complete delivery: the customer's signature with the belongings and the collector, then the existing delivery
   * path (payment gate, delivery advisor, late reasons, server time, gate pass) closes the job, in one transaction.
   */
  async deliver(jobId: string, actor: RepairActor, body: z.input<typeof deliveryBody>, now: Date = new Date()) {
    const input: DeliveryInput = deliveryBody.parse(body);
    await prisma.$transaction(async (tx) => {
      await lock(tx, jobId);
      const replay = await tx.jobDeliverySignature.findUnique({ where: { requestId: input.requestId }, select: { jobCardId: true } });
      if (replay) {
        if (replay.jobCardId !== jobId) throw new ConflictError("This request was already used for another job. Reload the page and try again.");
        return;
      }
      const job = await this.lockedJob(tx, jobId);
      this.assertCanDeliver(job, actor);
      assertSignaturePng(input.signatureImage);
      const belongings = belongingsList(job.checkIn?.checklist, job.checkIn?.belongingsNote);
      const facts = collectorFacts(job);
      const type: CollectorType = input.collectorType;
      const late = isLate(job.promisedAt, now);
      const reasonIds = late ? input.lateReasonIds : [];
      const problems = deliveryProblems({
        paymentProblem: await loadDeliveryPaymentProblem(tx, jobId),
        phoneSignaturesDue: (await phoneApprovalsDue(tx, jobId)).length,
        belongings,
        returned: input.returnedCodes,
        collectorProblem: collectorProblem(type, facts),
        late,
        lateReasonCount: reasonIds.length,
        lateReasonProblem: late ? reasonProblem(reasonIds, await lateReasonOptions(tx), job.lateReasonIds) : null,
        signed: true,
      });
      if (problems.length) throw new ConflictError(problems.join(" ")).withCode("DELIVERY_BLOCKED", { reasons: problems });

      const collector = collectorFor(type, facts)!;
      const approval = type === "OTHER" ? job.releaseApprovals[0] : null;
      const document = deliveryDocument({
        jobNumber: job.jobNumber,
        registration: job.vehicle?.registrationNumber ?? null,
        workDone: workDoneLines(job.workLines, job.workDone),
        declined: await declinedItems(tx, jobId),
        belongings,
        collectorType: type,
        collector,
        release: approval ? { approvedBy: fullName(approval.approvedBy) ?? "", reason: approval.reason } : null,
      });
      const documentHash = openingHash(document);
      const evidence = { documentHash, signerName: collector.name, signerPhone: collector.phone, capturedById: actor.id, signedAt: now, signatureImage: input.signatureImage };
      const signature = await tx.jobDeliverySignature.create({
        data: {
          jobCardId: jobId,
          requestId: input.requestId,
          collectorType: type,
          belongingsReturned: document.belongings,
          releaseApprovalId: approval?.id ?? null,
          signerName: collector.name,
          signerPhone: collector.phone,
          snapshot: document,
          documentHash,
          evidenceHash: deliveryEvidenceHash(evidence),
          capturedById: actor.id,
          signedAt: now,
          signatureImage: input.signatureImage,
        },
      });
      // The delivery advisor is the advisor handing over; a manager hands over for the job's advisor.
      const deliveryAdvisorId = actor.role === ROLES.SERVICE_ADVISOR ? actor.id : (job.deliveryAdvisorId ?? job.serviceAdvisorId);
      if (!deliveryAdvisorId)
        throw new ConflictError("This job has no service advisor. Set the service advisor before delivery.").withCode("DELIVERY_BLOCKED", {
          reasons: ["This job has no service advisor. Set the service advisor before delivery."],
        });
      await this.stages.actInTx(
        tx,
        jobId,
        {
          action: "DELIVER",
          requestId: input.requestId,
          note: `Delivered to ${collector.name}`,
          delivery: { deliveryAdvisorId, lateReasonIds: reasonIds, lateRemarks: late ? input.lateRemarks : undefined },
        },
        actor,
      );
      const delivered = await tx.jobCard.findUniqueOrThrow({ where: { id: jobId }, select: { gatePassNumber: true } });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "JOB_DELIVERY_SIGNED",
          details: JSON.stringify({
            jobCardId: jobId,
            branchId: job.branchId,
            signatureId: signature.id,
            collectorType: type,
            releaseApprovalId: approval?.id ?? null,
            belongings: belongings.length,
            lateReasonIds: reasonIds,
            gatePassNumber: delivered.gatePassNumber,
          }),
        },
      });
    }, TX);
    await drainJobcardNotifications(jobId);
    return this.view(jobId, actor);
  }

  private async load(db: Db, jobId: string) {
    const job = await db.jobCard.findUnique({ where: { id: jobId }, select: jobSelect });
    if (!job) throw new NotFoundError("Job card not found");
    return job;
  }

  private async lockedJob(tx: Tx, jobId: string) {
    const job = await this.load(tx, jobId);
    if (job.jobType === JobCardType.PDI)
      throw new ConflictError("PDI job cards are handled from the PDI menu.").withCode("DELIVERY_BLOCKED", {
        reasons: ["PDI job cards are handled from the PDI menu."],
      });
    return job;
  }

  private assertAtDelivery(job: DeliveryJob) {
    if (job.stage === "DELIVERY") return;
    const reason = job.stage === "CLOSED" ? "This vehicle has already been delivered." : `This job is at ${STAGE_LABELS[job.stage]}. Reload the job.`;
    throw new ConflictError(reason).withCode("DELIVERY_BLOCKED", { reasons: [reason] });
  }

  private assertCanDeliver(job: DeliveryJob, actor: RepairActor) {
    if (!ADVISORS.includes(actor.role) || !has(actor, PERMISSIONS.JOBCARD_UPDATE) || !has(actor, PERMISSIONS.ESTIMATE_SIGN))
      throw new ForbiddenError(DENIED.deliver).withCode("DELIVERY_FORBIDDEN");
    this.assertAtDelivery(job);
  }
}
