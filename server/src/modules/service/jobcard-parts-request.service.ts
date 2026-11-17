import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { workshopNotification } from '../notification/notification.events';
import { canonicalNotificationStatus } from '../notification/jobcard-notification-policy';

/** Notification only: no requisition, part issuance or lifecycle mutation. */
export async function requestJobcardParts(jobCardId: string, branchId: string, actorId: string, requestId: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} AND "branchId" = ${branchId} FOR UPDATE`);
    const card = await tx.jobCard.findFirst({
      where: { id: jobCardId, branchId },
      include: { customer: true, vehicle: true },
  });
  if (!card) throw new NotFoundError('Job card not found');
  if (card.billedAt || ['BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalNotificationStatus(card.status))) {
    throw new BadRequestError('Parts cannot be requested for a billed or closed job card');
  }
  // This button targets this branch only; the separate requisition notification
  // retains its existing GeneralStoreManager recipients.
  const recipients = await tx.user.findMany({
    where: { branchId: card.branchId, isActive: true, role: { name: ROLES.BRANCH_STORE_MANAGER }, id: { not: actorId } },
    select: { id: true },
  });
  if (!recipients.length) throw new BadRequestError('No other active Store Manager is available in this branch');
  const notification = workshopNotification('PART_REQUESTED', {
    dedupeKey: `${card.id}:button:${requestId}`, jobCardId: card.id, jobNumber: card.jobNumber, branchId: card.branchId,
    customer: card.customer ? `${card.customer.firstName} ${card.customer.lastName}` : 'Customer',
    registration: card.vehicle?.registrationNumber ?? 'Registration not recorded',
  });
  await tx.notification.createMany({ data: recipients.map(user => ({ ...notification, userId: user.id })), skipDuplicates: true });
  await tx.jobCard.update({ where: { id: card.id }, data: { partsRequestedAt: card.partsRequestedAt ?? new Date() } });
  });
}
