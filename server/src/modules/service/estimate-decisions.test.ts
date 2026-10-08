jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  estimate: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  jobCard: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  customerApproval: { create: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { ServiceService } from './service.service';
const latest = { id: 'latest', status: 'Pending', amount: 500, approvals: [], lines: [{ type: 'SERVICE', referenceId: 'service', quantity: 1, rate: 500, amount: 500 }] };
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(cb => cb(prisma));
  (prisma.estimate.findUnique as jest.Mock).mockResolvedValue({ jobCardId: 'job' });
  (prisma.estimate.findMany as jest.Mock).mockResolvedValue([latest]);
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'job', customerId: 'customer', serviceId: 'service', status: 'QC' });
});
it('records approval of the latest revision and carries its service charge into billing', async () => {
  await new ServiceService().addApproval('latest', { customerId: 'customer', approved: true });
  expect((prisma.$queryRaw as jest.Mock).mock.calls[0][0].sql).toContain('"JobCard"');
  expect(prisma.jobCard.update).toHaveBeenCalledWith({ where: { id: 'job' }, data: { serviceCharge: 500 } });
  // An approved revision becomes the job's scope: it is closed as converted.
  expect(prisma.estimate.update).toHaveBeenCalledWith({ where: { id: 'latest' }, data: { status: 'Approved', estimateStatus: 'CLOSED', closedReason: 'CONVERTED' } });
  expect(prisma.customerApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({ estimateId: 'latest', approved: true, status: 'Approved', decisionDate: expect.any(Date) }) });
});
it('rejects approval of a superseded estimate', async () => {
  await expect(new ServiceService().addApproval('old', { customerId: 'customer', approved: true })).rejects.toThrow('latest');
  expect(prisma.customerApproval.create).not.toHaveBeenCalled();
});
it('preserves immutable decisions and requires a revision', async () => {
  (prisma.estimate.findMany as jest.Mock).mockResolvedValue([{ ...latest, approvals: [{ approved: false }] }]);
  await expect(new ServiceService().addApproval('latest', { customerId: 'customer', approved: true })).rejects.toThrow('already has a decision');
});
it('cannot authorize work for another customer', async () => {
  await expect(new ServiceService().addApproval('latest', { customerId: 'other', approved: true })).rejects.toThrow('bill-to');
});
it('declines without changing the service charge', async () => {
  await new ServiceService().addApproval('latest', { customerId: 'customer', approved: false });
  expect(prisma.jobCard.update).not.toHaveBeenCalled();
  expect(prisma.estimate.update).toHaveBeenCalledWith({ where: { id: 'latest' }, data: { status: 'Declined', estimateStatus: 'CLOSED', closedReason: 'DECLINED' } });
});
it('rejects decisions after billing', async () => {
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'job', customerId: 'customer', billedAt: new Date(), status: 'BILLED' });
  await expect(new ServiceService().addApproval('latest', { customerId: 'customer', approved: true })).rejects.toThrow('closed');
});
