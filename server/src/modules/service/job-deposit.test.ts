jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(), customer: { findUnique: jest.fn() },
  jobCard: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  receipt: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  estimate: { findFirst: jest.fn() }, auditLog: { create: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { recordJobDeposit, assertDepositPaid, upfrontAmount } from './job-deposit.service';
import { Prisma } from '@prisma/client';

const card = { id: 'job', jobNumber: 'J1', status: 'OPEN', branchId: 'branch', customerId: 'customer', vehicle: null, customer: { firstName: 'Test', lastName: 'Customer' }, branch: { name: 'Test' } };
const receipt = { id: 'receipt', status: 'ACTIVE', mode: 'CASH', category: 'SERVICE_PARTS', branchId: 'branch', customerId: 'customer', amount: 10, advanceAmount: 10 };
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'customer' });
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(card);
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue(card);
  (prisma.estimate.findFirst as jest.Mock).mockResolvedValue({ id: 'estimate', version: 1, estimateNumber: 'E1', amount: 100, upfrontPaymentPercent: new Prisma.Decimal(60) });
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(receipt);
  (prisma.receipt.findMany as jest.Mock).mockResolvedValue([]);
});

it('computes the suggested advance with decimal rounding', () => {
  expect(upfrontAmount(100.01, new Prisma.Decimal(60))).toBe(60.01);
  for (const value of [-1, 101, NaN, Infinity]) expect(() => upfrontAmount(100, value)).toThrow();
});

it('requires an active positive non-cheque receipt on every start and does not consult the suggested percentage', async () => {
  (prisma.receipt.findFirst as jest.Mock).mockResolvedValue(null);
  await expect(assertDepositPaid(prisma, 'job')).rejects.toThrow('positive advance');
  expect(prisma.receipt.findFirst).toHaveBeenCalledWith({ where: {
    advanceJobCardId: 'job', status: 'ACTIVE', category: 'SERVICE_PARTS', mode: { not: 'CHEQUE' }, advanceAmount: { gte: 0.01 }, issuedAt: { lte: expect.any(Date) },
  }, select: { id: true } });
  (prisma.receipt.findFirst as jest.Mock).mockResolvedValue({ id: 'receipt' });
  await expect(assertDepositPaid(prisma, 'job')).resolves.toBeUndefined();
  expect(prisma.estimate.findFirst).not.toHaveBeenCalled();
});

it('links a below-target advance and snapshots the estimate without mutating its 60% suggestion', async () => {
  await expect(recordJobDeposit('job', 'receipt', 'actor')).resolves.toEqual({ receiptId: 'receipt' });
  expect(prisma.receipt.update).toHaveBeenCalledWith({ where: { id: 'receipt' }, data: {
    advanceJobCardId: 'job', advanceSnapshot: expect.objectContaining({ estimateTotal: 100, suggestedPercent: 60, receivedAmount: 10, paidPercent: 10, balanceAmount: 90 }),
  } });
});

it('supports a second receipt and returns an already-linked receipt without double counting it', async () => {
  (prisma.receipt.findMany as jest.Mock).mockResolvedValue([{ advanceAmount: 10 }]);
  await recordJobDeposit('job', 'receipt', 'actor');
  expect(prisma.receipt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ advanceSnapshot: expect.objectContaining({ receivedAmount: 20, paidPercent: 20 }) }) }));
  jest.mocked(prisma.receipt.update).mockClear();
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue({ ...receipt, advanceJobCardId: 'job' });
  await recordJobDeposit('job', 'receipt', 'actor');
  expect(prisma.receipt.update).not.toHaveBeenCalled();
});

it.each([
  [{ advanceJobCardId: 'other-job' }, 'another job'],
  [{ customerId: 'other' }, 'customer and branch'],
  [{ branchId: 'other' }, 'customer and branch'],
  [{ status: 'CANCELLED' }, 'active service receipt'],
  [{ advanceAmount: 0 }, 'positive'],
  [{ advanceAmount: 5 }, 'fully unallocated'],
  [{ mode: 'CHEQUE' }, 'Uncleared cheques'],
])('rejects an ineligible receipt %j', async (patch, error) => {
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue({ ...receipt, ...patch });
  await expect(recordJobDeposit('job', 'receipt', 'actor')).rejects.toThrow(error);
  expect(prisma.receipt.update).not.toHaveBeenCalled();
});
