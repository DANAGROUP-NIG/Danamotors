import { Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { branchStoreRecipients, enqueueWorkshopNotification } from '../notification/workshop-notification-outbox';
import { canonicalNotificationStatus } from '../notification/jobcard-notification-policy';

/** The branch store staff who receive a parts request (the actor is left out). */
export function branchStoreManagers(tx: Prisma.TransactionClient, branchId: string, actorId: string) {
  return branchStoreRecipients(tx, branchId, actorId || undefined);
}

/**
 * Tells the branch store that this job needs parts. Notification only: no requisition, part issuance
 * or stock change. Call while holding the job row lock. The occurrence makes it idempotent: the same
 * occurrence (a client request ID, or an estimate revision) is announced once.
 */
export async function notifyStoreOfParts(tx: Prisma.TransactionClient, jobCardId: string, branchId: string, actorId: string, occurrence: string) {
  const card = await tx.jobCard.findFirst({ where: { id: jobCardId, branchId }, include: { customer: true, vehicle: true } });
  if (!card) throw new NotFoundError('Job card not found');
  if (card.billedAt || ['BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalNotificationStatus(card.status)))
    throw new BadRequestError('Parts cannot be requested for a billed or closed job card');
  // This targets this branch only; the separate requisition notification keeps its GeneralStoreManager recipients.
  const recipients = await branchStoreManagers(tx, card.branchId, actorId);
  if (!recipients.length) throw new BadRequestError('No store manager is active in this branch. Ask an administrator to add one, then retry the parts request.');
  await enqueueWorkshopNotification(tx, 'PART_REQUESTED', card, occurrence, actorId, true);
  await tx.jobCard.update({ where: { id: card.id }, data: { partsRequestedAt: card.partsRequestedAt ?? new Date() } });
  return recipients;
}
