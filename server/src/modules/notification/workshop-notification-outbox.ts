import { JobStage, type JobCard, type JobcardNotificationEvent, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { ROLES } from '../../shared/constants/roles';
import { canonicalNotificationStatus, type NotificationJob } from './jobcard-notification-policy';
import { workshopNotification, type WorkshopEvent } from './notification.events';
import { STAGE_LABELS } from '../service/job-stage.logic';

export const DURABLE_WORKSHOP_EVENTS = ['PART_REQUESTED', 'PARTS_ISSUED', 'PARTS_UNAVAILABLE', 'PART_RECEIVED', 'STAGE_HANDOFF'] as const;

/** The stage snapshot a STAGE_HANDOFF event carries, so delivery can tell when it is out of date. */
const stageHandoff = z.object({ stage: z.nativeEnum(JobStage), stageOwnerId: z.string().nullable(), stageOwnerRole: z.string(), returnNote: z.string().optional() });

/** The new owner of the job: the named person, or everyone with the owner role in the branch. */
export function stageHandoffRecipients(branchId: string, handoff: { stageOwnerId: string | null; stageOwnerRole: string }) {
  return handoff.stageOwnerId
    ? { isActive: true, branchId, id: handoff.stageOwnerId }
    : { isActive: true, branchId, role: { name: handoff.stageOwnerRole } } satisfies Prisma.UserWhereInput;
}
export type DurableWorkshopEvent = typeof DURABLE_WORKSHOP_EVENTS[number];

export function workshopRecipients(event: WorkshopEvent, card: { branchId: string; serviceAdvisorId: string | null; technicianId: string | null; qualityInspectorId: string | null }, signerId?: string | null) {
  const ids: string[] = [];
  const roles: string[] = [];
  const queries: Prisma.UserWhereInput[] = [];
  if (event === 'PART_REQUESTED') {
    roles.push(ROLES.BRANCH_STORE_MANAGER);
    queries.push({ role: { name: ROLES.GENERAL_STORE_MANAGER } });
  } else if (event === 'PART_RECEIVED') {
    if (signerId) ids.push(signerId);
    if (card.serviceAdvisorId) ids.push(card.serviceAdvisorId);
  } else {
    if (card.serviceAdvisorId) ids.push(card.serviceAdvisorId); else roles.push(ROLES.SERVICE_ADVISOR);
    if (event === 'PARTS_ISSUED' && card.technicianId) ids.push(card.technicianId);
  }
  if (ids.length) queries.push({ id: { in: ids }, branchId: card.branchId });
  if (roles.length) queries.push({ branchId: card.branchId, role: { name: { in: roles } } });
  return { isActive: true, OR: queries } satisfies Prisma.UserWhereInput;
}

type WorkshopJob = Pick<JobCard, 'id' | 'branchId' | 'jobNumber' | 'status' | 'technicianId' | 'qualityInspectorId' | 'serviceAdvisorId' | 'deliveryAdvisorId' | 'createdById' | 'customerId' | 'qcStatus' | 'qcNotes' | 'promisedAt'>;

/** Persist with the business write; the existing worker performs delivery after commit. */
export async function enqueueWorkshopNotification(tx: Prisma.TransactionClient, event: DurableWorkshopEvent, card: WorkshopJob, occurrenceId: string, actorId: string, branchStoreOnly = false, extra: Prisma.InputJsonObject = {}) {
  const after = {
    id: card.id, branchId: card.branchId, jobNumber: card.jobNumber, status: card.status,
    technicianId: card.technicianId, qualityInspectorId: card.qualityInspectorId,
    serviceAdvisorId: card.serviceAdvisorId, deliveryAdvisorId: card.deliveryAdvisorId,
    createdById: card.createdById, customerId: event === 'PART_RECEIVED' ? null : card.customerId, qcStatus: card.qcStatus,
    qcNotes: event === 'PART_RECEIVED' ? null : card.qcNotes, promisedAt: card.promisedAt?.toISOString() ?? null,
    workshopEvent: event, workshopOccurrence: occurrenceId, branchStoreOnly, ...extra,
  } satisfies Prisma.InputJsonObject;
  const id = `workshop:${card.id}:${event}:${occurrenceId}`;
  await tx.jobcardNotificationEvent.upsert({ where: { id }, create: { id, jobCardId: card.id, actorId, after }, update: {} });
}

export async function deliverWorkshopNotification(tx: Prisma.TransactionClient, row: JobcardNotificationEvent, event: DurableWorkshopEvent, card: NotificationJob, occurrence: string, branchStoreOnly: boolean, now: Date) {
  await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${card.id} FOR SHARE`;
  const isReceipt = event === 'PART_RECEIVED';
  const handoff = event === 'STAGE_HANDOFF' ? stageHandoff.parse(row.after) : null;
  const live = await tx.jobCard.findUnique({ where: { id: card.id }, include: { customer: !isReceipt, vehicle: true } });
  if (!live) throw new Error('Job missing during parts notification delivery');
  // A handoff is out of date once the job has moved on or changed hands again.
  const movedOn = !!handoff && (live.stage !== handoff.stage || live.stageOwnerId !== handoff.stageOwnerId || live.stageOwnerRole !== handoff.stageOwnerRole);
  const obsolete = live.branchId !== card.branchId || movedOn || (['PART_REQUESTED', 'PARTS_UNAVAILABLE'].includes(event) && ['BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalNotificationStatus(live.status)));
  if (obsolete) {
    await tx.jobcardNotificationAudit.createMany({ data: [{ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: 'obsolete-parts', status: 'SUPPRESSED_STALE_ACTION', createdAt: now }], skipDuplicates: true });
    return;
  }
  const where = handoff ? stageHandoffRecipients(card.branchId, handoff)
    : branchStoreOnly ? { isActive: true, branchId: card.branchId, role: { name: ROLES.BRANCH_STORE_MANAGER } } : workshopRecipients(event, live, row.actorId);
  const users = await tx.user.findMany({ where, select: { id: true } });
  if (!users.length && !isReceipt && !handoff) throw new Error('No active parts notification recipient');
  const recipients = users.filter(user => isReceipt || user.id !== row.actorId);
  const notification = workshopNotification(event, { dedupeKey: `${card.id}:${occurrence}`, jobCardId: card.id, jobNumber: live.jobNumber, branchId: live.branchId,
    customer: isReceipt ? undefined : live.customer ? `${live.customer.firstName} ${live.customer.lastName}` : 'Customer not recorded', registration: live.vehicle?.registrationNumber ?? 'Registration not recorded', step: handoff ? STAGE_LABELS[handoff.stage] : undefined, returnNote: handoff?.returnNote });
  if (recipients.length) await tx.notification.createMany({ data: recipients.map(user => ({ ...notification, userId: user.id })), skipDuplicates: true });
  await tx.jobcardNotificationAudit.createMany({ data: recipients.length
    ? recipients.map(user => ({ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: `user:${user.id}`, channel: 'in-app', status: 'DELIVERED', createdAt: now }))
    : [{ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: isReceipt || (handoff && !users.length) ? 'no-eligible-recipient' : 'actor-only', status: 'SUPPRESSED_NO_ELIGIBLE_RECIPIENT', createdAt: now }], skipDuplicates: true });
}
