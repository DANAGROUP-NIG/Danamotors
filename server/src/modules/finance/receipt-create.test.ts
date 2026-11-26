jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(), auditLog: { create: jest.fn() },
  receipt: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  jobCard: { findUnique: jest.fn() }, estimate: { findFirst: jest.fn() },
  customer: { findUnique: jest.fn() }, branch: { findFirst: jest.fn() },
  invoice: { findMany: jest.fn(), update: jest.fn() }, documentSequence: { upsert: jest.fn() },
} }));
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ReceiptService } from './receipt.service';
const customerId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const invoiceId = '33333333-3333-4333-8333-333333333333';
const input = { customerId, branchId, issuedById: 'issuer', idempotencyKey: '44444444-4444-4444-8444-444444444444', mode: 'CASH' as const, category: 'SERVICE_PARTS' as const, amount: 100, allocations: [{ invoiceId, amount: 100 }] };
const invoice = { id: invoiceId, customerId, jobCardId: 'job', jobCard: { branchId }, customer: { branchId }, outstandingAmount: 100, total: 100, status: 'Unpaid' };
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(cb => cb(prisma));
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ id: customerId, branchId });
  (prisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: branchId });
  (prisma.invoice.findMany as jest.Mock).mockResolvedValue([invoice]);
  (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({ value: 1 });
  (prisma.receipt.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'receipt', allocations: data.allocations.createMany.data.map((a: { invoiceId: string; amount: number }) => ({ ...a, invoice })) }));
});
it('uses a Prisma-compatible advisory lock and settles the bill atomically', async () => {
  const result = await new ReceiptService().createReceipt(input);
  expect((prisma.$queryRaw as jest.Mock).mock.calls[0][0].sql).toContain('SELECT 1 AS locked FROM pg_advisory_xact_lock');
  expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: invoiceId }, data: { outstandingAmount: 0, status: 'Paid' } });
  expect(result.allocations[0].invoice).toMatchObject({ outstandingAmount: 0, status: 'Paid' });
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
});
it('preserves a partial balance and returns the updated status', async () => {
  const result = await new ReceiptService().createReceipt({ ...input, amount: 40, allocations: [{ invoiceId, amount: 40 }] });
  expect(result.allocations[0].invoice).toMatchObject({ outstandingAmount: 60, status: 'Partially Paid' });
});
it('returns the original receipt on retry without charging twice', async () => {
  const service = new ReceiptService();
  const first = await service.createReceipt(input);
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(first);
  expect(await service.createReceipt(input)).toEqual(first);
  expect(prisma.receipt.create).toHaveBeenCalledTimes(1);
  expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
});
it('rejects reuse of a committed request key with changed payment details', async () => {
  const service = new ReceiptService();
  const first = await service.createReceipt(input);
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(first);
  await expect(service.createReceipt({ ...input, amount: 110 })).rejects.toThrow('different details');
  expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
});
it('rejects an overpayment allocation before creating a receipt', async () => {
  await expect(new ReceiptService().createReceipt({ ...input, amount: 110, allocations: [{ invoiceId, amount: 110 }] })).rejects.toThrow('outstanding');
  expect(prisma.receipt.create).not.toHaveBeenCalled();
});
it('retries a confirmed serialization rollback', async () => {
  (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '6.16.2' }));
  await new ReceiptService().createReceipt(input);
  expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
});

it('creates and reserves a below-target advance with a stable receipt snapshot and idempotent retry', async () => {
  const jobId = '55555555-5555-4555-8555-555555555555';
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id: jobId, jobNumber: 'J1', customerId, branchId, status: 'OPEN', branch: { name: 'Test branch' }, customer: { firstName: 'Test', lastName: 'Customer' } });
  (prisma.estimate.findFirst as jest.Mock).mockResolvedValue({ id: 'estimate', estimateNumber: 'E1', version: 1, amount: 500, upfrontPaymentPercent: new Prisma.Decimal(60) });
  (prisma.receipt.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);
  const service = new ReceiptService();
  const advance = { ...input, advanceJobCardId: jobId, amount: 200, allocations: [] };
  const created = await service.createReceipt(advance);
  expect(prisma.receipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    advanceJobCardId: jobId, advanceAmount: 200, advanceSnapshot: expect.objectContaining({ paidPercent: 40, balanceAmount: 300, tallyAsAdvance: true }),
  }) }));
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(created);
  await expect(service.createReceipt(advance)).resolves.toEqual(created);
  expect(prisma.receipt.create).toHaveBeenCalledTimes(1);
  expect(prisma.invoice.update).not.toHaveBeenCalled();
});
