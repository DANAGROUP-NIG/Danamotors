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
const card = {
  id: 'job', customerId: 'customer', branchId: 'branch', status: 'DELIVERED', creditApprovedById: 'admin',
  gatePassNumber: 'GP-1', deliveredAt: new Date('2026-01-01'), billedAt: null, invoices: [], partIssuances: [],
  labourLines: [{ id: 'labour', description: 'Repair', hours: 1, rate: 100, amount: 100 }],
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
