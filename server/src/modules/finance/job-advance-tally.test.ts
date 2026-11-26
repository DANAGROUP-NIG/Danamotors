jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  invoice: { findUnique: jest.fn() }, receipt: { findUnique: jest.fn() },
  tallyAccountMapping: { findMany: jest.fn() }, tallyLedger: { findMany: jest.fn() },
  tallyPostingLog: { findUnique: jest.fn(), create: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { TallyService } from './tally.service';

it('exports an advance as one cash receipt and clears its reference through the final sales bill', async () => {
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
  (prisma.tallyAccountMapping.findMany as jest.Mock).mockResolvedValue([{ accountType: 'LABOUR_SALES', tallyLedgerCode: 'LABOUR' }, { accountType: 'CASH', tallyLedgerCode: 'CASH' }]);
  (prisma.tallyLedger.findMany as jest.Mock).mockResolvedValue([{ code: 'LABOUR', name: 'Labour sales' }, { code: 'CASH', name: 'Cash' }]);
  (prisma.tallyPostingLog.findUnique as jest.Mock).mockResolvedValue(null);
  const customer = { tallyLedger: { active: true, name: 'Test customer' } };
  (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({
    id: 'bill', jobCardId: 'job', invoiceNumber: 'I1', issuedDate: new Date('2026-11-10T12:00:00Z'), status: 'Partially Paid',
    total: 500, partsTotal: 0, labourTotal: 500, serviceTotal: 0, partsDiscountAmount: 0, labourDiscountAmount: 0, vatAmount: 0, roundOff: 0,
    customer, allocations: [{ advanceReference: 'R1', amount: 200 }],
  });
  (prisma.receipt.findUnique as jest.Mock).mockResolvedValue({
    id: 'receipt', receiptNumber: 'R1', issuedAt: new Date('2026-11-09T12:00:00Z'), status: 'ACTIVE', amount: 200,
    advanceAmount: 0, mode: 'CASH', customer, advanceSnapshot: { tallyAsAdvance: true },
    allocations: [{ amount: 200, invoice: { invoiceNumber: 'I1' } }],
  });
  const result = await new TallyService().exportBatch({ documents: [{ type: 'RECEIPT', id: 'receipt' }, { type: 'JOB_BILL', id: 'bill' }], postedById: 'actor' });
  expect(result.skipped).toEqual([]);
  expect(result.exported).toHaveLength(2);
  const logs = jest.mocked(prisma.tallyPostingLog.create).mock.calls;
  const receiptXml = logs.find(([args]) => args.data.documentType === 'RECEIPT')?.[0].data.payload;
  const billXml = logs.find(([args]) => args.data.documentType === 'JOB_BILL')?.[0].data.payload;
  expect(receiptXml).toContain('<BILLTYPE>Advance</BILLTYPE>');
  expect(receiptXml).not.toContain('<BILLTYPE>Agst Ref</BILLTYPE>');
  expect(billXml).toContain('<BILLTYPE>Agst Ref</BILLTYPE>');
  expect(billXml).toContain('<NAME>R1</NAME>');
  expect(billXml).toContain('<NAME>I1</NAME>');
});
