jest.mock('../../prisma/client', () => {
  const tx = {
    $queryRaw: jest.fn(), jobCard: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() }, customer: { findUnique: jest.fn() },
    notification: { createMany: jest.fn() }, notificationFailure: { upsert: jest.fn() },
    jobcardNotificationAudit: { createMany: jest.fn() },
    jobcardNotificationEvent: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), upsert: jest.fn(), createMany: jest.fn() },
  };
  return { __esModule: true, default: { ...tx, $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) } };
});
import { Prisma, type JobcardNotificationEvent } from '@prisma/client';
import prisma from '../../prisma/client';
import { drainJobcardNotifications, notificationDedupeKey, processJobcardNotification, sendJobcardReminders } from './jobcard-notification-router';

const snapshot = { id: 'job', branchId: 'branch', jobNumber: 'J1', status: 'IN_PROGRESS', technicianId: 'tech', qualityInspectorId: 'qc', serviceAdvisorId: 'advisor', deliveryAdvisorId: null, createdById: 'requester', customerId: 'customer', qcStatus: 'PENDING', qcNotes: null, promisedAt: '2026-11-13T10:00:00.000Z' };
function row(after = snapshot, before = { ...snapshot, status: 'OPEN' }): JobcardNotificationEvent {
  return { id: 'event-1', jobCardId: 'job', actorId: 'actor', before, after, createdAt: new Date('2026-11-12T08:00:00Z'), processedAt: null };
}
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...snapshot, vehicle: { registrationNumber: 'TEST' }, customer: { firstName: 'Test', lastName: 'Customer' } });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ firstName: 'Test', lastName: 'Actor' });
  (prisma.user.findMany as jest.Mock).mockImplementation(({ where }: { where: Prisma.UserWhereInput }) => Promise.resolve([{ id: where.id ?? 'role-user' }]));
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ account: { isActive: true } });
  (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.jobcardNotificationEvent.findUnique as jest.Mock).mockResolvedValue(row());
});

it('persists exactly one per recipient with context, correct link and audit', async () => {
  await processJobcardNotification(row());
  const data = (prisma.notification.createMany as jest.Mock).mock.calls[0][0].data;
  expect(data.map((entry: { userId: string }) => entry.userId)).toEqual(['tech', 'advisor']);
  expect(data[0]).toMatchObject({ link: '/job-cards/job', dedupeKey: 'jobcard:job:STATUS:event-1:user:tech' });
  for (const fragment of ['Jobcard J1', 'TEST', 'Test Customer', 'Open to In progress', 'Test Actor', 'due 13 Nov 2026', 'priority not recorded', 'Action required']) expect(data[0].message).toContain(fragment);
  expect(data[1].title).toMatch(/^FYI:/);
  expect(prisma.jobcardNotificationAudit.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true, data: expect.arrayContaining([expect.objectContaining({ recipientId: 'user:tech', channel: 'in-app', status: 'DELIVERED' })]) }));
});

it('excludes the actor and merges overlapping role/assignment recipients', async () => {
  (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'actor' }, { id: 'same-user' }]);
  await processJobcardNotification(row());
  const data = (prisma.notification.createMany as jest.Mock).mock.calls[0][0].data;
  expect(data).toHaveLength(1);
  expect(data[0].userId).toBe('same-user');
  expect(data[0].title).not.toMatch(/^FYI:/);
});

it('warns and falls back to active Admin when an action target is empty', async () => {
  const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
  (prisma.user.findMany as jest.Mock).mockImplementation(({ where }: { where: Prisma.UserWhereInput }) => Promise.resolve(where.role && typeof where.role === 'object' && 'name' in where.role && typeof where.role.name === 'object' ? [{ id: 'admin' }] : []));
  await processJobcardNotification(row());
  expect(warning).toHaveBeenCalled();
  expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ userId: 'admin', title: expect.stringContaining('Fallback:') })] }));
  warning.mockRestore();
});

it('does not resend a processed event and preserves reassignment occurrence IDs', async () => {
  (prisma.jobcardNotificationEvent.findUnique as jest.Mock).mockResolvedValue({ ...row(), processedAt: new Date() });
  await processJobcardNotification(row());
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
  expect(notificationDedupeKey('job', 'ASSIGNED', 'A-first', 'tech-a')).not.toBe(notificationDedupeKey('job', 'ASSIGNED', 'A-again', 'tech-a'));
});

