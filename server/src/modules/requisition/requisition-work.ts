import { Prisma } from "@prisma/client";
import { assertDepositPaid } from "../service/job-deposit.service";
import { assertSignedJobOpening } from "../service/job-opening-signature.service";
import { requisitionWorkUpdate } from "./requisition.logic";
import { setNotificationActor } from "../notification/jobcard-notification-router";
import { syncStage } from "../service/job-stage.writer";

export async function jobWorkUpdate(
  tx: Prisma.TransactionClient,
  job: { id: string; status: string; openingSignatureRequired?: boolean },
  actorId: string,
  label = "Requisition",
) {
  await setNotificationActor(tx, actorId);
  if (["READY", "COMPLETED"].includes(job.status.toUpperCase())) {
    if (job.openingSignatureRequired) await assertSignedJobOpening(tx, job.id);
    await assertDepositPaid(tx, job.id);
  }
  return requisitionWorkUpdate(job.status, actorId, label);
}

/**
 * Applies the work-change update to the job (fresh QC, and reopening a ready job) and keeps
 * its stage in step. PDI jobs skip the advance and consent checks, as before.
 */
export async function applyJobWorkChange(
  tx: Prisma.TransactionClient,
  job: { id: string; status: string; openingSignatureRequired?: boolean },
  actorId: string,
  options: { label?: string; pdi?: boolean } = {},
) {
  const label = options.label ?? "Requisition";
  await tx.jobCard.update({
    where: { id: job.id },
    data: options.pdi
      ? requisitionWorkUpdate(job.status, actorId, label)
      : await jobWorkUpdate(tx, job, actorId, label),
  });
  await syncStage(tx, job.id, actorId);
}
