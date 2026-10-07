// Runs only against a migrated, disposable database supplied as TEST_DATABASE_URL.
// Every fixture is created inside a transaction that is always rolled back.
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
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { startOfLocalDay } from './core/dates';
import type { ReportDb, ReportDefinition, ReportMode, ReportScope } from './core/types';
import { jobCardsOpenReport, serviceWiseProgressReport, vehiclesToBeReadyReport, workshopProgressReport, workshopStatusReport } from './workshop.reports';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const ROLLBACK = new Error('ROLLBACK_REPORT_FIXTURES');

/** Local (WAT) wall-clock time on a date → UTC instant. */
const at = (date: string, time: string) => new Date(startOfLocalDay(date).getTime() + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60_000);

async function inRollback(body: (tx: ReportDb) => Promise<void>) {
  await expect(
    prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw ROLLBACK;
      },
      { timeout: 60_000, maxWait: 10_000 },
    ),
  ).rejects.toBe(ROLLBACK);
}

/** A small workshop: one branch with jobs in every state, plus noise that must be excluded. */
async function seedWorkshop(tx: ReportDb) {
  const suffix = randomUUID().slice(0, 8);
  const branch = await tx.branch.create({ data: { name: `reports-${suffix}`, address: '18 Ekukinam Street', city: 'Abuja' } });
  const otherBranch = await tx.branch.create({ data: { name: `reports-other-${suffix}` } });
  const role = await tx.role.upsert({ where: { name: ROLES.SERVICE_ADVISOR }, update: {}, create: { name: ROLES.SERVICE_ADVISOR } });
  const advisor = await tx.user.create({
    data: { email: `adv-${suffix}@example.test`, firstName: 'Blessing', lastName: 'Adeyemi', passwordHash: 'x', roleId: role.id, branchId: branch.id },
  });
  const master = (kind: string, code: string, extra: Partial<Prisma.WorkshopMasterUncheckedCreateInput> = {}) =>
    tx.workshopMaster.create({ data: { kind, code: `${code}-${suffix}`, description: `${code} ${suffix}`, ...extra } });
  const paid = await master('SERVICE_TYPE', 'PAID');
  const pdi = await master('SERVICE_TYPE', 'PDI', { category: 'PDI' });
  const team = await master('TEAM', 'TEAM-A');
  const model = await master('MODEL', 'SPG');
  const variant = await master('VARIANT', 'SPG20', { parentId: model.id });
  const customer = await tx.customer.create({ data: { firstName: 'Chinedu', lastName: 'Okafor', phoneNumber: `080${suffix}`, address: '12 Adeola Odeku St', branchId: branch.id } });
  const vehicle = await tx.vehicle.create({ data: { vin: `VIN${suffix}`, registrationNumber: `ABJ${suffix}`, catalogueId: variant.id, customModel: 'Sportage', customerId: customer.id } });

  let sequence = 0;
  const job = async (data: Partial<Prisma.JobCardUncheckedCreateInput> & { createdAt: Date }, history: Array<[string, Date]> = []) => {
    sequence += 1;
    const card = await tx.jobCard.create({
      data: {
        jobNumber: `T${suffix}${sequence}`,
        description: 'Report fixture',
        branchId: branch.id,
        customerId: customer.id,
        vehicleId: vehicle.id,
        serviceTypeId: paid.id,
        teamId: team.id,
        serviceAdvisorId: advisor.id,
        status: 'OPEN',
        ...data,
      },
    });
    let from: string | null = null;
    for (const [toStatus, createdAt] of history) {
      await tx.jobCardStatusHistory.create({ data: { jobCardId: card.id, fromStatus: from, toStatus, actorId: advisor.id, createdAt } });
      from = toStatus;
    }
    return card;
  };
  const bill = (jobCardId: string, issuedDate: Date, total: number, extra: Partial<Prisma.InvoiceUncheckedCreateInput> = {}) =>
    tx.invoice.create({
      data: {
        customerId: customer.id,
        jobCardId,
        invoiceNumber: `B${suffix}${(sequence += 1)}`,
        issuedDate,
        subtotal: total,
        total,
        partsTotal: total - 20_000,
        labourTotal: 20_000,
        labourDiscountAmount: 2_000,
        ...extra,
      },
    });

  const D = '2026-09-30';
  // In progress on D, promised D 16:00.
  const inProgress = await job(
    { createdAt: at(D, '09:00'), status: 'IN_PROGRESS', promisedAt: at(D, '16:00') },
    [['OPEN', at(D, '09:00')], ['IN_PROGRESS', at(D, '10:00')]],
  );
  // Opened D-2, billed D-1, delivered D 12:00 (late: promised D-1 17:00).
  const delivered = await job(
    { createdAt: at('2026-09-28', '08:00'), status: 'DELIVERED', promisedAt: at('2026-09-29', '17:00'), readyAt: at('2026-09-29', '15:00'), billedAt: at('2026-09-29', '16:00'), deliveredAt: at(D, '12:00'), deliveryAdvisorId: advisor.id },
    [['OPEN', at('2026-09-28', '08:00')], ['IN_PROGRESS', at('2026-09-28', '09:00')], ['QC', at('2026-09-29', '14:00')], ['READY', at('2026-09-29', '15:00')], ['BILLED', at('2026-09-29', '16:00')], ['DELIVERED', at(D, '12:00')]],
  );
  await bill(delivered.id, at('2026-09-29', '16:00'), 120_000);
  // Bill raised and cancelled on D-1: back to READY.
  const rebilled = await job(
    { createdAt: at('2026-09-29', '08:00'), status: 'READY', readyAt: at('2026-09-29', '09:00') },
    [['OPEN', at('2026-09-29', '08:00')], ['READY', at('2026-09-29', '09:00')], ['BILLED', at('2026-09-29', '10:00')], ['READY', at('2026-09-29', '11:00')]],
  );
  await bill(rebilled.id, at('2026-09-29', '10:00'), 50_000, { cancelledAt: at('2026-09-29', '11:00'), status: 'Cancelled' });
  // Legacy status text, still open.
  const legacy = await job({ createdAt: at(D, '11:00'), status: 'Pending' });
  // Excluded everywhere: PDI, cancelled, other branch.
  const pdiJob = await job({ createdAt: at(D, '09:30'), serviceTypeId: pdi.id });
  const cancelled = await job({ createdAt: at(D, '09:45'), status: 'CANCELLED' }, [['OPEN', at(D, '09:45')], ['CANCELLED', at(D, '10:15')]]);
  const elsewhere = await tx.jobCard.create({ data: { jobNumber: `X${suffix}`, description: 'Other branch', branchId: otherBranch.id, createdAt: at(D, '09:00'), serviceTypeId: paid.id } });

  const scope: ReportScope = { branchIds: [branch.id], branch: null, timeZone: 'Africa/Lagos' };
  return { D, scope, branch, paid, model, variant, team, advisor, jobs: { inProgress, delivered, rebilled, legacy, pdiJob, cancelled, elsewhere } };
}