it('retries three times with backoff then persists a failure and Admin alert', async () => {
  jest.useFakeTimers();
  const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
  (prisma.jobCard.findUnique as jest.Mock).mockRejectedValue(new Error('unavailable'));
  const promise = processJobcardNotification(row());
  await jest.runAllTimersAsync();
  await promise;
  expect(prisma.jobCard.findUnique).toHaveBeenCalledTimes(4);
  expect(prisma.notificationFailure.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ attempts: 4, eventId: 'event-1' }) }));
  expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ type: 'JOBCARD_NOTIFICATION_FAILURE' })]) }));
  warning.mockRestore(); jest.useRealTimers();
});

it('a missing card becomes a durable failure rather than a silent drop', async () => {
  jest.useFakeTimers();
  const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(null);
  const promise = processJobcardNotification(row());
  await jest.runAllTimersAsync(); await promise;
  expect(prisma.notificationFailure.upsert).toHaveBeenCalled();
  warning.mockRestore(); jest.useRealTimers();
});

it('suppresses obsolete actions while retaining FYI', async () => {
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...snapshot, status: 'DELIVERED' });
  await processJobcardNotification(row());
  expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ userId: 'advisor', title: expect.stringMatching(/^FYI:/) })] }));
});

it('enqueues stable reminder/escalation markers and does nothing outside working hours', async () => {
  (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([{ ...snapshot, promisedAt: new Date(snapshot.promisedAt), createdAt: new Date('2026-11-12T00:00:00Z'), statusHistory: [] }]);
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ jobCardId: 'job', id: 'assignment-2', createdAt: new Date('2026-11-12T00:00:00Z'), after: snapshot }]);
  await sendJobcardReminders(new Date('2026-11-12T12:00:00Z'));
  expect(prisma.jobcardNotificationEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true, data: expect.arrayContaining([expect.objectContaining({ id: 'timer:job:REMINDER:assignment-2' }), expect.objectContaining({ id: 'timer:job:ESCALATION:assignment-2' })]) }));
  jest.clearAllMocks();
  await sendJobcardReminders(new Date('2026-11-12T19:00:00Z'));
  expect(prisma.jobCard.findMany).not.toHaveBeenCalled();
});

it('keeps promised reminders at 24/12 hours with stable keys and current owners', async () => {
  const previous = process.env.JOB_PROMISED_REMINDERS_ENABLED;
  process.env.JOB_PROMISED_REMINDERS_ENABLED = 'true';
  try {
    const now = new Date('2026-11-12T12:00:00Z');
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([{ ...snapshot, promisedAt: new Date('2026-11-12T23:00:00Z'), createdAt: now, statusHistory: [] }]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ jobCardId: 'job', id: 'action-1', createdAt: now, after: snapshot }]);
    await sendJobcardReminders(now);
    await sendJobcardReminders(now);
    const keys = (prisma.jobcardNotificationEvent.createMany as jest.Mock).mock.calls.flatMap(([input]) => input.data.map((event: { id: string }) => event.id));
    expect(new Set(keys)).toEqual(new Set(['timer:job:PROMISED_12H:2026-11-12T23:00:00.000Z']));
  } finally {
    if (previous === undefined) delete process.env.JOB_PROMISED_REMINDERS_ENABLED; else process.env.JOB_PROMISED_REMINDERS_ENABLED = previous;
  }
});

it('does not deliver stale reminders for an earlier action occurrence', async () => {
  const current = { ...row(), id: 'timer:event', actorId: null, after: { ...snapshot, notificationEvent: 'REMINDER', actionOccurrence: 'old-action' } };
  (prisma.jobcardNotificationEvent.findUnique as jest.Mock).mockResolvedValue(current);
  (prisma.jobcardNotificationEvent.findFirst as jest.Mock).mockResolvedValue({ id: 'new-action' });
  await processJobcardNotification(current, new Date('2026-11-12T12:00:00Z'));
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
  expect(prisma.jobcardNotificationAudit.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ status: 'SUPPRESSED_STALE_ACTION' })] }));
});

it('uses the portal service-history route for the customer FYI', async () => {
  const ready = { ...snapshot, status: 'READY' };
  const current = row(ready, { ...snapshot, status: 'QC' });
  (prisma.jobcardNotificationEvent.findUnique as jest.Mock).mockResolvedValue(current);
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(ready);
  await processJobcardNotification(current);
  expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ customerId: 'customer', link: '/portal/service-history/job', title: 'FYI: Vehicle ready' })]) }));
});

