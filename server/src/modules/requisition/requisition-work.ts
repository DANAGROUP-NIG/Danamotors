import { Prisma } from '@prisma/client';
import { assertDepositPaid } from '../service/job-deposit.service';
import { requisitionWorkUpdate } from './requisition.logic';

export async function jobWorkUpdate(tx: Prisma.TransactionClient, job: { id: string; status: string }, actorId: string, label = 'Requisition') {
  if (['READY', 'COMPLETED'].includes(job.status.toUpperCase())) await assertDepositPaid(tx, job.id);
  return requisitionWorkUpdate(job.status, actorId, label);
}
