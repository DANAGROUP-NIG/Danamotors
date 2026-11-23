import { Prisma } from "@prisma/client";
import { assertDepositPaid } from "../service/job-deposit.service";
import { assertSignedJobOpening } from "../service/job-opening-signature.service";
import { requisitionWorkUpdate } from "./requisition.logic";
import { setNotificationActor } from "../notification/jobcard-notification-router";

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