async function run<Q extends { branchId?: string; mode?: ReportMode }>(tx: ReportDb, report: ReportDefinition<Q>, scope: ReportScope, query: Record<string, unknown>) {
  return report.run(tx, scope, report.query.parse(query));
}

const numbers = (rows: Array<Record<string, unknown>>) => rows.map((row) => row.jobNumber).sort();

integration('Workshop reports against the database', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists job cards opened in the period, excluding cancelled, PDI and other-branch jobs', async () => {
    await inRollback(async (tx) => {
      const w = await seedWorkshop(tx);
      const result = await run(tx, jobCardsOpenReport, w.scope, { from: w.D, to: w.D });
      expect(numbers(result.rows)).toEqual([w.jobs.inProgress.jobNumber, w.jobs.legacy.jobNumber].sort());
      expect(result.totals.count).toBe(2);
      expect(result.rows.find((row) => row.jobNumber === w.jobs.legacy.jobNumber)?.status).toBe('OPEN');
      expect(result.breakdown).toEqual([expect.objectContaining({ key: w.paid.id, count: 2 })]);

      const filtered = await run(tx, jobCardsOpenReport, w.scope, { from: w.D, to: w.D, model: w.model.id, receivedBy: w.advisor.id });
      expect(filtered.totals.count).toBe(2);
      const none = await run(tx, jobCardsOpenReport, w.scope, { from: w.D, to: w.D, serviceType: randomUUID() });
      expect(none.totals.count).toBe(0);
    });
  });

  it('works out each job status as on the chosen date from history, bills and delivery', async () => {
    await inRollback(async (tx) => {
      const w = await seedWorkshop(tx);
      const status = async (date: string) => {
        const result = await run(tx, workshopStatusReport, w.scope, { date });
        return Object.fromEntries(result.rows.map((row) => [row.jobNumber as string, row.statusAsOn]));
      };
      expect(await status('2026-09-29')).toEqual({
        [w.jobs.delivered.jobNumber]: 'BILLED',
        [w.jobs.rebilled.jobNumber]: 'READY',
      });
      expect(await status(w.D)).toEqual({
        [w.jobs.delivered.jobNumber]: 'DELIVERED',
        [w.jobs.rebilled.jobNumber]: 'READY',
        [w.jobs.inProgress.jobNumber]: 'IN_PROGRESS',
        [w.jobs.legacy.jobNumber]: 'OPEN',
      });

      const undelivered = await run(tx, workshopStatusReport, w.scope, { date: w.D, undeliveredOnly: 'true' });
      expect(undelivered.rows).toHaveLength(3);
      expect(undelivered.summary).toMatchObject({ DELIVERED: 1, READY: 1, IN_PROGRESS: 1, OPEN: 1 });
      const billed = (await run(tx, workshopStatusReport, w.scope, { date: '2026-09-29' })).groups.find((group) => group.key === 'BILLED');
      expect(billed?.totals).toEqual({ count: 1, billAmount: 120_000 });
    });
  });

  it('flags overdue, due-soon and late deliveries against the promise time', async () => {
    await inRollback(async (tx) => {
      const w = await seedWorkshop(tx);
      const now = Date.now();
      const soon = await tx.jobCard.create({
        data: { jobNumber: `SOON${randomUUID().slice(0, 6)}`, description: 'x', branchId: w.branch.id, serviceTypeId: w.paid.id, createdAt: new Date(now - 3_600_000), promisedAt: new Date(now + 60 * 60_000) },
      });
      const late = await tx.jobCard.create({
        data: { jobNumber: `LATE${randomUUID().slice(0, 6)}`, description: 'x', branchId: w.branch.id, serviceTypeId: w.paid.id, createdAt: new Date(now - 7_200_000), promisedAt: new Date(now - 30 * 60_000) },
      });
      const today = new Date(now).toISOString().slice(0, 10);
      const result = await run(tx, workshopProgressReport, w.scope, { from: '2026-09-28', to: today, dueSoonHours: '2' });
      const state = Object.fromEntries(result.rows.map((row) => [row.jobNumber as string, row.promiseState]));
      expect(state[soon.jobNumber]).toBe('DUE_SOON');
      expect(state[late.jobNumber]).toBe('OVERDUE');
      expect(state[w.jobs.delivered.jobNumber]).toBe('DELIVERED_LATE');
      expect(result.rows.find((row) => row.jobNumber === w.jobs.delivered.jobNumber)?.minutesToPromise).toBe(-19 * 60);

      const byBill = await run(tx, workshopProgressReport, w.scope, { from: '2026-09-29', to: '2026-09-29', basis: 'bill' });
      expect(numbers(byBill.rows)).toEqual([w.jobs.delivered.jobNumber]);
    });
  });

  it('totals service-wise progress by bill date, ignoring cancelled bills', async () => {
    await inRollback(async (tx) => {
      const w = await seedWorkshop(tx);
      const result = await run(tx, serviceWiseProgressReport, w.scope, { from: '2026-09-29', to: w.D });
      expect(result.groups).toEqual([
        expect.objectContaining({ key: w.paid.id, count: 1, totals: expect.objectContaining({ count: 1, billed: 1, delivered: 1, late: 1, onTime: 0, labourBilled: 18_000, partsBilled: 100_000 }) }),
      ]);
    });
  });

  it('lists vehicles promised for the day that are not yet delivered', async () => {
    await inRollback(async (tx) => {
      const w = await seedWorkshop(tx);
      const result = await run(tx, vehiclesToBeReadyReport, w.scope, { date: w.D });
      expect(numbers(result.rows)).toEqual([w.jobs.inProgress.jobNumber]);
      expect(result.summary).toMatchObject({ promised: 1, ready: 0, inWork: 1 });
    });
  });
});
