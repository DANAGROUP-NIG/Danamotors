import type { Prisma } from '@prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { enqueueWorkshopNotification, deliverWorkshopNotification } from './workshop-notification-outbox';

const job = { id: 'job', branchId: 'branch', jobNumber: 'J1', status: 'IN_PROGRESS', technicianId: 'tech', qualityInspectorId: null, serviceAdvisorId: 'advisor', deliveryAdvisorId: null, createdById: 'actor', customerId: 'customer', qcStatus: null, qcNotes: null, promisedAt: null };
function database() {
  const mocks = { jobCard: { findUnique: jest.fn().mockResolvedValue({ ...job, customer: { firstName: 'Test', lastName: 'Customer' }, vehicle: { registrationNumber: 'SYNTHETIC' } }) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'manager' }, { id: 'actor' }]) }, notification: { createMany: jest.fn() },
    jobcardNotificationEvent: { upsert: jest.fn() }, jobcardNotificationAudit: { createMany: jest.fn() }, $queryRaw: jest.fn() };
  return { mocks, tx: mocks as unknown as Prisma.TransactionClient };
}
it('enqueues stable occurrence IDs without delivering inside the business transaction', async () => {
  const { tx, mocks } = database();
  await enqueueWorkshopNotification(tx, 'PART_REQUESTED', job, 'button:request', 'actor', true);
  await enqueueWorkshopNotification(tx, 'PART_REQUESTED', job, 'button:request', 'actor', true);
  expect(mocks.jobcardNotificationEvent.upsert).toHaveBeenCalledWith({ where: { id: 'workshop:job:PART_REQUESTED:button:request' }, create: expect.objectContaining({ actorId: 'actor', after: expect.objectContaining({ workshopEvent: 'PART_REQUESTED', branchStoreOnly: true }) }), update: {} });
  expect(mocks.notification.createMany).not.toHaveBeenCalled();
});
it('delivers button requests only to active branch store managers, excluding the actor and preserving dedupe keys', async () => {
  const { tx, mocks } = database();
  const row = { id: 'event', jobCardId: 'job', actorId: 'actor', after: job, before: null, createdAt: new Date(), processedAt: null };
  await deliverWorkshopNotification(tx, row, 'PART_REQUESTED', job, 'button:request', true, new Date());
  expect(mocks.user.findMany).toHaveBeenCalledWith({ where: { isActive: true, branchId: 'branch', role: { name: ROLES.BRANCH_STORE_MANAGER } }, select: { id: true } });
  expect(mocks.notification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ userId: 'manager', dedupeKey: 'PART_REQUESTED:job:button:request', message: 'Parts requested: J1, Test Customer, SYNTHETIC' })], skipDuplicates: true });
});
it('suppresses obsolete requests after job completion and refuses silent loss when no recipient exists', async () => {
  const { tx, mocks } = database();
  const row = { id: 'event', jobCardId: 'job', actorId: 'actor', after: job, before: null, createdAt: new Date(), processedAt: null };
  mocks.jobCard.findUnique.mockResolvedValueOnce({ ...job, status: 'BILLED', customer: { firstName: 'Test', lastName: 'Customer' }, vehicle: { registrationNumber: 'SYNTHETIC' } });
  await deliverWorkshopNotification(tx, row, 'PART_REQUESTED', job, 'request', true, new Date());
  expect(mocks.notification.createMany).not.toHaveBeenCalled();
  expect(mocks.jobcardNotificationAudit.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ status: 'SUPPRESSED_STALE_ACTION' })] }));
  mocks.user.findMany.mockResolvedValue([]);
  await expect(deliverWorkshopNotification(tx, row, 'PART_REQUESTED', job, 'request', true, new Date())).rejects.toThrow('No active');
});

it('delivers signed collection to the signer and named advisor after reassignment', async () => {
  const { tx, mocks } = database();
  const row = { id: 'event', jobCardId: 'job', actorId: 'signer', after: job, before: null, createdAt: new Date(), processedAt: null };
  mocks.user.findMany.mockResolvedValue([{ id: 'signer' }, { id: 'advisor' }]);

  await deliverWorkshopNotification(tx, row, 'PART_RECEIVED', job, 'issuance', false, new Date());

  expect(mocks.user.findMany).toHaveBeenCalledWith({
    where: { isActive: true, OR: [{ id: { in: ['signer', 'advisor'] }, branchId: 'branch' }] },
    select: { id: true },
  });
  expect(mocks.notification.createMany).toHaveBeenCalledWith({
    data: ['signer', 'advisor'].map(userId => expect.objectContaining({
      userId, dedupeKey: 'PART_RECEIVED:job:issuance', message: 'Parts collection confirmed: J1, SYNTHETIC',
    })),
    skipDuplicates: true,
  });
});

it('audits suppressed receipt delivery when no eligible recipient remains', async () => {
  const { tx, mocks } = database();
  const row = { id: 'event', jobCardId: 'job', actorId: 'signer', after: job, before: null, createdAt: new Date(), processedAt: null };
  mocks.jobCard.findUnique.mockResolvedValue({ ...job, technicianId: null, serviceAdvisorId: null });
  mocks.user.findMany.mockResolvedValue([]);
  await deliverWorkshopNotification(tx, row, 'PART_RECEIVED', job, 'issuance', false, new Date());
  expect(mocks.notification.createMany).not.toHaveBeenCalled();
  expect(mocks.jobcardNotificationAudit.createMany).toHaveBeenCalledWith(expect.objectContaining({
    data: [expect.objectContaining({ status: 'SUPPRESSED_NO_ELIGIBLE_RECIPIENT' })],
  }));
});
