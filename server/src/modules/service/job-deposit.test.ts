jest.mock('../../prisma/client', () => ({ __esModule: true, default: { $transaction: jest.fn(), $queryRaw: jest.fn(), jobCard: { findUnique: jest.fn(), update: jest.fn() }, receipt: { findUnique: jest.fn() }, estimate: { findFirst: jest.fn() }, auditLog: { create: jest.fn() } } }));
import prisma from '../../prisma/client';
import { recordJobDeposit, assertDepositPaid, upfrontAmount } from './job-deposit.service';
import { Prisma } from '@prisma/client';
it('computes deposits using decimal rounding and rejects invalid percentages', () => {
  expect(upfrontAmount(100.01, new Prisma.Decimal(60))).toBe(60.01);
  expect(upfrontAmount(0.1, 30)).toBe(0.03);
  expect(upfrontAmount(500, 0)).toBe(0);
  expect(upfrontAmount(500, 100)).toBe(500);
  for (const value of [-1, 101, NaN, Infinity]) expect(() => upfrontAmount(100, value)).toThrow();
});

it('blocks unpaid or cancelled deposits and accepts a sufficient active receipt', async () => {
  const tx = { estimate: { findFirst: jest.fn().mockResolvedValue({ amount: 100, upfrontPaymentPercent: 60 }) }, jobCard: { findUniqueOrThrow: jest.fn() } };
  tx.jobCard.findUniqueOrThrow.mockResolvedValue({ depositReceipt: null });
  await expect(assertDepositPaid(tx as never, 'job')).rejects.toThrow('upfront deposit');
  tx.jobCard.findUniqueOrThrow.mockResolvedValue({ depositReceipt: { advanceAmount: 100, status: 'CANCELLED' } });
  await expect(assertDepositPaid(tx as never, 'job')).rejects.toThrow('upfront deposit');
  tx.jobCard.findUniqueOrThrow.mockResolvedValue({ depositReceipt: { advanceAmount: 59.99, status: 'ACTIVE' } });
  await expect(assertDepositPaid(tx as never, 'job')).rejects.toThrow('upfront deposit');
  tx.jobCard.findUniqueOrThrow.mockResolvedValue({ depositReceipt: { advanceAmount: 60, status: 'ACTIVE' } });
  await expect(assertDepositPaid(tx as never, 'job')).resolves.toBeUndefined();
});

it('links sufficient receipts once and rejects receipts already committed to another job', async () => {
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id: 'job', status: 'OPEN', branchId: 'branch', customerId: 'customer', depositReceiptId: null });
  (prisma.estimate.findFirst as jest.Mock).mockResolvedValue({ amount: 100, upfrontPaymentPercent: 60 });
  const receipt = { status: 'ACTIVE', category: 'SERVICE_PARTS', branchId: 'branch', customerId: 'customer', advanceAmount: 60, depositJobCard: null };
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue({ ...receipt, depositJobCard: { id: 'other-job' } });
  await expect(recordJobDeposit('job', 'receipt', 'actor')).rejects.toThrow('another job');
  expect(prisma.jobCard.update).not.toHaveBeenCalled();
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(receipt);
  await expect(recordJobDeposit('job', 'receipt', 'actor')).resolves.toEqual({ receiptId: 'receipt' });
  expect(prisma.jobCard.update).toHaveBeenCalledWith({ where: { id: 'job' }, data: { depositReceiptId: 'receipt' } });
});
