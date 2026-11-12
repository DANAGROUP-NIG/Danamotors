import { Prisma, type JobcardNotificationEvent } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';
import {
  actionTargets, canonicalNotificationStatus, isWorkingTime, notificationEvents,
  notificationPolicy, reminderEvents, routeJobNotification,
  type JobNotificationEvent, type NotificationJob, type RecipientTarget,
} from './jobcard-notification-policy';

const jobSnapshot = z.object({
  id: z.string(), branchId: z.string(), jobNumber: z.string(), status: z.string(),
  technicianId: z.string().nullable(), qualityInspectorId: z.string().nullable(),
  serviceAdvisorId: z.string().nullable(), deliveryAdvisorId: z.string().nullable(),
  createdById: z.string().nullable(), customerId: z.string().nullable(),
  qcStatus: z.string().nullable(), qcNotes: z.string().nullable(), promisedAt: z.string().nullable(),
});

function warning(message: string) {
  process.emitWarning(message, { code: 'JOBCARD_NOTIFICATION_WARNING' });
}

// Assignment/QC do not have a status-history actor. Set transaction-local context;
// no global connection/session state survives commit or rollback.
export async function setNotificationActor(tx: Prisma.TransactionClient, actorId?: string) {
  if (actorId) await tx.$queryRaw(Prisma.sql`SELECT set_config('app.notification_actor', ${actorId}, true)`);
}

interface Delivery { recipientId: string; userId?: string; customerId?: string; intents: Set<string>; fyi: boolean }

async function resolveTargets(tx: Prisma.TransactionClient, card: NotificationJob, actorId: string | null, targets: RecipientTarget[]) {
  const deliveries = new Map<string, Delivery>();
  const add = (recipientId: string, target: RecipientTarget, customer = false) => {
    if (!customer && recipientId === actorId) return;
    const key = `${customer ? 'customer' : 'user'}:${recipientId}`;
    const existing = deliveries.get(key);
    if (existing) { existing.intents.add(target.intent); existing.fyi = existing.fyi && !!target.fyi; }
    else deliveries.set(key, { recipientId: key, ...(customer ? { customerId: recipientId } : { userId: recipientId }), intents: new Set([target.intent]), fyi: !!target.fyi });
  };
  for (const target of targets) {
    if (target.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: target.customerId }, select: { account: { select: { isActive: true } } } });
      // Customers without portal accounts cannot receive in-app notifications.
      if (customer?.account?.isActive) add(target.customerId, target, true);
      continue;
    }
    const users = await tx.user.findMany({ where: {
      isActive: true, branchId: card.branchId,
      ...(target.userId ? { id: target.userId } : target.permission ? { role: { permissions: { some: { permission: { name: target.permission } } } } } : { role: { name: target.role } }),
    }, select: { id: true } });
    if (users.length) { users.forEach(user => add(user.id, target)); continue; }
    warning(`Jobcard ${card.id}: no active recipient for ${target.role ?? target.permission ?? target.userId}; falling back to Admin`);
    const admins = await activeAdmins(tx, card.branchId);
    const eligible = admins.filter(user => user.id !== actorId);
    if (!eligible.length) throw new Error('No active non-actor Admin available for fallback');
    eligible.forEach(user => add(user.id, { ...target, intent: `Fallback: ${target.intent}` }));
  }
  return [...deliveries.values()];
}

async function activeAdmins(tx: Prisma.TransactionClient, branchId?: string) {
  const role = { name: { in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] } };
  if (branchId) {
    const local = await tx.user.findMany({ where: { isActive: true, branchId, role }, select: { id: true } });
    if (local.length) return local;
  }
  return tx.user.findMany({ where: { isActive: true, role }, select: { id: true } });
}

export function notificationDedupeKey(jobCardId: string, event: string, eventId: string, recipientId: string) {
  return `jobcard:${jobCardId}:${event}:${eventId}:${recipientId}`;
}

