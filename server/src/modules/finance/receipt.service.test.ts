import { recalculateReceiptAllocations } from './receipt-allocation';

describe('recalculateReceiptAllocations', () => {
  it('reduces allocations in order when a receipt amount is lowered', () => {
    expect(recalculateReceiptAllocations(70, [
      { invoiceId: 'invoice-a', amount: 50, outstandingAmount: 0 },
      { invoiceId: 'invoice-b', amount: 50, outstandingAmount: 0 },
    ])).toEqual({
      allocations: [{ invoiceId: 'invoice-a', amount: 50 }, { invoiceId: 'invoice-b', amount: 20 }],
      advanceAmount: 0,
    });
  });

  it('expands allocations only up to each invoice outstanding balance and keeps the remainder as advance', () => {
    expect(recalculateReceiptAllocations(120, [
      { invoiceId: 'invoice-a', amount: 20, outstandingAmount: 10 },
      { invoiceId: 'invoice-b', amount: 30, outstandingAmount: 15 },
    ])).toEqual({
      allocations: [{ invoiceId: 'invoice-a', amount: 30 }, { invoiceId: 'invoice-b', amount: 45 }],
      advanceAmount: 45,
    });
  });

  it('records the full receipt as an advance when there are no prior invoice allocations', () => {
    expect(recalculateReceiptAllocations(250, [])).toEqual({ allocations: [], advanceAmount: 250 });
  });
});