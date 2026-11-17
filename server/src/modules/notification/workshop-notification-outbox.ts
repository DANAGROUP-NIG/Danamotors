import type { JobCard, JobcardNotificationEvent, Prisma } from '@prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { canonicalNotificationStatus, type NotificationJob } from './jobcard-notification-policy';
import { workshopNotification, type WorkshopEvent } from './notification.events';

export const DURABLE_WORKSHOP_EVENTS = ['PART_REQUESTED', 'PARTS_ISSUED', 'PARTS_UNAVAILABLE', 'PART_RECEIVED'] as const;
export type DurableWorkshopEvent = typeof DURABLE_WORKSHOP_EVENTS[number];

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

type WorkshopJob = Pick<JobCard, 'id' | 'branchId' | 'jobNumber' | 'status' | 'technicianId' | 'qualityInspectorId' | 'serviceAdvisorId' | 'deliveryAdvisorId' | 'createdById' | 'customerId' | 'qcStatus' | 'qcNotes' | 'promisedAt'>;

/** Persist with the business write; the existing worker performs delivery after commit. */
export async function enqueueWorkshopNotification(tx: Prisma.TransactionClient, event: DurableWorkshopEvent, card: WorkshopJob, occurrenceId: string, actorId: string, branchStoreOnly = false) {
  const after = {
    id: card.id, branchId: card.branchId, jobNumber: card.jobNumber, status: card.status,
    technicianId: card.technicianId, qualityInspectorId: card.qualityInspectorId,
    serviceAdvisorId: card.serviceAdvisorId, deliveryAdvisorId: card.deliveryAdvisorId,
    createdById: card.createdById, customerId: card.customerId, qcStatus: card.qcStatus,
    qcNotes: card.qcNotes, promisedAt: card.promisedAt?.toISOString() ?? null,
    workshopEvent: event, workshopOccurrence: occurrenceId, branchStoreOnly,
  } satisfies Prisma.InputJsonObject;
  const id = `workshop:${card.id}:${event}:${occurrenceId}`;
  await tx.jobcardNotificationEvent.upsert({ where: { id }, create: { id, jobCardId: card.id, actorId, after }, update: {} });
}

export async function deliverWorkshopNotification(tx: Prisma.TransactionClient, row: JobcardNotificationEvent, event: DurableWorkshopEvent, card: NotificationJob, occurrence: string, branchStoreOnly: boolean, now: Date) {
  await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${card.id} FOR SHARE`;
  const live = await tx.jobCard.findUnique({ where: { id: card.id }, include: { customer: true, vehicle: true } });
  if (!live) throw new Error('Job missing during parts notification delivery');
  const obsolete = live.branchId !== card.branchId || (['PART_REQUESTED', 'PARTS_UNAVAILABLE'].includes(event) && ['BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalNotificationStatus(live.status)));
  if (obsolete) {
    await tx.jobcardNotificationAudit.createMany({ data: [{ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: 'obsolete-parts', status: 'SUPPRESSED_STALE_ACTION', createdAt: now }], skipDuplicates: true });
    return;
  }
  const where = branchStoreOnly ? { isActive: true, branchId: card.branchId, role: { name: ROLES.BRANCH_STORE_MANAGER } } : workshopRecipients(event, live);
  const users = await tx.user.findMany({ where, select: { id: true } });
  if (!users.length) throw new Error('No active parts notification recipient');
  const recipients = users.filter(user => user.id !== row.actorId);
  const notification = workshopNotification(event, { dedupeKey: `${card.id}:${occurrence}`, jobCardId: card.id, jobNumber: live.jobNumber, branchId: live.branchId,
    customer: live.customer ? `${live.customer.firstName} ${live.customer.lastName}` : 'Customer not recorded', registration: live.vehicle?.registrationNumber ?? 'Registration not recorded' });
  if (recipients.length) await tx.notification.createMany({ data: recipients.map(user => ({ ...notification, userId: user.id })), skipDuplicates: true });
  await tx.jobcardNotificationAudit.createMany({ data: recipients.length
    ? recipients.map(user => ({ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: `user:${user.id}`, channel: 'in-app', status: 'DELIVERED', createdAt: now }))
    : [{ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: 'actor-only', status: 'SUPPRESSED_NO_ELIGIBLE_RECIPIENT', createdAt: now }], skipDuplicates: true });
}
