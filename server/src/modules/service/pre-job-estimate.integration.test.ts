// Runs only against a migrated, disposable database supplied as TEST_DATABASE_URL.
// These services open their own transactions, so fixtures are committed and removed afterwards.
import fs from 'fs';
import path from 'path';

const envFile = path.resolve(__dirname, '../../../.env');
if (process.env.TEST_DATABASE_URL && fs.existsSync(envFile)) {
  const configured = fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)?.[1];
  if (configured && configured.trim() === process.env.TEST_DATABASE_URL.trim())
    throw new Error('TEST_DATABASE_URL must not be the database in .env (the shared dev database)');
}
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { randomUUID } from 'crypto';
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { jobEstimateRegisterReport } from '../reports/front-office.reports';
import type { ReportScope } from '../reports/core/types';
import { cancelPreJobEstimate, createPreJobEstimate, decidePreJobEstimate, linkEstimateToOpenedJob } from './pre-job-estimate.service';
import { ServiceService } from './service.service';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration('Pre-job estimates', () => {
  const suffix = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const branch = await prisma.branch.create({ data: { name: `estimates-${suffix}` } });
    const role = await prisma.role.upsert({ where: { name: ROLES.SERVICE_ADVISOR }, update: {}, create: { name: ROLES.SERVICE_ADVISOR } });
    const user = await prisma.user.create({ data: { email: `est-${suffix}@example.test`, firstName: 'Est', lastName: 'Imator', passwordHash: 'x', roleId: role.id, branchId: branch.id } });
    const customer = await prisma.customer.create({ data: { firstName: 'Ngozi', lastName: 'Eze', branchId: branch.id } });
    const vehicle = await prisma.vehicle.create({ data: { vin: `EST${suffix}`, registrationNumber: `EKY${suffix}`, customModel: 'Sorento', customerId: customer.id } });
    const part = await prisma.sparePart.create({ data: { partNumber: `P-${suffix}`, name: 'Brake pad set', retailRate: 45_000 } });
    const unpriced = await prisma.sparePart.create({ data: { partNumber: `U-${suffix}`, name: 'Unpriced part' } });
    const labour = await prisma.labourItem.create({ data: { code: `L-${suffix}`, description: 'Brake service', rate: 20_000 } });
    const service = await prisma.service.create({ data: { name: `Service ${suffix}`, price: 30_000 } });
    Object.assign(ids, { branch: branch.id, user: user.id, customer: customer.id, vehicle: vehicle.id, part: part.id, unpriced: unpriced.id, labour: labour.id, service: service.id });
  });

  afterAll(async () => {
    await prisma.estimate.deleteMany({ where: { branchId: ids.branch } });
    await prisma.jobCard.deleteMany({ where: { branchId: ids.branch } });
    await prisma.auditLog.deleteMany({ where: { userId: ids.user } });
    await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
    await prisma.customer.deleteMany({ where: { id: ids.customer } });
    await prisma.sparePart.deleteMany({ where: { id: { in: [ids.part, ids.unpriced] } } });
    await prisma.labourItem.deleteMany({ where: { id: ids.labour } });
    await prisma.service.deleteMany({ where: { id: ids.service } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.branch.deleteMany({ where: { id: ids.branch } });
    await prisma.$disconnect();
  });

  const create = (discountAmount = 0) =>
    createPreJobEstimate(
      {
        customerId: ids.customer,
        vehicleId: ids.vehicle,
        description: 'Brakes',
        discountAmount,
        lines: [
          { type: 'PART', referenceId: ids.part, quantity: 2 },
          { type: 'LABOUR', referenceId: ids.labour, quantity: 1.5 },
          { type: 'SERVICE', referenceId: ids.service, quantity: 1 },
        ],
      },
      ids.branch,
      ids.user,
    );

  it('prices, numbers and opens an estimate for the customer decision', async () => {
    const estimate = await create(5_000);
    expect(estimate.estimateNumber).toMatch(/^\d{4}\d{6}$/);
    expect(estimate).toMatchObject({ jobCardId: null, amount: 150_000, discountAmount: 5_000, currency: 'NGN', status: 'Pending', estimateStatus: 'PENDING_APPROVAL' });
    expect(estimate.lines.map((line) => [line.type, line.amount]).sort()).toEqual([['LABOUR', 30_000], ['PART', 90_000], ['SERVICE', 30_000]]);
  });

  it('rejects unpriced parts, a discount above the amount and another customer\'s vehicle', async () => {
    await expect(createPreJobEstimate({ customerId: ids.customer, vehicleId: ids.vehicle, description: 'x', discountAmount: 0, lines: [{ type: 'PART', referenceId: ids.unpriced, quantity: 1 }] }, ids.branch, ids.user)).rejects.toThrow('Retail rate is not set');
    await expect(create(1_000_000)).rejects.toThrow('discount cannot be more');
    const other = await prisma.customer.create({ data: { firstName: 'Other', lastName: 'Owner', branchId: ids.branch } });
    await expect(createPreJobEstimate({ customerId: other.id, vehicleId: ids.vehicle, description: 'x', discountAmount: 0, lines: [{ type: 'SERVICE', referenceId: ids.service, quantity: 1 }] }, ids.branch, ids.user)).rejects.toThrow('another customer');
    await prisma.customer.delete({ where: { id: other.id } });
  });

  it('records one decision: approved stays active, declined closes it', async () => {
    const approved = await create();
    await new ServiceService().addApproval(approved.id, { customerId: ids.customer, approved: true }, ids.user);
    expect(await prisma.estimate.findUniqueOrThrow({ where: { id: approved.id } })).toMatchObject({ status: 'Approved', estimateStatus: 'ACTIVE', closedReason: null });
    await expect(decidePreJobEstimate(approved.id, { customerId: ids.customer, approved: false })).rejects.toThrow('already has a decision');

    const declined = await create();
    await expect(decidePreJobEstimate(declined.id, { customerId: randomUUID(), approved: true })).rejects.toThrow('estimate customer');
    await decidePreJobEstimate(declined.id, { customerId: ids.customer, approved: false });
    expect(await prisma.estimate.findUniqueOrThrow({ where: { id: declined.id } })).toMatchObject({ status: 'Declined', estimateStatus: 'CLOSED', closedReason: 'DECLINED' });
  });

  it('cancels an open estimate once', async () => {
    const estimate = await create();
    const cancelled = await cancelPreJobEstimate(estimate.id, 'Customer will not proceed', ids.user);
    expect(cancelled).toMatchObject({ estimateStatus: 'CLOSED', closedReason: 'CANCELLED' });
    await expect(cancelPreJobEstimate(estimate.id, 'again', ids.user)).rejects.toThrow('already closed');
  });

  it('is converted when a job is opened from it, and the register reflects every state', async () => {
    const estimate = await create();
    const job = await prisma.jobCard.create({ data: { jobNumber: `J${suffix}`, description: 'x', branchId: ids.branch, vehicleId: ids.vehicle, customerId: ids.customer } });
    await expect(prisma.$transaction((tx) => linkEstimateToOpenedJob(tx, estimate.id, { id: job.id, vehicleId: randomUUID(), branchId: ids.branch }))).rejects.toThrow('same vehicle');
    await prisma.$transaction((tx) => linkEstimateToOpenedJob(tx, estimate.id, { id: job.id, vehicleId: ids.vehicle, branchId: ids.branch }));
    expect(await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id } })).toMatchObject({ openedJobCardId: job.id, estimateStatus: 'CLOSED', closedReason: 'CONVERTED' });

    const scope: ReportScope = { branchIds: [ids.branch], branch: null, timeZone: 'Africa/Lagos' };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
    const run = (query: Record<string, unknown>) =>
      prisma.$transaction((tx) => jobEstimateRegisterReport.run(tx, scope, jobEstimateRegisterReport.query.parse({ from: today, to: today, ...query })));

    const all = await run({ withLines: 'true' });
    expect(all.rows.length).toBe(5);
    expect(all.summary).toMatchObject({ count: 5, approved: 1, declined: 1, opened: 1 });
    expect(all.totals).toMatchObject({ count: 5, partsAmount: 450_000, labourAmount: 150_000, serviceAmount: 150_000, discountAmount: 5_000, netAmount: 745_000 });
    const opened = all.rows.find((row) => row.id === estimate.id);
    expect(opened).toMatchObject({ jobNumber: `J${suffix}`, serviceType: `Service ${suffix}` });
    expect(opened?.lines).toHaveLength(3);

    expect((await run({ jobStatus: 'opened' })).rows.map((row) => row.id)).toEqual([estimate.id]);
    expect((await run({ jobStatus: 'not_opened' })).rows).toHaveLength(4);
    expect((await run({ estimateStatus: 'active' })).rows).toHaveLength(1);
    expect((await run({ estimateStatus: 'pending' })).rows).toHaveLength(1);
    expect((await run({ estimateStatus: 'closed' })).rows).toHaveLength(3);
  });
});
