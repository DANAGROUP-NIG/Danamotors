import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { NotificationService } from './notification.service';
import type { WorkshopEvent } from './notification.events';

export function workshopRecipients(event: WorkshopEvent, card: { branchId: string; serviceAdvisorId: string | null; technicianId: string | null; qualityInspectorId: string | null }) {
  const ids: string[] = [];
  const roles: string[] = [];
  const queries: Prisma.UserWhereInput[] = [];
  if (event === 'PART_REQUESTED') {
    roles.push(ROLES.BRANCH_STORE_MANAGER);
    queries.push({ role: { name: ROLES.GENERAL_STORE_MANAGER } });
  } else if (event === 'TECHNICIAN_ASSIGNED') {
    if (card.technicianId) ids.push(card.technicianId);
  } else if (event === 'JOB_SENT_FOR_QC') {
    if (card.qualityInspectorId) ids.push(card.qualityInspectorId);
    queries.push({ branchId: card.branchId, role: { permissions: { some: { permission: { name: PERMISSIONS.QCSTATUS_UPDATE } } } } });
  } else {
    if (card.serviceAdvisorId) ids.push(card.serviceAdvisorId); else roles.push(ROLES.SERVICE_ADVISOR);
    if (['PARTS_ISSUED', 'PART_RECEIVED', 'QC_FAILED', 'PROMISED_24H', 'PROMISED_12H'].includes(event) && card.technicianId) ids.push(card.technicianId);
    if (event === 'JOB_READY') roles.push(ROLES.CCU_OFFICER);
  }
  if (ids.length) queries.push({ id: { in: ids }, branchId: card.branchId });
  if (roles.length) queries.push({ branchId: card.branchId, role: { name: { in: roles } } });
  return { isActive: true, OR: queries } satisfies Prisma.UserWhereInput;
}

// Called only after the business transaction resolves. Notification failures never roll it back.
export async function notifyWorkshopEvent(event: WorkshopEvent, jobCardId: string, occurrenceId: string) {
  try {
    const card = await prisma.jobCard.findUnique({ where: { id: jobCardId }, include: { customer: { include: { account: { select: { isActive: true } } } }, vehicle: true } });
    if (!card) return;
    if (event.startsWith('PROMISED_') && (!['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'QC', 'Open', 'Pending', 'In Progress', 'On Hold', 'Quality Check'].includes(card.status) || card.billedAt)) return;
    const users = await prisma.user.findMany({ where: workshopRecipients(event, card), select: { id: true } });
    const customerIds = ['JOB_READY', 'PROMISED_24H', 'PROMISED_12H'].includes(event) && card.customer?.account?.isActive ? [card.customer.id] : [];
    await new NotificationService().notify(event, { userIds: users.map(user => user.id), customerIds }, {
      dedupeKey: `${jobCardId}:${occurrenceId}`, jobCardId, jobNumber: card.jobNumber, branchId: card.branchId,
      customer: card.customer ? `${card.customer.firstName} ${card.customer.lastName}` : 'Customer', registration: card.vehicle?.registrationNumber ?? 'Registration not recorded',
    });
  } catch { process.emitWarning('Workshop notification recipient resolution failed', { code: 'NOTIFICATION_RECIPIENT_FAILED' }); }
}
