import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { NotificationService } from './notification.service';
import type { WorkshopEvent } from './notification.events';
import { drainJobcardNotifications, sendJobcardReminders } from './jobcard-notification-router';

export function workshopRecipients(event: WorkshopEvent, card: { branchId: string; serviceAdvisorId: string | null; technicianId: string | null; qualityInspectorId: string | null }) {
  const ids: string[] = [];
  const roles: string[] = [];
  const queries: Prisma.UserWhereInput[] = [];
  if (event === 'PART_REQUESTED') {
    roles.push(ROLES.BRANCH_STORE_MANAGER);
    queries.push({ role: { name: ROLES.GENERAL_STORE_MANAGER } });
  } else {
    if (card.serviceAdvisorId) ids.push(card.serviceAdvisorId); else roles.push(ROLES.SERVICE_ADVISOR);
    if (['PARTS_ISSUED', 'PART_RECEIVED'].includes(event) && card.technicianId) ids.push(card.technicianId);
  }
  if (ids.length) queries.push({ id: { in: ids }, branchId: card.branchId });
  if (roles.length) queries.push({ branchId: card.branchId, role: { name: { in: roles } } });
  return { isActive: true, OR: queries } satisfies Prisma.UserWhereInput;
}

// Called only after the business transaction resolves. Notification failures never roll it back.
export async function notifyWorkshopEvent(event: WorkshopEvent, jobCardId: string, occurrenceId: string) {
  if (event.startsWith('PROMISED_')) {
    await sendJobcardReminders();
    await drainJobcardNotifications(jobCardId);
    return;
  }
  if (['TECHNICIAN_ASSIGNED', 'JOB_SENT_FOR_QC', 'QC_PASSED', 'QC_FAILED', 'JOB_READY'].includes(event)) {
    await drainJobcardNotifications(jobCardId);
    return;
  }
  try {
    const card = await prisma.jobCard.findUnique({ where: { id: jobCardId }, include: { customer: { include: { account: { select: { isActive: true } } } }, vehicle: true } });
    if (!card) return;
    const users = await prisma.user.findMany({ where: workshopRecipients(event, card), select: { id: true } });
    await new NotificationService().notify(event, { userIds: users.map(user => user.id) }, {
      dedupeKey: `${jobCardId}:${occurrenceId}`, jobCardId, jobNumber: card.jobNumber, branchId: card.branchId,
      customer: card.customer ? `${card.customer.firstName} ${card.customer.lastName}` : 'Customer', registration: card.vehicle?.registrationNumber ?? 'Registration not recorded',
    });
  } catch { process.emitWarning('Workshop notification recipient resolution failed', { code: 'NOTIFICATION_RECIPIENT_FAILED' }); }
}
