jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(), $queryRaw: jest.fn(),
    jobCard: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    invoice: { create: jest.fn() },
    documentSequence: { upsert: jest.fn() },
  },
}));

import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { JobBillingService } from './job-billing.service';
import { ROLES } from '../../shared/constants/roles';

const input = { jobCardId: 'job', serviceAdvisorId: 'advisor', actorId: 'actor', partsDiscountPercent: 0, labourDiscountPercent: 0 };
const approved = { id: 'estimate', status: 'Approved', amount: 300, approvals: [{ approved: true, customerId: 'customer' }], lines: [{ type: 'LABOUR', referenceId: 'operation', description: 'Repair', quantity: 1, rate: 100, amount: 100 }, { type: 'SERVICE', referenceId: 'service', description: 'Full service', quantity: 1, rate: 200, amount: 200 }] };
const card = {
  serviceId: 'service', estimates: [approved],
  id: 'job', customerId: 'customer', branchId: 'branch', status: 'DELIVERED', creditApprovedById: 'admin',
  gatePassNumber: 'GP-1', deliveredAt: new Date('2026-01-01'), billedAt: null, invoices: [], partIssuances: [],
  labourLines: [{ id: 'labour', labourItemId: 'operation', description: 'Repair', hours: 1, rate: 100, amount: 100 }],
};

describe('Job billing after delivery on credit', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((callback) => callback(prisma));
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(card);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'advisor', role: { name: ROLES.SERVICE_ADVISOR }, isActive: true, branchId: 'branch' });
    (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({ value: 1 });
    (prisma.invoice.create as jest.Mock).mockResolvedValue({ id: 'invoice' });
  });

  it('creates a bill while preserving delivery and gate-pass details', async () => {
    await new JobBillingService().createJobBill(input);
    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ jobCardId: 'job', customerId: 'customer', labourTotal: 100 }) }));
    const data = (prisma.jobCard.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('DELIVERED');
    expect(data.billedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('deliveredAt');
    expect(data).not.toHaveProperty('gatePassNumber');
    expect(data.statusHistory.create).toEqual(expect.objectContaining({ toStatus: 'DELIVERED', actorId: 'actor', remarks: expect.stringContaining('Job bill') }));
  });

  it('snapshots the named service charge exactly once alongside labour', async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...card, service: { name: 'Full service' }, serviceCharge: 200 });
    const preview = await new JobBillingService().previewJobBill(input);
    await new JobBillingService().createJobBill(input);
    const data = (prisma.invoice.create as jest.Mock).mock.calls[0][0].data;
    expect(preview.lines.filter(line => line.type === 'SERVICE')).toEqual([expect.objectContaining({ description: 'Full service ? service charge', amount: 200, quantity: 1 })]);
    expect(data.serviceTotal).toBe(200);
    expect(data.total).toBe(preview.totals.total);
    expect(data.lines.createMany.data.filter((line: { type: string }) => line.type === 'SERVICE')).toHaveLength(1);
  });

  it('keeps an explicitly waived service visible without adding a charge', async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...card, service: { name: 'Full service' }, serviceCharge: 0 });
    const preview = await new JobBillingService().previewJobBill(input);
    expect(preview.lines).toContainEqual(expect.objectContaining({ type: 'SERVICE', amount: 0 }));
    expect(preview.totals.serviceTotal).toBe(0);
  });

  it('blocks billing when the latest estimate is not approved', async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...card, estimates: [{ ...approved, status: 'Pending', approvals: [] }] });
    const preview = await new JobBillingService().previewJobBill(input);
    expect(preview.review.canBill).toBe(false);
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow('latest estimate');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('saves included labour at zero additional charge and charges the service once', async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...card, serviceCharge: 200, estimates: [{ ...approved, lines: approved.lines.map(line => line.type === 'LABOUR' ? { ...line, type: 'INCLUDED_LABOUR', rate: 0, amount: 0 } : line) }] });
    await new JobBillingService().createJobBill(input);
    const data = (prisma.invoice.create as jest.Mock).mock.calls[0][0].data;
    expect(data.serviceTotal).toBe(200);
    expect(data.labourTotal).toBe(0);
    expect(data.lines.createMany.data).toContainEqual(expect.objectContaining({ type: 'LABOUR', amount: 0, rate: 0, description: 'Repair (included in service charge)' }));
  });

  it('rejects delivered jobs without credit approval', async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...card, creditApprovedById: null });
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow('approved credit');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('prevents a second active bill after delivery', async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...card, invoices: [{ status: 'Unpaid' }] });
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow('active bill');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('keeps normal READY billing on the BILLED lifecycle step', async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...card, status: 'READY', creditApprovedById: null });
    await new JobBillingService().createJobBill(input);
    expect(prisma.jobCard.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'BILLED' }) }));
  });
});

const prismaFailure = (code: string) => new Prisma.PrismaClientKnownRequestError('database failure', { code, clientVersion: '6.16.2' });

describe('Job-bill transaction resilience', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((callback) => callback(prisma));
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(card);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'advisor', role: { name: ROLES.SERVICE_ADVISOR }, isActive: true, branchId: 'branch' });
    (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({ value: 1 });
    (prisma.invoice.create as jest.Mock).mockResolvedValue({ id: 'invoice' });
  });

  it('uses bounded transaction limits and bulk inserts line snapshots', async () => {
    await new JobBillingService().createJobBill(input);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    expect((prisma.invoice.create as jest.Mock).mock.calls[0][0].data.lines).toEqual({ createMany: { data: [expect.objectContaining({ type: 'LABOUR', amount: 100 })] } });
    expect((prisma.jobCard.findUnique as jest.Mock).mock.calls[0][0].include.labourLines).toBe(true);
  });

  it('retries an aborted serialization conflict', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(prismaFailure('P2034'));
    await expect(new JobBillingService().createJobBill(input)).resolves.toEqual({ id: 'invoice' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('stops after three conflicting attempts', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(prismaFailure('P2034'));
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow('changed during billing');
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each(['P2028', 'P2024'])('does not replay %s and provides a recoverable error', async (code) => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(prismaFailure(code));
    await expect(new JobBillingService().createJobBill(input)).rejects.toMatchObject({ statusCode: 503 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not retry a duplicate bill', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(prismaFailure('P2002'));
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow('already been billed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
