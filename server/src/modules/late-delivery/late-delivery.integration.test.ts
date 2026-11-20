import { Prisma, type PrismaClient } from '@prisma/client';
import type { ReportDefinition, ReportScope } from '../reports/core/types';
import type { LateActor, LateDeliveryService } from './late-delivery.service';

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

describeDb('late deliveries on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let service: LateDeliveryService;
  let reports: ReportDefinition[];
  let lateness: typeof import('./late-delivery.logic').lateness;
  let lateKindSql: typeof import('./late-delivery.sql').lateKindSql;
  const ids: Record<string, string> = {};
  const reason: Record<string, string> = {};
  const run = `${Date.now()}`.slice(-8);
  let sequence = 0;
  let manager: LateActor;
  let outsider: LateActor;

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('Late delivery tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    service = new (require('./late-delivery.service').LateDeliveryService)();
    reports = require('../reports/reports.registry').REPORTS;
    lateness = require('./late-delivery.logic').lateness;
    lateKindSql = require('./late-delivery.sql').lateKindSql;

    ids.branch = (await db.branch.create({ data: { name: `Late fixture ${run}` } })).id;
    ids.other = (await db.branch.create({ data: { name: `Late fixture other ${run}` } })).id;
    const role = async (name: string) => (await db.role.upsert({ where: { name }, update: {}, create: { name } })).id;
    const user = async (name: string, branchId: string) =>
      (await db.user.create({ data: { firstName: 'Synthetic', lastName: name, email: `late-${name.toLowerCase()}-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: await role('ServiceManager'), branchId } })).id;
    ids.manager = await user('Manager', ids.branch);
    ids.outsider = await user('Outsider', ids.other);
    manager = { userId: ids.manager, branchId: ids.branch, allBranches: false };
    outsider = { userId: ids.outsider, branchId: ids.other, allBranches: false };
    ids.customer = (await db.customer.create({ data: { firstName: 'Late', lastName: 'Customer', branchId: ids.branch } })).id;

    const master = async (kind: string, code: string, extra: Record<string, unknown> = {}) => (await db.workshopMaster.create({ data: { kind, code: `${code}-${run}`, description: `${kind} ${code}`, ...extra } })).id;
    const make = await master('MAKE', 'MK');
    const product = await master('PRODUCT', 'PR', { parentId: make });
    ids.model = await master('MODEL', 'MD', { parentId: product });
    ids.variant = await master('VARIANT', 'VR', { parentId: ids.model });
    ids.paidType = await master('SERVICE_TYPE', 'PS');
    ids.freeType = await master('SERVICE_TYPE', 'FS');
    for (const row of await db.workshopMaster.findMany({ where: { kind: 'LATE_REASON', code: { in: ['1', '2', '3', '4', '5', '6'] } } })) reason[row.code] = row.id;
    if (Object.keys(reason).length !== 6) throw new Error('Run the late deliveries migration first (LATE_REASON codes 1-6)');

    const vehicle = async (registrationNumber: string) => (await db.vehicle.create({ data: { vin: `KNALATE${run}${++sequence}`, registrationNumber, customerId: ids.customer, catalogueId: ids.variant, customModel: 'Late model' } })).id;
    const job = async (key: string, promisedAt: string, deliveredAt: string | null, extra: Record<string, unknown> = {}) => {
      ids[key] = (
        await db.jobCard.create({
          data: {
            jobNumber: `LATE-${run}-${key}`, description: 'Service', branchId: ids.branch, customerId: ids.customer, vehicleId: await vehicle(`L${run.slice(-4)}${key.slice(0, 3)}`.toUpperCase()),
            serviceTypeId: ids.paidType, status: deliveredAt ? 'DELIVERED' : 'READY', promisedAt: new Date(promisedAt), deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
            createdAt: new Date('2026-01-02T07:00:00Z'), ...extra,
          },
        })
      ).id;
    };
    // Promised 17:00 Lagos (16:00Z) on 2 Jan 2026 unless stated.
    await job('date', '2026-01-02T16:00:00Z', '2026-01-03T09:20:00Z'); // next day: 1 day late
    await job('time', '2026-01-02T16:00:00Z', '2026-01-02T17:10:00Z', { lateReasonIds: [] }); // 70 minutes late, no reason recorded
    await job('ontime', '2026-01-02T16:00:00Z', '2026-01-02T15:00:00Z');
    await job('midnight', '2026-01-02T22:00:00Z', '2026-01-02T23:30:00Z', { serviceTypeId: ids.freeType }); // 23:00 → 00:30 Lagos: by date
    await job('open', '2026-01-02T16:00:00Z', null);
    await job('cancelled', '2026-01-02T16:00:00Z', '2026-01-04T09:00:00Z', { status: 'CANCELLED' });
    await job('elsewhere', '2026-01-02T16:00:00Z', '2026-01-05T09:00:00Z', { branchId: ids.other });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const scope = (): ReportScope => ({ branchIds: [ids.branch], branch: null, timeZone: 'Africa/Lagos', permissions: [] });
  const report = (slug: string, query: Record<string, unknown> = {}) => {
    const definition = reports.find((row) => row.slug === slug)!;
    return definition.run(db, scope(), definition.query.parse({ from: '2026-01-02', to: '2026-01-02', ...query }));
  };
  const jobNumbers = (rows: Record<string, unknown>[]) => rows.map((row) => String(row.jobNumber).split('-').pop()).sort();

  it('classifies in SQL exactly as lateness() does, including just after Lagos midnight', async () => {
    const rows = await db.$queryRaw<{ id: string; kind: string | null; promisedAt: Date; deliveredAt: Date }[]>(Prisma.sql`
      SELECT j."id", ${lateKindSql('Africa/Lagos')} AS "kind", j."promisedAt", j."deliveredAt"
      FROM "JobCard" j WHERE j."id" IN (${Prisma.join([ids.date, ids.time, ids.ontime, ids.midnight])})`);
    for (const row of rows) expect(row.kind).toBe(lateness(row.promisedAt, row.deliveredAt, 'Africa/Lagos').kind);
    expect(rows.find((row) => row.id === ids.midnight)?.kind).toBe('DATE');
  });

  it('puts date-late jobs in the date reports only and time-late jobs in the time reports only', async () => {
    const date = await report('promise-date-discrepancy');
    const time = await report('promise-time-discrepancy');
    expect(jobNumbers(date.rows)).toEqual(['date', 'midnight']);
    expect(jobNumbers(time.rows)).toEqual(['time']);
    // Delivered with a promise: date, time, ontime, midnight (open, cancelled and the other branch are left out).
    expect(date.totals).toMatchObject({ delivered: 4, late: 2, latePct: 50, avgLate: 1 });
    expect(time.totals).toMatchObject({ delivered: 4, late: 1, latePct: 25, avgLate: 70 });
    expect(date.sections?.map((section) => section.key)).toEqual(['model', 'serviceType', 'reason']);
  });

  it('applies the dimension filters and the all-dates choice', async () => {
    const free = await report('promise-date-discrepancy', { serviceType: ids.freeType });
    expect(jobNumbers(free.rows)).toEqual(['midnight']);
    expect(free.totals.delivered).toBe(1);
    const otherDay = await report('promise-date-discrepancy', { from: '2026-02-01', to: '2026-02-01' });
    expect(otherDay.rows).toHaveLength(0);
    const all = await report('promise-date-discrepancy', { from: '2026-02-01', to: '2026-02-01', allDates: 'true' });
    expect(jobNumbers(all.rows)).toEqual(['date', 'midnight']);
  });

  it('analysis totals equal the discrepancy totals, and the delayed list is their union', async () => {
    const [dateReport, dateAnalysis, timeReport, timeAnalysis, list] = await Promise.all([
      report('promise-date-discrepancy'), report('promise-date-analysis'), report('promise-time-discrepancy'), report('promise-time-analysis'), report('delayed-deliveries'),
    ]);
    expect(dateAnalysis.totals).toMatchObject({ delivered: dateReport.totals.delivered, late: dateReport.totals.late, latePct: dateReport.totals.latePct });
    expect(timeAnalysis.totals).toMatchObject({ delivered: timeReport.totals.delivered, late: timeReport.totals.late, latePct: timeReport.totals.latePct });
    expect(timeAnalysis.rows.find((row) => row.id === 'none')).toMatchObject({ late: 1, lateShare: 100 });
    expect(jobNumbers(list.rows)).toEqual([...jobNumbers(dateReport.rows), ...jobNumbers(timeReport.rows)].sort());
    expect(list.totals).toMatchObject({ count: 3, dateLate: 2, timeLate: 1 });
  });

  it('opens only jobs late of the screen kind, with a clear message otherwise', async () => {
    await expect(service.detail(ids.date, 'DATE', manager)).resolves.toMatchObject({ lateness: { kind: 'DATE', daysLate: 1 } });
    await expect(service.detail(ids.date, 'TIME', manager)).rejects.toThrow(/promise date details entry/);
    await expect(service.detail(ids.ontime, 'DATE', manager)).rejects.toThrow(/was not delivered late/);
    await expect(service.detail(ids.open, 'DATE', manager)).rejects.toThrow(/not been delivered/);
    await expect(service.find({ kind: 'DATE', q: `LATE-${run}-ontime` }, manager)).rejects.toThrow(/was not delivered late/);
  });

  it('finds by job no or registration, and lists the worklist with missing-reason counts', async () => {
    const vehicleOf = await db.jobCard.findUniqueOrThrow({ where: { id: ids.date }, select: { vehicle: { select: { registrationNumber: true } } } });
    const plate = vehicleOf.vehicle!.registrationNumber!;
    await expect(service.find({ kind: 'DATE', q: `${plate.slice(0, 3)} ${plate.slice(3)}` }, manager)).resolves.toEqual({ id: ids.date });
    await expect(service.find({ kind: 'TIME', q: `late-${run}-time` }, manager)).resolves.toEqual({ id: ids.time });
    const list = await service.list({ kind: 'DATE', dateFrom: '2026-01-02', dateTo: '2026-01-02', reasons: 'all', page: 1, limit: 25 }, manager);
    expect(list.items.map((item) => item.id).sort()).toEqual([ids.date, ids.midnight].sort());
    expect(list.counts).toEqual({ all: 2, missing: 2, recorded: 0 });
  });

  it('refuses another branch (403) unless the user has branch:all', async () => {
    await expect(service.detail(ids.date, 'DATE', outsider)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.save(ids.date, { kind: 'DATE', reasonIds: [reason['1']] }, outsider)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.detail(ids.date, 'DATE', { ...outsider, allBranches: true })).resolves.toMatchObject({ id: ids.date });
  });

  it('saves up to six distinct reasons and a remark, audited with the previous values', async () => {
    await expect(service.save(ids.date, { kind: 'DATE', reasonIds: [reason['1'], reason['1']] }, manager)).rejects.toThrow(/only once/);
    await expect(service.save(ids.date, { kind: 'TIME', reasonIds: [reason['1']] }, manager)).rejects.toThrow(/promise date details entry/);
    await expect(service.save(ids.date, { kind: 'DATE', reasonIds: [reason['2'], reason['4']], remarks: '  Waiting for the compressor  ' }, manager)).resolves.toEqual({ id: ids.date, changed: true });
    await expect(service.save(ids.date, { kind: 'DATE', reasonIds: [reason['2'], reason['4']], remarks: 'Waiting for the compressor' }, manager)).resolves.toEqual({ id: ids.date, changed: false });
    const saved = await db.jobCard.findUniqueOrThrow({ where: { id: ids.date }, select: { lateReasonIds: true, lateRemarks: true } });
    expect(saved).toEqual({ lateReasonIds: [reason['2'], reason['4']], lateRemarks: 'Waiting for the compressor' });

    const detail = await service.detail(ids.date, 'DATE', manager);
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]).toMatchObject({ kind: 'DATE', before: { reasonIds: [], remarks: null }, after: { reasonIds: [reason['2'], reason['4']], remarks: 'Waiting for the compressor' } });

    const byReason = (await report('promise-date-discrepancy')).sections!.find((section) => section.key === 'reason')!;
    expect(byReason.rows.find((row) => row.id === reason['2'])).toMatchObject({ late: 1, lateShare: 50 });
  });
});
