import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
const testUrl = process.env.TEST_DATABASE_URL;
const localStaging = !!testUrl && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(testUrl).hostname) && new URL(testUrl).pathname === '/notification_staging';
if (localStaging) process.env.DATABASE_URL = testUrl;
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { requestJobcardParts } from '../service/jobcard-parts-request.service';
import { processJobcardNotification } from './jobcard-notification-router';

const integration = localStaging ? describe : describe.skip;
integration('Durable parts delivery in disposable localhost notification_staging', () => {
  afterAll(async () => { await prisma.$disconnect(); });
  it('keeps the request and event together, then delivers once across producer and consumer retries', async () => {
    const original = prisma.$transaction.bind(prisma);
    const rollback = new Error('ROLLBACK_PARTS_OUTBOX_FIXTURES');
    await expect(original(async tx => {
      const suffix = randomUUID();
      const branch = await tx.branch.create({ data: { name: `parts-outbox-${suffix}` } });
      const techRole = await tx.role.upsert({ where: { name: ROLES.TECHNICIAN }, update: {}, create: { name: ROLES.TECHNICIAN } });
      const storeRole = await tx.role.upsert({ where: { name: ROLES.BRANCH_STORE_MANAGER }, update: {}, create: { name: ROLES.BRANCH_STORE_MANAGER } });
      const actor = await tx.user.create({ data: { email: `actor-${suffix}@example.test`, firstName: 'Test', lastName: 'Technician', passwordHash: randomUUID(), branchId: branch.id, roleId: techRole.id } });
      const manager = await tx.user.create({ data: { email: `store-${suffix}@example.test`, firstName: 'Test', lastName: 'Manager', passwordHash: randomUUID(), branchId: branch.id, roleId: storeRole.id } });
      const customer = await tx.customer.create({ data: { firstName: 'Test', lastName: 'Customer', branchId: branch.id } });
      const job = await tx.jobCard.create({ data: { branchId: branch.id, customerId: customer.id, createdById: actor.id, technicianId: actor.id, jobNumber: `J-${suffix}`, description: 'Synthetic legacy job', status: 'IN_PROGRESS', openingSignatureRequired: false } });
      const requestId = randomUUID();
      const eventId = `workshop:${job.id}:PART_REQUESTED:button:${requestId}`;
      const dedupeKey = `PART_REQUESTED:${job.id}:button:${requestId}`;
      const spy = jest.spyOn(prisma, '$transaction').mockImplementation(((callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)) as typeof prisma.$transaction);
      try {
        await requestJobcardParts(job.id, branch.id, actor.id, requestId);
        expect(await tx.notification.count({ where: { dedupeKey } })).toBe(0);
        const event = await tx.jobcardNotificationEvent.findUniqueOrThrow({ where: { id: eventId } });
        await processJobcardNotification(event);
        await requestJobcardParts(job.id, branch.id, actor.id, requestId);
        await processJobcardNotification(event);
        expect(await tx.notification.findMany({ where: { dedupeKey }, select: { userId: true } })).toEqual([{ userId: manager.id }]);
        expect(await tx.jobcardNotificationEvent.count({ where: { id: eventId } })).toBe(1);
        expect((await tx.jobcardNotificationEvent.findUniqueOrThrow({ where: { id: eventId } })).processedAt).not.toBeNull();
      } finally { spy.mockRestore(); }
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
  });
});
