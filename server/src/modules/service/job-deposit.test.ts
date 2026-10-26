jest.mock('../../prisma/client', () => ({ __esModule: true, default: {} }));
import { assertDepositPaid, upfrontAmount } from './job-deposit.service';
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
  tx.jobCard.findUniqueOrThrow.mockResolvedValue({ depositReceipt: { amount: 100, status: 'CANCELLED' } });
  await expect(assertDepositPaid(tx as never, 'job')).rejects.toThrow('upfront deposit');
  tx.jobCard.findUniqueOrThrow.mockResolvedValue({ depositReceipt: { amount: 59.99, status: 'ACTIVE' } });
  await expect(assertDepositPaid(tx as never, 'job')).rejects.toThrow('upfront deposit');
  tx.jobCard.findUniqueOrThrow.mockResolvedValue({ depositReceipt: { amount: 60, status: 'ACTIVE' } });
  await expect(assertDepositPaid(tx as never, 'job')).resolves.toBeUndefined();
});
