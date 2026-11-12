import { Prisma } from '@prisma/client';
import { assertDepositPaid } from '../service/job-deposit.service';
import { requisitionWorkUpdate } from './requisition.logic';
import { setNotificationActor } from '../notification/jobcard-notification-router';

export async function jobWorkUpdate(tx: Prisma.TransactionClient, job: { id: string; status: string }, actorId: string, label = 'Requisition') {
  await setNotificationActor(tx, actorId);
  if (['READY', 'COMPLETED'].includes(job.status.toUpperCase())) await assertDepositPaid(tx, job.id);
  return requisitionWorkUpdate(job.status, actorId, label);
}
