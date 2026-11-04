jest.mock('../../prisma/client', () => ({ __esModule: true, default: { jobCard: { findUnique: jest.fn(), findMany: jest.fn() }, user: { findMany: jest.fn() }, notification: { createMany: jest.fn() } } }));
import prisma from '../../prisma/client';
import { NotificationService } from './notification.service';
import { notifyWorkshopEvent, workshopRecipients } from './workshop-notifications';
import { WORKSHOP_EVENTS } from './notification.events';
import { reminderWindow, sendPromisedReminders } from './promised-reminders';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
const card = { id: 'job', jobNumber: 'J1', branchId: 'branch', serviceAdvisorId: 'advisor', technicianId: 'tech', qualityInspectorId: 'qc', status: 'IN_PROGRESS', customer: { id: 'customer', firstName: 'Test', lastName: 'Customer', account: { isActive: true } }, vehicle: { registrationNumber: 'TEST-1' }, promisedAt: new Date('2026-11-02T10:00:00Z') };
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(card);
  (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'staff' }, { id: 'staff' }]);
  (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });
});
it('resolves store managers, assignment, QC and advisor recipients from role/assignment', () => {
  expect(workshopRecipients('PART_REQUESTED', card)).toMatchObject({ isActive: true, OR: expect.arrayContaining([{ role: { name: ROLES.GENERAL_STORE_MANAGER } }, { branchId: 'branch', role: { name: { in: [ROLES.BRANCH_STORE_MANAGER] } } }]) });
  expect(workshopRecipients('TECHNICIAN_ASSIGNED', card)).toMatchObject({ OR: [{ id: { in: ['tech'] }, branchId: 'branch' }] });
  expect(workshopRecipients('JOB_SENT_FOR_QC', card).OR).toEqual(expect.arrayContaining([{ branchId: 'branch', role: { permissions: { some: { permission: { name: PERMISSIONS.QCSTATUS_UPDATE } } } } }]));
  for (const event of ['PARTS_ISSUED', 'PART_RECEIVED', 'QC_FAILED', 'PROMISED_24H', 'PROMISED_12H'] as const) expect(workshopRecipients(event, card).OR).toContainEqual({ id: { in: ['advisor', 'tech'] }, branchId: 'branch' });
  for (const event of ['PARTS_UNAVAILABLE', 'QC_PASSED', 'JOB_READY'] as const) expect(workshopRecipients(event, card).OR).toContainEqual({ id: { in: ['advisor'] }, branchId: 'branch' });
});
it.each(Object.keys(WORKSHOP_EVENTS) as (keyof typeof WORKSHOP_EVENTS)[])('persists %s with a stable per-recipient dedupe key', async event => {
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
it('makes reminder sweeps optional and repeated sweeps use the same sent marker', async () => {
  const previous = process.env.JOB_PROMISED_REMINDERS_ENABLED;
  try {
    process.env.JOB_PROMISED_REMINDERS_ENABLED = 'false';
    await sendPromisedReminders(); expect(prisma.jobCard.findMany).not.toHaveBeenCalled();
    process.env.JOB_PROMISED_REMINDERS_ENABLED = 'true';
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([card]);
    const seen = new Set<string>();
    (prisma.notification.createMany as jest.Mock).mockImplementation(({ data }: { data: { dedupeKey: string }[] }) => { data.forEach(row => seen.add(row.dedupeKey)); return { count: 1 }; });
    const now = new Date('2026-11-01T10:00:00Z');
    await sendPromisedReminders(now); await sendPromisedReminders(now);
    expect(seen.size).toBe(2);
    expect(reminderWindow(now, 24)).toEqual({ gt: new Date('2026-11-02T09:00:00Z'), lte: new Date('2026-11-02T10:00:00Z') });
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...card, status: 'READY' });
    (prisma.notification.createMany as jest.Mock).mockClear();
    await sendPromisedReminders(now); expect(prisma.notification.createMany).not.toHaveBeenCalled();
  } finally { if (previous === undefined) delete process.env.JOB_PROMISED_REMINDERS_ENABLED; else process.env.JOB_PROMISED_REMINDERS_ENABLED = previous; }
});
