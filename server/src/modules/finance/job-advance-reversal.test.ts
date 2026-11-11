jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(), customer: { findUnique: jest.fn() },
  receipt: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  jobCard: { findUniqueOrThrow: jest.fn() }, invoice: { findMany: jest.fn(), update: jest.fn() },
  receiptAllocation: { updateMany: jest.fn() }, tallyPostingLog: { findFirst: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { ReceiptService } from './receipt.service';

const receipt = { id: 'receipt', customerId: 'customer', advanceJobCardId: 'job', status: 'ACTIVE', amount: 100, allocations: [] };
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'customer' });
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(receipt);
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'job', status: 'OPEN' });
  (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.tallyPostingLog.findFirst as jest.Mock).mockResolvedValue(null);
});

it('preserves job receipt history by rejecting amount and narration edits', async () => {
  await expect(new ReceiptService().updateReceipt('receipt', { amount: 200, editedById: 'actor' })).rejects.toThrow('cannot be edited');
  expect(prisma.receipt.update).not.toHaveBeenCalled();
});

it('prevents cancellation of the last advance while work is in progress', async () => {
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'job', status: 'IN_PROGRESS' });
  (prisma.receipt.findFirst as jest.Mock).mockResolvedValue(null);
  await expect(new ReceiptService().cancelReceipt('receipt', 'Incorrect payment', 'actor')).rejects.toThrow('last advance');
  expect(prisma.receipt.update).not.toHaveBeenCalled();
});

it('allows reversal with another valid advance in place', async () => {
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'job', status: 'IN_PROGRESS' });
  (prisma.receipt.findFirst as jest.Mock).mockResolvedValue({ id: 'replacement' });
  await new ReceiptService().cancelReceipt('receipt', 'Duplicate receipt', 'actor');
  expect(prisma.receipt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED', advanceAmount: 0 }) }));
});

it('reopens the final invoice balance when an applied advance is reversed', async () => {
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'job', status: 'BILLED' });
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue({ ...receipt, allocations: [{ invoiceId: 'bill', amount: 100 }] });
  (prisma.invoice.findMany as jest.Mock).mockResolvedValue([{ id: 'bill', total: 100, outstandingAmount: 0 }]);
  await new ReceiptService().cancelReceipt('receipt', 'Payment reversed', 'actor');
  expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'bill' }, data: { outstandingAmount: 100, status: 'Unpaid' } });
  expect(prisma.receiptAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { reversedAt: expect.any(Date) } }));
});
