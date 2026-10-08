jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: { jobCard: { findMany: jest.fn() } },
}));

import prisma from '../../prisma/client';
import { ServiceRepository } from './service.repository';

it('bounds default job-card reads and sorts tied timestamps consistently', async () => {
  (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([]);
  await new ServiceRepository().listJobCards({ branchId: 'branch' });
  const query = (prisma.jobCard.findMany as jest.Mock).mock.calls[0][0];
  expect(query).toMatchObject({
    where: { branchId: 'branch' },
    skip: 0,
    take: 50,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  for (const relation of ['statusHistory', 'complaints', 'inspections', 'estimates', 'appointment', 'previousJob']) {
    expect(query.include).not.toHaveProperty(relation);
  }
});