async function deliver(tx: Prisma.TransactionClient, row: JobcardNotificationEvent, event: JobNotificationEvent, before: NotificationJob | null, card: NotificationJob) {
  let targets = routeJobNotification(event, before, card);
  if (!targets.length) return;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${card.id} FOR SHARE`);
  const live = await tx.jobCard.findUnique({ where: { id: card.id }, include: { vehicle: true, customer: true } });
  if (!live) throw new Error('Jobcard missing during notification routing');
  const stale = canonicalNotificationStatus(live.status) !== canonicalNotificationStatus(card.status)
    || live.technicianId !== card.technicianId || live.qcStatus?.toUpperCase() !== card.qcStatus?.toUpperCase()
    || live.qualityInspectorId !== card.qualityInspectorId || live.serviceAdvisorId !== card.serviceAdvisorId
    || live.deliveryAdvisorId !== card.deliveryAdvisorId;
  if (stale) {
    await tx.jobcardNotificationAudit.createMany({ data: [{ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: 'obsolete-action', status: 'SUPPRESSED_STALE_ACTION', createdAt: new Date() }], skipDuplicates: true });
    targets = targets.filter(target => target.fyi);
    if (!targets.length) return;
  }
  const actor = row.actorId ? await tx.user.findUnique({ where: { id: row.actorId }, select: { firstName: true, lastName: true } }) : null;
  const deliveries = await resolveTargets(tx, card, row.actorId, targets);
  if (!deliveries.length) {
    // This is expected when every resolved recipient is the acting user, or the
    // only informational customer has no portal account. Keep an audit marker.
    await tx.jobcardNotificationAudit.createMany({ data: [{ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: row.actorId ? `actor:${row.actorId}` : 'none', status: 'SUPPRESSED_NO_ELIGIBLE_RECIPIENT', createdAt: new Date() }], skipDuplicates: true });
    return;
  }
  const customer = live.customer ? `${live.customer.firstName} ${live.customer.lastName}` : 'Customer not recorded';
  const vehicle = live.vehicle?.registrationNumber ?? 'Vehicle not recorded';
  const actorName = actor ? `${actor.firstName} ${actor.lastName} (${row.actorId})` : row.actorId ?? 'System';
  const from = before ? canonicalNotificationStatus(before.status) : 'NONE';
  const to = canonicalNotificationStatus(card.status);
  // TODO(confirm): JobCard has no priority field; never invent a priority.
  const context = `Jobcard ${card.jobNumber} (${card.id}); ${vehicle}; ${customer}; ${from} → ${to}; triggered by ${actorName}; due ${card.promisedAt ?? 'not set'}; priority not recorded`;
  const data = deliveries.map(delivery => ({
    ...(delivery.userId ? { userId: delivery.userId } : { customerId: delivery.customerId }),
    branchId: card.branchId, type: `JOBCARD_${event}`, title: `${delivery.fyi ? 'FYI: ' : ''}${[...delivery.intents].join('; ')}`,
    message: `${context}; ${delivery.fyi ? 'FYI' : 'Action required'}: ${[...delivery.intents].join('; ')}`,
    link: delivery.customerId ? `/portal/service-history/${card.id}` : `/job-cards/${card.id}`,
    dedupeKey: notificationDedupeKey(card.id, event, row.id, delivery.recipientId),
  }));
  await tx.notification.createMany({ data, skipDuplicates: true });
  await tx.jobcardNotificationAudit.createMany({ data: deliveries.map(delivery => ({ jobCardId: card.id, eventId: row.id, eventType: event, recipientId: delivery.recipientId, channel: 'in-app', status: 'DELIVERED', createdAt: new Date() })), skipDuplicates: true });
}

async function recordFailure(row: JobcardNotificationEvent, attempts: number) {
  warning(`Jobcard ${row.jobCardId}: notification event ${row.id} failed after ${attempts} attempts`);
  // Store a bounded technical reason, never driver errors/SQL parameters.
  await prisma.notificationFailure.upsert({ where: { eventId: row.id }, create: { jobCardId: row.jobCardId, eventId: row.id, reason: 'Notification routing or persistence failed; inspect server warning and event snapshot', attempts, createdAt: new Date() }, update: { attempts } });
  await prisma.$transaction(async tx => {
    const snapshot = jobSnapshot.extend({ vehicleId: z.string().nullable().optional() }).safeParse(row.after);
    const card = snapshot.success ? snapshot.data : null;
    const admins = (await activeAdmins(tx, card?.branchId)).filter(admin => admin.id !== row.actorId);
    if (!admins.length) throw new Error('No active Admin for notification failure alert');
    const previous = row.before ? jobSnapshot.safeParse(row.before) : null;
    const context = `Jobcard ${card?.jobNumber ?? 'unknown'} (${row.jobCardId}); vehicle ${card?.vehicleId ?? 'not recorded'}; customer ${card?.customerId ?? 'not recorded'}; ${previous?.success ? canonicalNotificationStatus(previous.data.status) : 'NONE'} → ${card ? canonicalNotificationStatus(card.status) : 'UNKNOWN'}; triggered by ${row.actorId ?? 'System'}; due ${card?.promisedAt ?? 'not set'}; priority not recorded`;
    await tx.notification.createMany({ data: admins.map(admin => ({ userId: admin.id, branchId: card?.branchId, type: 'JOBCARD_NOTIFICATION_FAILURE', title: 'Jobcard notification failed', message: `${context}; action required: investigate notification_failures and replay event ${row.id}, which failed after ${attempts} attempts.`, link: `/job-cards/${row.jobCardId}`, dedupeKey: notificationDedupeKey(row.jobCardId, 'FAILURE', row.id, admin.id) })), skipDuplicates: true });
    await tx.jobcardNotificationAudit.createMany({ data: admins.map(admin => ({ jobCardId: row.jobCardId, eventId: row.id, eventType: 'FAILURE_ALERT', recipientId: `user:${admin.id}`, status: 'DELIVERED', createdAt: new Date() })), skipDuplicates: true });
    await tx.jobcardNotificationAudit.createMany({ data: [{ jobCardId: row.jobCardId, eventId: row.id, eventType: 'ROUTING', recipientId: 'unresolved', status: 'FAILED', createdAt: new Date() }], skipDuplicates: true });
    await tx.jobcardNotificationEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
  });
}

export async function processJobcardNotification(row: JobcardNotificationEvent, now = new Date()) {
  const policy = notificationPolicy();
  for (let attempt = 0; attempt <= policy.retryMs.length; attempt += 1) {
    try {
      await prisma.$transaction(async tx => {
        // Serialize competing workers; deliveries/audit and processed marker commit together.
        await tx.$queryRaw(Prisma.sql`SELECT id FROM jobcard_notification_events WHERE id = ${row.id} FOR UPDATE`);
        const current = await tx.jobcardNotificationEvent.findUnique({ where: { id: row.id } });
        if (!current || current.processedAt) return;
        const card = jobSnapshot.parse(current.after);
        const before = current.before ? jobSnapshot.parse(current.before) : null;
        const metadata = z.object({ notificationEvent: z.string().optional(), actionOccurrence: z.string().optional() }).parse(current.after);
        const timerEvents = ['REMINDER', 'ESCALATION', 'PROMISED_24H', 'PROMISED_12H'] as const;
        const timerEvent = timerEvents.find(event => event === metadata.notificationEvent);
        if (timerEvent && !isWorkingTime(now, policy)) return;
        if (timerEvent && metadata.actionOccurrence) {
          const latest = await tx.jobcardNotificationEvent.findFirst({ where: { jobCardId: card.id, NOT: { id: { startsWith: 'timer:' } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
          if (latest && latest.id !== metadata.actionOccurrence) {
            await tx.jobcardNotificationAudit.createMany({ data: [{ jobCardId: card.id, eventId: current.id, eventType: timerEvent, recipientId: 'obsolete-action', status: 'SUPPRESSED_STALE_ACTION', createdAt: now }], skipDuplicates: true });
            await tx.jobcardNotificationEvent.update({ where: { id: current.id }, data: { processedAt: now } });
            return;
          }
        }
        const events = timerEvent ? [timerEvent] : notificationEvents(before, card);
        for (const event of events) await deliver(tx, current, event, before, card);
        await tx.jobcardNotificationEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
      }, { maxWait: 5000, timeout: 15000 });
      return;
    } catch {
      if (attempt < policy.retryMs.length) await new Promise(resolve => setTimeout(resolve, policy.retryMs[attempt]));
    }
  }
  try { await recordFailure(row, policy.retryMs.length + 1); }
  catch {
    // A database outage cannot persist its own failure. Leave the outbox pending
    // for the next sweep and emit an observable warning rather than dropping it.
    warning(`Jobcard ${row.jobCardId}: failure recording/Admin alert unavailable; event ${row.id} remains pending`);
  }
}

export async function drainJobcardNotifications(jobCardId?: string, now?: Date) {
  try {
    const rows = await prisma.jobcardNotificationEvent.findMany({ where: { processedAt: null, ...(jobCardId ? { jobCardId } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 });
    for (const row of rows) await processJobcardNotification(row, now);
  } catch { warning('Jobcard notification outbox unavailable; pending events will be retried'); }
}

export async function sendJobcardReminders(now = new Date()) {
  const policy = notificationPolicy();
  if (!isWorkingTime(now, policy)) return;
  const cards = await prisma.jobCard.findMany({ where: { status: { notIn: ['DELIVERED', 'CANCELLED', 'Closed', 'Cancelled'] } }, include: { statusHistory: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  for (const live of cards) {
    const card = jobSnapshot.parse(JSON.parse(JSON.stringify(live)));
    if (!actionTargets(card).length) continue;
    const latest = await prisma.jobcardNotificationEvent.findFirst({ where: { jobCardId: card.id, NOT: { id: { startsWith: 'timer:' } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const since = latest?.createdAt ?? live.statusHistory[0]?.createdAt ?? live.createdAt;
    const occurrence = latest?.id ?? `${canonicalNotificationStatus(card.status)}:${since.toISOString()}`;
    const events = reminderEvents(since, now, card, policy);
    if (process.env.JOB_PROMISED_REMINDERS_ENABLED === 'true' && card.promisedAt) {
      const hours = (new Date(card.promisedAt).getTime() - now.getTime()) / 3_600_000;
      if (hours > 0 && hours <= 24) events.push('PROMISED_24H');
      if (hours > 0 && hours <= 12) events.push('PROMISED_12H');
    }
    for (const event of events) {
      const marker = event.startsWith('PROMISED_') ? card.promisedAt : occurrence;
      const id = `timer:${card.id}:${event}:${marker}`;
      await prisma.jobcardNotificationEvent.upsert({ where: { id }, create: { id, jobCardId: card.id, actorId: null, before: { ...card }, after: { ...card, notificationEvent: event, actionOccurrence: occurrence }, createdAt: now }, update: {} });
    }
  }
}

export function startJobcardNotifications() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await drainJobcardNotifications(); await sendJobcardReminders(); await drainJobcardNotifications(); }
    catch { warning('Jobcard notification sweep failed; will retry'); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, notificationPolicy().pollMs);
  timer.unref();
  return () => clearInterval(timer);
}

// Explicit replay is a dev/operations action; preserve the original event ID so
// deliveries already persisted cannot be duplicated.
export async function replayJobcardNotification(eventId: string) {
  await prisma.jobcardNotificationEvent.update({ where: { id: eventId }, data: { processedAt: null } });
  const row = await prisma.jobcardNotificationEvent.findUniqueOrThrow({ where: { id: eventId } });
  await processJobcardNotification(row);
}

