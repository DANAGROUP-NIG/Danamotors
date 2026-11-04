jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  partIssuance: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn(), count: jest.fn() },
  jobCard: { groupBy: jest.fn() }, auditLog: { create: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { WorkshopService } from './workshop.service';
import { WorkshopRepository } from './workshop.repository';
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
});
it('records assigned technician identity and server time, once per issuance', async () => {
  const issue = { id: 'issue', jobCard: { id: 'job', technicianId: 'tech' }, receivedAt: null };
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue(issue);
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isActive: true, role: { name: 'Technician' } });
  await new WorkshopService().receiveParts('issue', 'tech');
  expect(prisma.partIssuance.update).toHaveBeenCalledWith({ where: { id: 'issue' }, data: { receivedById: 'tech', receivedAt: expect.any(Date) } });
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue({ ...issue, receivedAt: new Date() });
  await new WorkshopService().receiveParts('issue', 'tech');
  expect(prisma.partIssuance.update).toHaveBeenCalledTimes(1);
  await expect(new WorkshopService().receiveParts('issue', 'other')).rejects.toThrow('assigned technician');
});
it('aggregates open and closed counts in one group query', async () => {
  const list = jest.spyOn(WorkshopRepository.prototype, 'listTechnicians').mockResolvedValue([{ id: 'tech' }] as never);
  (prisma.user.count as jest.Mock).mockResolvedValue(1);
  (prisma.jobCard.groupBy as jest.Mock).mockResolvedValue([{ technicianId: 'tech', status: 'IN_PROGRESS', _count: { _all: 2 } }, { technicianId: 'tech', status: 'DELIVERED', _count: { _all: 3 } }]);
  const result = await new WorkshopService().listTechnicians();
  expect(result.technicians[0]).toMatchObject({ openJobs: 2, closedJobs: 3 });
  expect(prisma.jobCard.groupBy).toHaveBeenCalledTimes(1);
  list.mockRestore();
});
