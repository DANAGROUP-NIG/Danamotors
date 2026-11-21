import type { PrismaClient } from '@prisma/client';
import type { ReportDefinition, ReportRow, ReportScope } from '../reports/core/types';
import type { PsfActor, PsfService } from './psf.service';

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

describeDb('post-service follow-up on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let service: PsfService;
  let reports: ReportDefinition[];
  const ids: Record<string, string> = {};
  const run = `${Date.now()}`.slice(-8);
  let sequence = 0;
  let caller: PsfActor;
  let outsider: PsfActor;
  const plates: Record<string, string> = {};

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('PSF tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    service = new (require('./psf.service').PsfService)();
    reports = require('../reports/reports.registry').REPORTS;

    ids.branch = (await db.branch.create({ data: { name: `PSF fixture ${run}` } })).id;
    ids.other = (await db.branch.create({ data: { name: `PSF fixture other ${run}` } })).id;
    const role = async (name: string) => (await db.role.upsert({ where: { name }, update: {}, create: { name } })).id;
    const user = async (name: string, branchId: string) =>
      (await db.user.create({ data: { firstName: 'Synthetic', lastName: name, email: `psf-${name.toLowerCase()}-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: await role('CCUOfficer'), branchId } })).id;
    ids.caller = await user('Caller', ids.branch);
    ids.outsider = await user('Outsider', ids.other);
    caller = { userId: ids.caller, branchId: ids.branch, allBranches: false };
    outsider = { userId: ids.outsider, branchId: ids.other, allBranches: false };
    ids.customer = (await db.customer.create({ data: { firstName: 'Ada', lastName: `Phone${run}`, phoneNumber: '+2348000000001', address: '1 Test Road', city: 'Ikeja', state: 'Lagos', branchId: ids.branch } })).id;
    ids.silent = (await db.customer.create({ data: { firstName: 'Bayo', lastName: `NoPhone${run}`, branchId: ids.branch } })).id;

    const master = async (kind: string, code: string, extra: Record<string, unknown> = {}) => (await db.workshopMaster.create({ data: { kind, code: `${code}-${run}`, description: `${kind} ${code}`, ...extra } })).id;
    const make = await master('MAKE', 'MK');
    const product = await master('PRODUCT', 'PR', { parentId: make });
    ids.model = await master('MODEL', 'MD', { parentId: product });
    ids.variant = await master('VARIANT', 'VR', { parentId: ids.model });
    ids.rr = await master('SERVICE_TYPE', 'RR', { category: 'RUNNING_REPAIR' });
    ids.ac = await master('SERVICE_TYPE', 'AC', { category: 'ACCIDENTAL' });
    ids.pdiType = await master('SERVICE_TYPE', 'PD', { preDelivery: true });
    const labour = async (code: string, flags: { followUpAnalysis?: boolean; majorLabour?: boolean }) =>
      (await db.labourItem.create({ data: { code: `${code}-${run}`, description: `Labour ${code}`, rate: 1000, ...flags } })).id;
    ids.labA = await labour('LA', { followUpAnalysis: true });
    ids.labMajor = await labour('LM', { followUpAnalysis: true, majorLabour: true });
    ids.labWash = await labour('LW', { followUpAnalysis: false });

    const vehicle = async (key: string, customerId: string) => {
      plates[key] = `P${run.slice(-4)}${key.slice(0, 3)}`.toUpperCase();
      return (await db.vehicle.create({ data: { vin: `KNAPSF${run}${++sequence}`, registrationNumber: plates[key], customerId, catalogueId: ids.variant, customModel: 'PSF model' } })).id;
    };
    const job = async (key: string, extra: Record<string, unknown> = {}, labourItems: string[] = [], customerId = ids.customer) => {
      ids[key] = (
        await db.jobCard.create({
          data: {
            jobNumber: `PSF-${run}-${key}`, description: 'Service', branchId: ids.branch, customerId, vehicleId: await vehicle(key, customerId), serviceTypeId: ids.rr,
            status: 'DELIVERED', deliveredAt: new Date('2026-01-02T15:00:00Z'), createdAt: new Date('2026-01-02T07:00:00Z'),
            labourLines: { create: labourItems.map((labourItemId) => ({ labourItemId, description: 'Work', hours: 1, rate: 1000, amount: 1000 })) },
            ...extra,
          },
        })
      ).id;
    };
    await job('sat', {}, [ids.labA, ids.labWash]);
    await job('dis', {}, [ids.labA, ids.labMajor]);
    await job('closed');
    await job('none', {}, [], ids.silent);
    await job('acc', { serviceTypeId: ids.ac });
    await job('open', { status: 'READY', deliveredAt: null });
    await job('pdi', { serviceTypeId: ids.pdiType });
    await job('cancelled', { status: 'CANCELLED' });
    await job('elsewhere', { branchId: ids.other });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const scope = (): ReportScope => ({ branchIds: [ids.branch], branch: null, timeZone: 'Africa/Lagos', permissions: [] });
  const report = (slug: string, query: Record<string, unknown> = {}) => {
    const definition = reports.find((row) => row.slug === slug)!;
    return definition.run(db, scope(), definition.query.parse({ from: '2026-01-02', to: '2026-01-02', ...query }));
  };
  const keys = (rows: ReportRow[]) => rows.map((row) => String(row.jobNumber).split('-').pop()).sort();
  const lineStatuses = (lines: { key: string }[], status: 'SATISFIED' | 'DISSATISFIED', overrides: Record<string, 'SATISFIED' | 'DISSATISFIED'> = {}) =>
    lines.map((line) => ({ key: line.key, status: overrides[line.key] ?? status }));

  it('follows up the service type and labour marked for follow-up analysis', async () => {
    const detail = await service.detail(ids.sat, caller);
    expect(detail.lines.map((line) => line.kind)).toEqual(['SERVICE', 'LABOUR']);
    expect(detail.lines[1].code).toBe(`LA-${run}`);
    expect(detail.customer?.phones).toEqual([{ label: 'Mobile', number: '+2348000000001' }]);
    expect(detail.followUp).toBeNull();
  });

  it('opens only delivered, not cancelled, non-PDI jobs of the user\'s branch', async () => {
    await expect(service.detail(ids.open, caller)).rejects.toMatchObject({ code: 'NOT_FOLLOWABLE' });
    await expect(service.detail(ids.pdi, caller)).rejects.toMatchObject({ code: 'NOT_FOLLOWABLE' });
    await expect(service.detail(ids.cancelled, caller)).rejects.toMatchObject({ code: 'NOT_FOLLOWABLE' });
    await expect(service.detail(ids.sat, outsider)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.find({ q: `psf-${run}-open` }, caller)).rejects.toMatchObject({ code: 'NOT_FOLLOWABLE' });
    expect(await service.find({ q: plates.sat.toLowerCase() }, caller)).toEqual({ id: ids.sat });
  });

  it('records calls with line statuses, keeps every attempt and books a visit', async () => {
    const sat = await service.detail(ids.sat, caller);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const saved = await service.recordCall(ids.sat, { status: 'SATISFIED', lines: lineStatuses(sat.lines, 'SATISFIED'), booking: { scheduledAt: tomorrow } }, caller);
    expect(saved.booking?.linked).toBe(false);
    expect((await db.serviceAppointment.findUnique({ where: { id: saved.booking!.id } }))?.source).toBe('PSF');
    expect((await service.detail(ids.sat, caller)).followUp).toMatchObject({ status: 'SATISFIED', remark: 'Customer satisfied', callCount: 1 });

    const dis = await service.detail(ids.dis, caller);
    const labA = dis.lines.find((line) => line.code === `LA-${run}`)!.key;
    // A satisfied call with a dissatisfied line, and a dissatisfied call without a remark, are refused.
    await expect(service.recordCall(ids.dis, { status: 'SATISFIED', lines: lineStatuses(dis.lines, 'SATISFIED', { [labA]: 'DISSATISFIED' }) }, caller)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.recordCall(ids.dis, { status: 'DISSATISFIED', lines: lineStatuses(dis.lines, 'DISSATISFIED') }, caller)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.recordCall(ids.dis, { status: 'NOT_AVAILABLE', booking: { scheduledAt: tomorrow } }, caller)).rejects.toMatchObject({ statusCode: 400 });
    await service.recordCall(ids.dis, { status: 'NOT_AVAILABLE' }, caller);
    await service.recordCall(ids.dis, { status: 'DISSATISFIED', remark: 'Noise came back', lines: lineStatuses(dis.lines, 'SATISFIED', { [labA]: 'DISSATISFIED' }) }, caller);
    const after = await service.detail(ids.dis, caller);
    expect(after.calls.map((call) => call.status)).toEqual(['DISSATISFIED', 'NOT_AVAILABLE']);
    expect(after.lines.find((line) => line.key === labA)?.status).toBe('DISSATISFIED');
    expect(after.followUp).toMatchObject({ status: 'DISSATISFIED', callCount: 2 });

    const closed = await service.detail(ids.closed, caller);
    await service.recordCall(ids.closed, { status: 'DISSATISFIED', remark: 'Late delivery', lines: lineStatuses(closed.lines, 'DISSATISFIED') }, caller);
    await expect(service.recordCall(ids.closed, { status: 'CLOSED' }, caller)).rejects.toMatchObject({ statusCode: 400 });
    await service.recordCall(ids.closed, { status: 'CLOSED', remark: 'Service manager apologised' }, caller);
    await expect(service.recordCall(ids.closed, { status: 'SATISFIED', lines: [] }, caller)).rejects.toMatchObject({ code: 'PSF_CLOSED' });
    expect((await service.detail(ids.closed, caller)).blockedReason).toMatch(/closed/);
    await expect(service.recordCall(ids.sat, { status: 'NO_PHONE' }, outsider)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lists the worklist tabs with counts', async () => {
    const list = await service.list({ dateFrom: '2026-01-02', dateTo: '2026-01-02', state: 'toCall', page: 1, limit: 25 }, caller);
    expect(list.counts).toEqual({ all: 5, toCall: 2, dissatisfied: 1, satisfied: 1, closed: 1 });
    expect(list.items.map((item) => item.jobNumber.split('-').pop()).sort()).toEqual(['acc', 'none']);
  });

  it('analyses statuses, labour-wise and model-wise with the same totals', async () => {
    const analysis = await report('psf-analysis');
    expect(analysis.totals).toMatchObject({ delivered: 5, followedUp: 3, satisfied: 1, dissatisfied: 1, closed: 1, notFollowed: 2, contacted: 2, satisfactionPct: 50 });
    expect(analysis.sections?.[0].rows.length).toBeGreaterThan(0);
    expect((await report('psf-analysis', { labourWise: 'false' })).sections).toEqual([]);
    const byModel = await report('psf-analysis-model');
    expect(byModel.totals).toMatchObject({ delivered: 5, followedUp: 3, satisfactionPct: 50 });
    expect(byModel.rows).toHaveLength(1);
  });

  it('builds the follow-up list from the basis, accidental and not-contacted choices', async () => {
    expect(keys((await report('psf-followup-list')).rows)).toEqual(['closed', 'dis', 'none', 'sat']);
    expect(keys((await report('psf-followup-list', { includeAccidental: 'true' })).rows)).toEqual(['acc', 'closed', 'dis', 'none', 'sat']);
    const major = await report('psf-followup-list', { basis: 'MAJOR' });
    expect(keys(major.rows)).toEqual(['dis']);
    expect((major.rows[0].labour as { code: string }[]).map((line) => line.code)).toEqual([`LM-${run}`]);
    expect(keys((await report('psf-followup-list', { flaggedOnly: 'true' })).rows)).toEqual(['dis', 'sat']);
    expect(keys((await report('psf-followup-list', { notContacted: 'ONLY' })).rows)).toEqual(['none']);
    expect(keys((await report('psf-followup-list', { notContacted: 'EXCLUDE' })).rows)).toEqual(['closed', 'dis', 'sat']);
  });

  it('lists dissatisfied and closed follow-ups, and the vehicle history', async () => {
    const dissatisfied = await report('psf-dissatisfied');
    expect(keys(dissatisfied.rows)).toEqual(['dis']);
    expect((dissatisfied.rows[0].dissatisfiedLines as { code: string }[]).map((line) => line.code)).toEqual([`LA-${run}`]);
    const closed = await report('psf-closed');
    expect(keys(closed.rows)).toEqual(['closed']);
    expect(closed.rows[0]).toMatchObject({ previousStatus: 'DISSATISFIED', closedBy: 'Synthetic Caller', remark: 'Service manager apologised' });
    const history = await report('psf-history', { registration: plates.dis.toLowerCase() });
    expect(history.rows.map((row) => [row.attempt, row.callStatus])).toEqual([[1, 'NOT_AVAILABLE'], [2, 'DISSATISFIED']]);
    const never = await report('psf-history', { registration: plates.none });
    expect(never.rows.map((row) => row.callStatusLabel)).toEqual(['Not followed up']);
  });

  it('writes one letter per customer for the chosen groups and counts those without an address', async () => {
    const letter = await report('psf-letter');
    expect(letter.rows.map((row) => [row.customerId, row.groups, row.mailable])).toEqual([
      [ids.customer, ['NOT_FOLLOWED_UP'], true],
      [ids.silent, ['NO_PHONE', 'NOT_FOLLOWED_UP'], false],
    ]);
    expect(letter.totals).toEqual({ count: 2, mailable: 1, noAddress: 1 });
    expect((await report('psf-letter', { noPhone: 'false', notFollowedUp: 'false' })).rows).toHaveLength(0);

    const mailing = reports.find((row) => row.slug === 'psf-mailing-list')!;
    const list = await mailing.run(db, scope(), mailing.query.parse({}));
    expect(list.rows.map((row) => row.id)).toEqual([ids.customer]);
    expect(list.totals).toEqual({ count: 1, noAddress: 1 });
    expect((await mailing.run(db, scope(), mailing.query.parse({ city: 'ikeja' }))).rows).toHaveLength(1);
    expect((await mailing.run(db, scope(), mailing.query.parse({ city: 'Abuja' }))).rows).toHaveLength(0);
  });
});
