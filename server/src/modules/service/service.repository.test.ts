jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: { jobCard: { findMany: jest.fn(), findUnique: jest.fn() } },
}));

import prisma from '../../prisma/client';
import { ServiceRepository } from './service.repository';

it('loads operational summary relationships in the existing detail read without signature images or extra lookups', async () => {
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(null);
  await new ServiceRepository().findJobCardById('job');
  const query = (prisma.jobCard.findUnique as jest.Mock).mock.calls[0][0];
  expect(query.include.labourLines.include.technician).toEqual({ select: { firstName: true, lastName: true } });
  expect(query.include.labourLines.include.mechanic).toEqual({ select: { name: true } });
  expect(query.include.partIssuances.include.requisitionLine.select).toMatchObject({ requisitionId: true, requisition: { select: { status: true } } });
  expect(query.include.partIssuances.include).not.toHaveProperty('collectionSignature');
  expect(prisma.jobCard.findUnique).toHaveBeenCalledTimes(1);
});

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
