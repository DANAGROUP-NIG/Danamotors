jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  jobCard: { findFirst: jest.fn(), update: jest.fn() }, user: { findMany: jest.fn() }, notification: { createMany: jest.fn() },
  jobcardNotificationEvent: { upsert: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { requestJobcardParts } from './jobcard-parts-request.service';
import { ROLES } from '../../shared/constants/roles';

const card = { id: 'job', branchId: 'branch', jobNumber: 'J123', status: 'IN_PROGRESS', billedAt: null, customer: { firstName: 'Test', lastName: 'Customer' }, vehicle: { registrationNumber: 'TEST-123' } };
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  (prisma.jobCard.findFirst as jest.Mock).mockResolvedValue(card);
  (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'store-manager' }]);
  (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });
});

it('notifies only active branch Store Managers, excludes the actor and follows the existing message pattern', async () => {
  await requestJobcardParts('job', 'branch', 'actor', 'request-1');
  expect(prisma.jobCard.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'job', branchId: 'branch' } }));
  expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { branchId: 'branch', isActive: true, role: { name: ROLES.BRANCH_STORE_MANAGER }, id: { not: 'actor' } }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] });
  expect(prisma.jobcardNotificationEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'workshop:job:PART_REQUESTED:button:request-1' }, create: expect.objectContaining({ actorId: 'actor', after: expect.objectContaining({ workshopEvent: 'PART_REQUESTED', branchStoreOnly: true }) }) }));
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
  expect(prisma.jobCard.update).toHaveBeenCalledWith({ where: { id: 'job' }, data: { partsRequestedAt: expect.any(Date) } });
});

it('uses the same dedupe key on a transport retry and a new key for a new request', async () => {
  await requestJobcardParts('job', 'branch', 'actor', 'request-1');
  await requestJobcardParts('job', 'branch', 'actor', 'request-1');
  await requestJobcardParts('job', 'branch', 'actor', 'request-2');
  const keys = (prisma.jobcardNotificationEvent.upsert as jest.Mock).mock.calls.map(([input]) => input.where.id);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).not.toBe(keys[0]);
});

it.each(['BILLED', 'DELIVERED', 'CANCELLED', 'Closed', 'Cancelled'])('rejects %s jobs without sending', async status => {
  (prisma.jobCard.findFirst as jest.Mock).mockResolvedValue({ ...card, status });
  await expect(requestJobcardParts('job', 'branch', 'actor', 'request-1')).rejects.toThrow('billed or closed');
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
  expect(prisma.jobCard.update).not.toHaveBeenCalled();
});

it('rejects a billed job even when its legacy status is Ready', async () => {
  (prisma.jobCard.findFirst as jest.Mock).mockResolvedValue({ ...card, status: 'Ready', billedAt: new Date() });
  await expect(requestJobcardParts('job', 'branch', 'actor', 'request-1')).rejects.toThrow('billed or closed');
});

it('returns a clear error if no eligible Store Manager exists instead of broadcasting', async () => {
  (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
  await expect(requestJobcardParts('job', 'branch', 'actor', 'request-1')).rejects.toThrow('No store manager is active in this branch');
  expect(prisma.notification.createMany).not.toHaveBeenCalled();
});

it('does not notify for a missing or differently scoped jobcard', async () => {
  (prisma.jobCard.findFirst as jest.Mock).mockResolvedValue(null);
  await expect(requestJobcardParts('job', 'other-branch', 'actor', 'request-1')).rejects.toThrow('not found');
  expect(prisma.user.findMany).not.toHaveBeenCalled();
});

it('propagates send failures so the UI cannot report a false success', async () => {
  (prisma.jobcardNotificationEvent.upsert as jest.Mock).mockRejectedValue(new Error('Persistence failed'));
  await expect(requestJobcardParts('job', 'branch', 'actor', 'request-1')).rejects.toThrow('Persistence failed');
  expect(prisma.jobCard.update).not.toHaveBeenCalled();
});

it('preserves the first successful request timestamp on subsequent requests', async () => {
  const partsRequestedAt = new Date('2026-11-13T08:00:00Z');
  (prisma.jobCard.findFirst as jest.Mock).mockResolvedValue({ ...card, partsRequestedAt });
  await requestJobcardParts('job', 'branch', 'actor', 'request-2');
  expect(prisma.jobCard.update).toHaveBeenCalledWith({ where: { id: 'job' }, data: { partsRequestedAt } });
});
