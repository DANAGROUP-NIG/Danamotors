const tx = {
  materialReceiptNote: { updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: {
    materialReceiptNote: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)),
  },
}));
jest.mock('../notification/notification.service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({ notifyUsers: jest.fn() })),
}));

import prisma from '../../prisma/client';
import { approveDiscrepancy, discrepancyStatusFor } from './stockDiscrepancy';

const pending = { id: 'm1', mrnNumber: '2026000012', source: 'BRANCH_TRANSFER', discrepancyStatus: 'PENDING', totalDamaged: 1, totalShort: 2 };

describe('Which receipts wait for S/E approval', () => {
  it.each([
    [{ damaged: 0, short: 0 }, null],
    [{ damaged: 1, short: 0 }, 'PENDING'],
    [{ damaged: 0, short: 3 }, 'PENDING'],
  ])('%o → %s', (totals, expected) => {
    expect(discrepancyStatusFor(totals)).toBe(expected);
  });
});

describe('Approving a shortage', () => {
  it('approves a pending receipt and audits it with the remark', async () => {
    (prisma.materialReceiptNote.findUnique as jest.Mock).mockResolvedValue(pending);
    tx.materialReceiptNote.updateMany.mockResolvedValue({ count: 1 });

    const result = await approveDiscrepancy('m1', 'gsm', '  Carrier confirmed loss  ');

    expect(result.discrepancyStatus).toBe('APPROVED');
    const update = tx.materialReceiptNote.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'm1', discrepancyStatus: 'PENDING' });
    expect(update.data).toMatchObject({ discrepancyStatus: 'APPROVED', discrepancyApprovedById: 'gsm', discrepancyRemark: 'Carrier confirmed loss' });
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ userId: 'gsm', action: 'STOCK_DISCREPANCY_APPROVED' });
    expect(JSON.parse(audit.details)).toMatchObject({ mrnNumber: '2026000012', damaged: 1, short: 2 });
  });

  it('refuses a second approval (two approvers at once: only the first wins)', async () => {
    (prisma.materialReceiptNote.findUnique as jest.Mock).mockResolvedValue(pending);
    tx.materialReceiptNote.updateMany.mockResolvedValue({ count: 0 });
    await expect(approveDiscrepancy('m1', 'gsm')).rejects.toThrow('already been approved');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a receipt with nothing damaged or short', { ...pending, discrepancyStatus: null }],
    ['a vendor receipt', { ...pending, source: 'VENDOR' }],
  ])('refuses %s', async (_label, mrn) => {
    (prisma.materialReceiptNote.findUnique as jest.Mock).mockResolvedValue(mrn);
    await expect(approveDiscrepancy('m1', 'gsm')).rejects.toThrow('no shortage or damage to approve');
  });

  it('reports a missing MRN', async () => {
    (prisma.materialReceiptNote.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(approveDiscrepancy('missing', 'gsm')).rejects.toThrow('MRN not found');
  });
});
