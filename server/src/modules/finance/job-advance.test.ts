import { Prisma } from '@prisma/client';
import { advanceBillReferences, advanceCoverage, applyJobAdvances, assertNoReservedAdvances, usesAdvanceReference } from './job-advance';
import { createReceiptSchema } from './finance.validation';

const invoice = { id: 'bill', customerId: 'customer', total: 550, dueDate: null };
const receipt = { id: 'r1', customerId: 'customer', branchId: 'branch', category: 'SERVICE_PARTS', advanceAmount: 200 };
function database(receipts = [receipt]) {
  return {
    $queryRaw: jest.fn(), tallyPostingLog: { findFirst: jest.fn().mockResolvedValue(null) }, receipt: { findMany: jest.fn().mockResolvedValue(receipts), findFirst: jest.fn(), update: jest.fn() },
    receiptAllocation: { create: jest.fn() }, invoice: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
  };
}

it('distinguishes estimate coverage, revised final balance and excess with decimal arithmetic', () => {
  expect(advanceCoverage(500, 200)).toMatchObject({ paidPercent: 40, balanceAmount: 300 });
  expect(advanceCoverage(550, 200)).toMatchObject({ paidPercent: 36.36, balanceAmount: 350 });
  expect(advanceCoverage(100, 125)).toMatchObject({ paidPercent: 125, balanceAmount: 0, excessAmount: 25 });
  expect(advanceCoverage(0, 10)).toMatchObject({ paidPercent: null, balanceAmount: 0, excessAmount: 10 });
  expect(advanceCoverage(0.3, 0.1).balanceAmount).toBe(0.2);
});

it('keeps receipt advance references separate from the unpaid invoice reference', () => {
  expect(usesAdvanceReference({ advanceSnapshot: { tallyAsAdvance: true } })).toBe(true);
  expect(advanceBillReferences('I1', 550, [{ advanceReference: 'R1', amount: 200 }])).toEqual([
    { name: 'R1', type: 'Agst Ref', amount: 200 }, { name: 'I1', type: 'New Ref', amount: 350 },
  ]);
  expect(() => advanceBillReferences('I1', 100, [{ advanceReference: 'R1', amount: 200 }])).toThrow('exceed');
});

it('applies several existing receipts without receiving cash again', async () => {
  const db = database([receipt, { ...receipt, id: 'r2', advanceAmount: 100 }]);
  const result = await applyJobAdvances(db as unknown as Prisma.TransactionClient, ['job'], invoice, 'branch');
  expect(result).toMatchObject({ outstandingAmount: 250, status: 'Partially Paid' });
  expect(db.receiptAllocation.create).toHaveBeenNthCalledWith(1, { data: { receiptId: 'r1', invoiceId: 'bill', amount: 200 } });
  expect(db.receiptAllocation.create).toHaveBeenNthCalledWith(2, { data: { receiptId: 'r2', invoiceId: 'bill', amount: 100 } });
  expect(db.receipt.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { advanceAmount: 0 } });
  expect(db.receipt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE', mode: { not: 'CHEQUE' }, advanceJobCardId: { in: ['job'] } }) }));
});

it('settles a fully covered bill and leaves excess as unallocated credit', async () => {
  const db = database([{ ...receipt, advanceAmount: 600 }]);
  await expect(applyJobAdvances(db as unknown as Prisma.TransactionClient, ['job'], invoice, 'branch')).resolves.toMatchObject({ outstandingAmount: 0, status: 'Paid' });
  expect(db.receipt.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { advanceAmount: 50 } });
});

it('preserves an unpaid bill when no advances exist', async () => {
  const db = database([]);
  await expect(applyJobAdvances(db as unknown as Prisma.TransactionClient, ['job'], invoice, 'branch')).resolves.toMatchObject({ outstandingAmount: 550, status: 'Unpaid' });
  expect(db.receiptAllocation.create).not.toHaveBeenCalled();
});

it.each([{ customerId: 'other' }, { branchId: 'other' }, { category: 'SALES_ENQUIRY' }])('rejects cross-party, branch or register allocations %j', async patch => {
  const db = database([{ ...receipt, ...patch }]);
  await expect(applyJobAdvances(db as unknown as Prisma.TransactionClient, ['job'], invoice, 'branch')).rejects.toThrow('different billing customer or branch');
  expect(db.receiptAllocation.create).not.toHaveBeenCalled();
});

it('blocks general adjustment of a reserved receipt', async () => {
  const db = database();
  db.receipt.findFirst.mockResolvedValue({ id: 'r1' });
  await expect(assertNoReservedAdvances(db as unknown as Prisma.TransactionClient, ['r1'])).rejects.toThrow('reserved');
  db.receipt.findFirst.mockResolvedValue(null);
  await expect(assertNoReservedAdvances(db as unknown as Prisma.TransactionClient, ['r1'])).resolves.toBeUndefined();
});

it('accepts any positive job advance but rejects mixed allocations and uncleared cheques', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const body = { customerId: id, branchId: id, advanceJobCardId: id, idempotencyKey: id, amount: 0.01, mode: 'CASH', category: 'SERVICE_PARTS', allocations: [] };
  expect(createReceiptSchema.safeParse({ body }).success).toBe(true);
  expect(createReceiptSchema.safeParse({ body: { ...body, idempotencyKey: undefined } }).success).toBe(false);
  expect(createReceiptSchema.safeParse({ body: { ...body, amount: 0 } }).success).toBe(false);
  expect(createReceiptSchema.safeParse({ body: { ...body, allocations: [{ invoiceId: id, amount: 0.01 }] } }).success).toBe(false);
  expect(createReceiptSchema.safeParse({ body: { ...body, mode: 'CHEQUE', bankId: id, chequeNumber: 'TEST', chequeDate: '2026-11-10' } }).success).toBe(false);
});
