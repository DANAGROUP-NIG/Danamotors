import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

// Never run against an external database, even if TEST_DATABASE_URL is supplied.
const testUrl = process.env.TEST_DATABASE_URL;
const local = !!testUrl && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(testUrl).hostname);
if (local) process.env.DATABASE_URL = testUrl;
import prisma from '../../prisma/client';
import { ReceiptService } from './receipt.service';
import { applyJobAdvances } from './job-advance';
import { assertDepositPaid } from '../service/job-deposit.service';
import { availablePartyCredit } from './party-account.service';

const integration = local ? describe : describe.skip;
integration('Job advances in disposable local PostgreSQL', () => {
  afterAll(async () => { await prisma.$disconnect(); });
  it('reserves multiple advances, applies them once to a final bill and receipts the balance', async () => {
    const rollback = new Error('ROLLBACK_ADVANCE_FIXTURES');
    const original = prisma.$transaction.bind(prisma);
    await expect(original(async tx => {
      const suffix = randomUUID();
      const branch = await tx.branch.create({ data: { name: `advance-${suffix}` } });
      const role = await tx.role.upsert({ where: { name: 'Admin' }, update: {}, create: { name: 'Admin' } });
      const actor = await tx.user.create({ data: { email: `${suffix}@example.test`, firstName: 'Test', lastName: 'Cashier', passwordHash: randomUUID(), branchId: branch.id, roleId: role.id } });
      const customer = await tx.customer.create({ data: { firstName: 'Test', lastName: 'Customer', branchId: branch.id } });
      const job = await tx.jobCard.create({ data: { branchId: branch.id, customerId: customer.id, jobNumber: `J-${suffix}`, description: 'Synthetic repair', status: 'OPEN' } });
      await tx.estimate.create({ data: { jobCardId: job.id, description: 'Synthetic estimate', amount: 500 } });
      const spy = jest.spyOn(prisma, '$transaction').mockImplementation(((callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)) as typeof prisma.$transaction);
      try {
        await expect(assertDepositPaid(tx, job.id)).rejects.toThrow('positive advance');
        const service = new ReceiptService();
        const input = { customerId: customer.id, branchId: branch.id, advanceJobCardId: job.id, amount: 200, mode: 'CASH' as const, category: 'SERVICE_PARTS' as const, issuedById: actor.id, allocations: [], idempotencyKey: randomUUID() };
        const first = await service.createReceipt(input);
        expect((await service.createReceipt(input)).id).toBe(first.id);
        await expect(assertDepositPaid(tx, job.id)).resolves.toBeUndefined();
        await service.createReceipt({ ...input, amount: 100, idempotencyKey: randomUUID() });
        expect(await availablePartyCredit(tx, customer.id, branch.id)).toBe(0);
        const invoice = await tx.invoice.create({ data: { jobCardId: job.id, customerId: customer.id, invoiceNumber: `I-${suffix}`, subtotal: 550, total: 550, outstandingAmount: 550 } });
        await tx.jobCard.update({ where: { id: job.id }, data: { status: 'BILLED', billedAt: new Date() } });
        const billed = await applyJobAdvances(tx, [job.id], invoice, branch.id);
        expect(billed).toMatchObject({ outstandingAmount: 250, status: 'Partially Paid' });
        expect(await tx.receiptAllocation.count({ where: { invoiceId: invoice.id } })).toBe(2);
        await service.createReceipt({ ...input, advanceJobCardId: undefined, amount: 250, idempotencyKey: randomUUID(), allocations: [{ invoiceId: invoice.id, amount: 250 }] });
        expect(await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ outstandingAmount: 0, status: 'Paid' });
        expect(await tx.receipt.count({ where: { customerId: customer.id } })).toBe(3);
        expect(await availablePartyCredit(tx, customer.id, branch.id)).toBe(0);
      } finally { spy.mockRestore(); }
      throw rollback;
    }, { timeout: 30_000 })).rejects.toBe(rollback);
  });
});
