jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: {
    payment: { findMany: jest.fn(), findFirst: jest.fn() },
    receiptAllocation: { findMany: jest.fn(), findFirst: jest.fn() },
  },
}));
import prisma from '../../prisma/client';
import { FinanceRepository } from './finance.repository';
import { paymentIdParamSchema } from './finance.validation';
const allocation = {
  id: '550e8400-e29b-41d4-a716-446655440000', invoiceId: 'invoice', amount: 75,
  createdAt: new Date('2026-10-08'), invoice: { id: 'invoice', invoiceNumber: 'INV1' },
  receipt: { id: 'receipt', mode: 'CASH', issuedAt: new Date('2026-10-08'),
    issuedById: null, issuedBy: null, reference: 'REF1', notes: null, updatedAt: new Date('2026-10-08') },
};
beforeEach(() => jest.resetAllMocks());
it('lists receipt allocations with legacy payments, excluding linked duplicates and inactive allocations', async () => {
  (prisma.payment.findMany as jest.Mock).mockResolvedValue([{ id: 'legacy', paymentDate: new Date('2026-10-01') }]);
  (prisma.receiptAllocation.findMany as jest.Mock).mockResolvedValue([allocation]);
  const result = await new FinanceRepository().listPayments({ branchId: 'branch' });
  expect(result.map(p => p.id)).toEqual(['receipt-allocation:' + allocation.id, 'legacy']);
  expect(result[0]).toMatchObject({ amount: 75, method: 'CASH', reference: 'REF1', invoice: allocation.invoice });
  expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ receiptId: null }) }));
  expect(prisma.receiptAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
    reversedAt: null, invoiceId: { not: null }, receipt: { is: { status: 'ACTIVE', branchId: 'branch' } },
    invoice: { OR: expect.any(Array) },
  }) }));
});
it('loads an active allocation as a payment detail and accepts its ID', async () => {
  (prisma.receiptAllocation.findFirst as jest.Mock).mockResolvedValue(allocation);
  const id = 'receipt-allocation:' + allocation.id;
  expect(paymentIdParamSchema.safeParse({ params: { id } }).success).toBe(true);
  expect(paymentIdParamSchema.safeParse({ params: { id: 'receipt-allocation:invalid' } }).success).toBe(false);
  expect(await new FinanceRepository().findPaymentById(id)).toMatchObject({ id, amount: 75 });
  expect(prisma.receiptAllocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
    id: allocation.id, reversedAt: null, invoiceId: { not: null }, receipt: { is: { status: 'ACTIVE' } },
  } }));
});
it('returns null for a reversed or cancelled receipt payment', async () => {
  (prisma.receiptAllocation.findFirst as jest.Mock).mockResolvedValue(null);
  expect(await new FinanceRepository().findPaymentById('receipt-allocation:' + allocation.id)).toBeNull();
});
