jest.mock('../../prisma/client', () => ({ __esModule: true, default: { jobCard: { findUnique: jest.fn(), findMany: jest.fn() }, user: { findMany: jest.fn() }, notification: { createMany: jest.fn() } } }));
jest.mock('./jobcard-notification-router', () => ({ drainJobcardNotifications: jest.fn(), sendJobcardReminders: jest.fn(), startJobcardNotifications: jest.fn() }));
import prisma from '../../prisma/client';
import { NotificationService } from './notification.service';
import { notifyWorkshopEvent, workshopRecipients } from './workshop-notifications';
import { WORKSHOP_EVENTS } from './notification.events';
import { reminderWindow, sendPromisedReminders } from './promised-reminders';
import { drainJobcardNotifications, sendJobcardReminders } from './jobcard-notification-router';
import { ROLES } from '../../shared/constants/roles';
const card = { id: 'job', jobNumber: 'J1', branchId: 'branch', serviceAdvisorId: 'advisor', technicianId: 'tech', qualityInspectorId: 'qc', status: 'IN_PROGRESS', customer: { id: 'customer', firstName: 'Test', lastName: 'Customer', account: { isActive: true } }, vehicle: { registrationNumber: 'TEST-1' }, promisedAt: new Date('2026-11-02T10:00:00Z') };
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(card);
  (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'staff' }, { id: 'staff' }]);
  (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });
});
it('preserves separate parts recipients from role/assignment', () => {
  expect(workshopRecipients('PART_REQUESTED', card)).toMatchObject({ isActive: true, OR: expect.arrayContaining([{ role: { name: ROLES.GENERAL_STORE_MANAGER } }, { branchId: 'branch', role: { name: { in: [ROLES.BRANCH_STORE_MANAGER] } } }]) });
  for (const event of ['PARTS_ISSUED', 'PART_RECEIVED'] as const) expect(workshopRecipients(event, card).OR).toContainEqual({ id: { in: ['advisor', 'tech'] }, branchId: 'branch' });
  expect(workshopRecipients('PARTS_UNAVAILABLE', card).OR).toContainEqual({ id: { in: ['advisor'] }, branchId: 'branch' });
});
it.each((Object.keys(WORKSHOP_EVENTS) as (keyof typeof WORKSHOP_EVENTS)[]).filter(event => event.startsWith('PART')))('preserves separate %s notifications with a stable per-recipient dedupe key', async event => {
  const seen = new Set<string>();
  (prisma.notification.createMany as jest.Mock).mockImplementation(({ data, skipDuplicates }: { data: { userId?: string; customerId?: string; dedupeKey: string }[]; skipDuplicates: boolean }) => {
    expect(skipDuplicates).toBe(true);
    data.forEach(row => seen.add(`${row.userId ?? row.customerId}:${row.dedupeKey}`));
    return { count: data.length };
  });
  await notifyWorkshopEvent(event, 'job', 'event1');
  await notifyWorkshopEvent(event, 'job', 'event1');
  const customer = ['JOB_READY', 'PROMISED_24H', 'PROMISED_12H'].includes(event);
  expect(seen.size).toBe(customer ? 2 : 1);
  expect([...seen]).toContain(`staff:${event}:job:event1`);
});
it('retries persistence and keeps notification failures from breaking committed actions', async () => {
  const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
  (prisma.notification.createMany as jest.Mock).mockRejectedValue(new Error('unavailable'));
  await expect(new NotificationService().notify('JOB_READY', { userIds: ['staff'] }, { dedupeKey: 'event', jobCardId: 'job', jobNumber: 'J1', customer: 'Test', registration: 'TEST', branchId: 'branch' })).resolves.toBeUndefined();
  expect(prisma.notification.createMany).toHaveBeenCalledTimes(3);
  expect(warning).toHaveBeenCalledWith(expect.any(String), { code: 'NOTIFICATION_WRITE_FAILED' });
  warning.mockRestore();
});
it('routes legacy reminders centrally instead of sending a second notification', async () => {
  const now = new Date('2026-11-12T10:00:00Z');
  await sendPromisedReminders(now);
  expect(sendJobcardReminders).toHaveBeenCalledWith(now);
  expect(drainJobcardNotifications).toHaveBeenCalled();
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
  expect(reminderWindow(now, 24)).toEqual({ gt: new Date('2026-11-13T09:00:00Z'), lte: new Date('2026-11-13T10:00:00Z') });
});

it.each(['TECHNICIAN_ASSIGNED', 'JOB_SENT_FOR_QC', 'QC_PASSED', 'QC_FAILED', 'JOB_READY'] as const)('forwards legacy %s through the outbox only', async event => {
  await notifyWorkshopEvent(event, 'job', 'legacy-occurrence');
  expect(drainJobcardNotifications).toHaveBeenCalledWith('job');
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
});
