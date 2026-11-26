import { Prisma, type JobStage } from "@prisma/client";
import { enqueueWorkshopNotification } from "../notification/workshop-notification-outbox";
import { reconcileStage, stageAllowsStatus, stageOwnerFor, type StageAction, type StageOwner } from "./job-stage.logic";

/**
 * The only code that writes JobCard.stage, stageOwnerId, stageOwnerRole and stageEnteredAt.
 * Every path that changes a job's status or QC result calls syncStage in the same transaction,
 * so stage and status can never disagree. Stage-only moves go through moveStage.
 */

export interface StageContext {
  /** OPENED when the job is created; ASSIGNED when the supervisor assigns the technician and bay. */
  action?: StageAction | "OPENED" | "ASSIGNED";
  requestId?: string;
  note?: string | null;
}

const stageJob = {
  id: true,
  branchId: true,
  jobNumber: true,
  status: true,
  stage: true,
  stageOwnerId: true,
  stageOwnerRole: true,
  qcStatus: true,
  qcNotes: true,
  technicianId: true,
  qualityInspectorId: true,
  serviceAdvisorId: true,
  deliveryAdvisorId: true,
  createdById: true,
  customerId: true,
  promisedAt: true,
  creditApprovedById: true,
  diagnosis: { select: { submittedAt: true } },
} satisfies Prisma.JobCardSelect;

export type StageJob = Prisma.JobCardGetPayload<{ select: typeof stageJob }>;

export interface StageWrite {
  stage: JobStage;
  stageOwnerId: string | null;
  stageOwnerRole: string | null;
  stageEnteredAt: Date;
  eventId: string;
}

/** The owner facts of a locked job, including whether its findings are with the service engineer. */
const ownerOf = (stage: JobStage, job: StageJob) => stageOwnerFor(stage, { ...job, diagnosisSubmitted: !!job.diagnosis?.submittedAt });

async function lockStageJob(tx: Prisma.TransactionClient, jobCardId: string) {
  // Same row lock the job-card workflow takes; re-locking inside one transaction is a no-op.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`);
  return tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, select: stageJob });
}

async function writeStage(
  tx: Prisma.TransactionClient,
  job: StageJob,
  toStage: JobStage,
  owner: StageOwner,
  actorId: string | null,
  ctx: StageContext | undefined,
  announce: boolean,
): Promise<StageWrite | null> {
  const stageChanged = job.stage !== toStage;
  const ownerChanged = owner.ownerId !== job.stageOwnerId || owner.ownerRole !== job.stageOwnerRole;
  if (!stageChanged && !ownerChanged && !ctx?.requestId) return null;
  if (!stageAllowsStatus(toStage, job.status))
    throw new Error(`Job card ${job.jobNumber}: stage ${toStage} cannot hold status ${job.status}`);

  const now = new Date();
  const updated = await tx.jobCard.update({
    where: { id: job.id },
    data: {
      stage: toStage,
      stageOwnerId: owner.ownerId,
      stageOwnerRole: owner.ownerRole,
      ...(stageChanged ? { stageEnteredAt: now } : {}),
    },
    select: { stage: true, stageOwnerId: true, stageOwnerRole: true, stageEnteredAt: true },
  });
  const event = await tx.jobStageEvent.create({
    data: {
      jobCardId: job.id,
      fromStage: job.stage,
      toStage,
      action: ctx?.action ?? null,
      actorId,
      ownerId: owner.ownerId,
      ownerRole: owner.ownerRole,
      note: ctx?.note?.trim() || null,
      requestId: ctx?.requestId ?? null,
      createdAt: now,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId,
      action: "JOB_STAGE_CHANGED",
      details: JSON.stringify({
        jobCardId: job.id,
        branchId: job.branchId,
        stageEventId: event.id,
        action: ctx?.action ?? null,
        fromStage: job.stage,
        toStage,
        fromOwnerId: job.stageOwnerId,
        fromOwnerRole: job.stageOwnerRole,
        toOwnerId: owner.ownerId,
        toOwnerRole: owner.ownerRole,
        requestId: ctx?.requestId ?? null,
      }),
    },
  });
  // Moves that also change the status are already announced by the status notification router.
  // Stage-only handoffs tell the new owner here, through the same durable outbox.
  if (announce && actorId && (stageChanged || ownerChanged) && owner.ownerRole)
    await enqueueWorkshopNotification(tx, "STAGE_HANDOFF", job, event.id, actorId, false, {
      stage: toStage,
      stageOwnerId: owner.ownerId,
      stageOwnerRole: owner.ownerRole,
      // A job sent back (for example by the service engineer) tells the person why.
      ...(ctx?.action === "RETURN_TO_TECHNICIAN" && ctx.note?.trim() ? { returnNote: ctx.note.trim() } : {}),
    });
  return { ...updated, eventId: event.id };
}

/**
 * Brings the stage and owner in line with the job's current status and QC result.
 * Call it in the same transaction, after any write to status, qcStatus, technician,
 * inspector or advisors. Writes nothing when everything already agrees.
 */
export async function syncStage(
  tx: Prisma.TransactionClient,
  jobCardId: string,
  actorId: string | null,
  ctx?: StageContext,
): Promise<StageWrite | null> {
  const job = await lockStageJob(tx, jobCardId);
  const toStage = reconcileStage(job.stage, job.status, job.qcStatus, !!job.creditApprovedById);
  return writeStage(tx, job, toStage, ownerOf(toStage, job), actorId, ctx, false);
}

/** A stage-only move (no status change), made by a stage action after its gates passed. */
export async function moveStage(
  tx: Prisma.TransactionClient,
  jobCardId: string,
  toStage: JobStage,
  actorId: string,
  ctx: StageContext,
): Promise<StageWrite | null> {
  const job = await lockStageJob(tx, jobCardId);
  return writeStage(tx, job, toStage, ownerOf(toStage, job), actorId, ctx, true);
}

/**
 * Changed labour or parts need a fresh quality check. A job already passed to billing
 * goes back to the quality check step.
 */
export async function resetQualityCheck(tx: Prisma.TransactionClient, jobCardId: string, actorId: string | null) {
  await tx.jobCard.update({ where: { id: jobCardId }, data: { qcStatus: "PENDING" } });
  await syncStage(tx, jobCardId, actorId);
}