it('delivers promised reminders to the current action owner despite an intervening status change', async () => {
  const previous = process.env.JOB_PROMISED_REMINDERS_ENABLED;
  process.env.JOB_PROMISED_REMINDERS_ENABLED = 'true';
  try {
    const current = { ...row(), id: `timer:job:PROMISED_24H:${snapshot.promisedAt}`, actorId: null, after: { ...snapshot, notificationEvent: 'PROMISED_24H', actionOccurrence: 'old-action' } };
    (prisma.jobcardNotificationEvent.findUnique as jest.Mock).mockResolvedValue(current);
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...snapshot, status: 'QC', promisedAt: new Date(snapshot.promisedAt), customer: { firstName: 'Test', lastName: 'Customer' }, vehicle: { registrationNumber: 'TEST' } });
    await processJobcardNotification(current, new Date('2026-11-12T12:00:00Z'));
    expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ userId: 'qc' })] }));
    expect(prisma.jobcardNotificationEvent.findFirst).not.toHaveBeenCalled();
  } finally { if (previous === undefined) delete process.env.JOB_PROMISED_REMINDERS_ENABLED; else process.env.JOB_PROMISED_REMINDERS_ENABLED = previous; }
});

it('suppresses an old promised date and a superseded 24-hour reminder', async () => {
  const previous = process.env.JOB_PROMISED_REMINDERS_ENABLED;
  process.env.JOB_PROMISED_REMINDERS_ENABLED = 'true';
  try {
    const current = { ...row(), id: 'timer:job:PROMISED_24H:old', actorId: null, after: { ...snapshot, notificationEvent: 'PROMISED_24H' } };
    (prisma.jobcardNotificationEvent.findUnique as jest.Mock).mockResolvedValue(current);
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...snapshot, promisedAt: new Date('2026-11-13T11:00:00Z') });
    await processJobcardNotification(current, new Date('2026-11-12T12:00:00Z'));
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.jobcardNotificationAudit.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ recipientId: 'obsolete-promised-date' })] }));
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...snapshot, promisedAt: new Date(snapshot.promisedAt) });
    await processJobcardNotification(current, new Date('2026-11-13T08:00:00Z'));
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  } finally { if (previous === undefined) delete process.env.JOB_PROMISED_REMINDERS_ENABLED; else process.env.JOB_PROMISED_REMINDERS_ENABLED = previous; }
});

it('batches reminder candidates and latest actions instead of querying once per job', async () => {
  const previous = process.env.JOB_PROMISED_REMINDERS_ENABLED;
  process.env.JOB_PROMISED_REMINDERS_ENABLED = 'true';
  try {
    const now = new Date('2026-11-12T12:00:00Z');
    const cards = Array.from({ length: 101 }, (_, index) => ({ ...snapshot, id: `job-${index}`, promisedAt: new Date('2026-11-13T10:00:00Z'), createdAt: now, statusHistory: [] }));
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValueOnce(cards.slice(0, 100)).mockResolvedValueOnce(cards.slice(100));
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    await sendJobcardReminders(now);
    expect(prisma.jobCard.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.jobcardNotificationEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.jobcardNotificationEvent.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.jobcardNotificationEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true, data: expect.arrayContaining([expect.objectContaining({ id: 'timer:job-100:PROMISED_24H:2026-11-13T10:00:00.000Z' })]) }));
  } finally { if (previous === undefined) delete process.env.JOB_PROMISED_REMINDERS_ENABLED; else process.env.JOB_PROMISED_REMINDERS_ENABLED = previous; }
});

it('does not let deferred timers block ordinary outbox events outside working hours', async () => {
  (prisma.jobcardNotificationEvent.findMany as jest.Mock).mockResolvedValue([]);
  await drainJobcardNotifications(undefined, new Date('2026-11-12T23:00:00Z'));
  expect(prisma.jobcardNotificationEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, where: expect.objectContaining({ AND: expect.arrayContaining([{ NOT: { id: { startsWith: 'timer:' } } }]) }) }));
});

it('locks the job before the event to match producer lock order', async () => {
  await processJobcardNotification(row());
  const sql = (prisma.$queryRaw as jest.Mock).mock.calls.map(([query]) => query.sql as string);
  expect(sql[0]).toContain('FROM "JobCard"');
  expect(sql[1]).toContain('FROM jobcard_notification_events');
});

it('consumes parts events through the same atomic notification/audit/processed transaction', async () => {
  const current = { ...row(), id: 'workshop:job:PART_REQUESTED:button:request', after: { ...snapshot, workshopEvent: 'PART_REQUESTED', workshopOccurrence: 'button:request', branchStoreOnly: true } };
  (prisma.jobcardNotificationEvent.findUnique as jest.Mock).mockResolvedValue(current);
  await processJobcardNotification(current);
  expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true, data: [expect.objectContaining({ type: 'PART_REQUESTED', dedupeKey: 'PART_REQUESTED:job:button:request' })] }));
  expect(prisma.jobcardNotificationAudit.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ eventType: 'PART_REQUESTED', status: 'DELIVERED' })] }));
  expect(prisma.jobcardNotificationEvent.update).toHaveBeenCalledWith({ where: { id: current.id }, data: { processedAt: expect.any(Date) } });
});

