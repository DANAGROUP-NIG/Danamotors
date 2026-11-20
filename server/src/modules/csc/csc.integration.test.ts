import type { PrismaClient } from '@prisma/client';
import type { JobCardWorkflowService } from '../service/job-card-workflow.service';
import type { ReportDefinition, ReportScope } from '../reports/core/types';
import type { CscActor, CscService } from './csc.service';

jest.mock('../notification/notification.service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({ notifyRole: jest.fn().mockResolvedValue(undefined), notifyUsers: jest.fn().mockResolvedValue(undefined), createNotification: jest.fn().mockResolvedValue(undefined) })),
  NOTIFICATION_TYPES: {},
}));

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

const DAY = 86_400_000;

describeDb('CSC on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let csc: CscService;
  let workflow: JobCardWorkflowService;
  let reports: ReportDefinition[];
  let generate: typeof import('./csc.generate').generateCases;
  let dates: typeof import('../reports/core/dates');
  const ids: Record<string, string> = {};
  const reason: Record<string, string> = {};
  const run = `${Date.now()}`.slice(-8);
  let sequence = 0;
  let officer: CscActor;
  let outsider: CscActor;
  let today: string;

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('CSC tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    csc = new (require('./csc.service').CscService)();
    workflow = new (require('../service/job-card-workflow.service').JobCardWorkflowService)();
    reports = require('../reports/reports.registry').REPORTS;
    generate = require('./csc.generate').generateCases;
    dates = require('../reports/core/dates');
    today = dates.localToday();

    ids.branch = (await db.branch.create({ data: { name: `CSC fixture ${run}` } })).id;
    ids.other = (await db.branch.create({ data: { name: `CSC other ${run}` } })).id;
    await db.branchSettings.create({ data: { branchId: ids.branch } });
    const role = async (name: string) => (await db.role.upsert({ where: { name }, update: {}, create: { name } })).id;
    const user = async (name: string, roleName: string, branchId = ids.branch) =>
      (await db.user.create({ data: { firstName: 'Synthetic', lastName: name, email: `csc-${name.toLowerCase()}-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: await role(roleName), branchId } })).id;
    ids.officer = await user('Officer', 'CCUOfficer');
    ids.advisor = await user('Advisor', 'ServiceAdviser');
    ids.outsider = await user('Outsider', 'CCUOfficer', ids.other);
    officer = { userId: ids.officer, branchId: ids.branch, allBranches: false, canFollowUp: true };
    outsider = { userId: ids.outsider, branchId: ids.other, allBranches: false, canFollowUp: true };
    ids.customer = (await db.customer.create({ data: { firstName: 'Csc', lastName: 'Customer', phoneNumber: '+2348000000000', branchId: ids.branch } })).id;

    const master = async (kind: string, code: string, extra: Record<string, unknown> = {}) => (await db.workshopMaster.create({ data: { kind, code: `${code}-${run}`, description: `${kind} ${code}`, ...extra } })).id;
    const make = await master('MAKE', 'MK');
    const product = await master('PRODUCT', 'PR', { parentId: make });
    ids.model = await master('MODEL', 'MD', { parentId: product });
    ids.variant = await master('VARIANT', 'VR', { parentId: ids.model });
    ids.team = await master('TEAM', 'TM');
    ids.bay = await master('BAY', 'BY');
    ids['1F'] = await master('SERVICE_TYPE', '1F', { category: 'FREE' });
    ids['2F'] = await master('SERVICE_TYPE', '2F', { category: 'FREE' });
    ids.RG = await master('SERVICE_TYPE', 'RG', { category: 'PAID' });
    ids.RR = await master('SERVICE_TYPE', 'RR', { category: 'RUNNING_REPAIR' });
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId: ids.RR, modelId: ids.model, serviceCharge: 0 } });
    for (const row of await db.cscCloseReason.findMany({ select: { id: true, code: true } })) reason[row.code] = row.id;
    if (!reason.R0001 || !reason.R0004) throw new Error('Run the CSC migration first (closure reasons R0001–R0008)');
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const vehicle = async (soldDaysAgo: number | null) =>
    (await db.vehicle.create({ data: { vin: `KNACSC${run}${++sequence}`, customerId: ids.customer, catalogueId: ids.variant, customModel: 'CSC model', saleDate: soldDaysAgo === null ? null : new Date(Date.now() - soldDaysAgo * DAY) } })).id;
  const pastJob = (vehicleId: string, daysAgo: number, service: string, mileage: number) =>
    db.jobCard.create({
      data: {
        jobNumber: `CSC-${run}-${++sequence}`, description: `${service} service`, branchId: ids.branch, vehicleId, customerId: ids.customer, serviceTypeId: ids[service],
        mileage, status: 'DELIVERED', billedAt: new Date(Date.now() - daysAgo * DAY + 3600_000), createdAt: new Date(Date.now() - daysAgo * DAY),
      },
    });
  const LEGACY: Record<string, { dueDays: number; dueKm: number; rotationDays: number; rotationKm: number; variationDays: number }> = {
    '1F': { dueDays: 30, dueKm: 1000, rotationDays: 30, rotationKm: 1000, variationDays: 15 },
    '2F': { dueDays: 90, dueKm: 5000, rotationDays: 90, rotationKm: 5000, variationDays: 45 },
    RG: { dueDays: 270, dueKm: 15000, rotationDays: 90, rotationKm: 5000, variationDays: 45 },
  };
  const service = (code: string) => ({ serviceTypeId: ids[code], ...LEGACY[code], followUp1Days: 15, followUp2Days: 5, variationKm: 500, active: true });
  const runGenerate = (extra: Record<string, unknown> = {}) => generate({ branchId: ids.branch, from: today, to: dates.addDays(today, 30), modelIds: [ids.model], actorId: ids.officer, ...extra });
  const caseOf = (vehicleId: string) => db.cscCase.findFirstOrThrow({ where: { vehicleId }, include: { serviceType: { select: { id: true } } } });
  const scope = (): ReportScope => ({ branchIds: [ids.branch], branch: null, timeZone: 'Africa/Lagos', permissions: [] });
  const report = (slug: string, query: Record<string, unknown>) => {
    const definition = reports.find((row) => row.slug === slug)!;
    return definition.run(db, scope(), definition.query.parse(query));
  };

  const vehicles: Record<string, string> = {};

  it('saves a schedule version per model and lists it; a later version keeps the earlier one', async () => {
    const body = { modelIds: [ids.model], notVisitedMonths: 48, matchDaysBefore: 10, matchDaysAfter: 10, services: [service('1F'), service('2F'), service('RG')] };
    await csc.saveRules({ ...body, effectiveDate: '2010-09-13' }, ids.officer);
    await csc.saveRules({ ...body, effectiveDate: '2099-01-01', services: [{ ...service('1F'), dueDays: 45 }] }, ids.officer);
    const saved = await csc.rulesForModel(ids.model);
    expect(saved.versions.map((version) => [version.effectiveDate, version.services.length])).toEqual([['2099-01-01', 1], ['2010-09-13', 3]]);
    await expect(csc.saveRules({ ...body, effectiveDate: '2011-01-01', services: [{ ...service('1F'), followUp1Days: 2, followUp2Days: 5 }] }, ids.officer)).rejects.toThrow(/1st follow-up/);
  });

  it('generates one case per vehicle due, idempotently, and counts what it left out', async () => {
    vehicles.new = await vehicle(25); // 1F due in 5 days
    vehicles.second = await vehicle(80); // 1F done → 2F due in 10 days
    await pastJob(vehicles.second, 52, '1F', 950);
    vehicles.rg = await vehicle(1000); // RG 82 days ago → due in 8 days
    await pastJob(vehicles.rg, 82, 'RG', 25000);
    vehicles.noStart = await vehicle(null);
    vehicles.early = await vehicle(1000); // RG due in 5 days, running repair 3 days ago
    await pastJob(vehicles.early, 85, 'RG', 27000);
    await pastJob(vehicles.early, 3, 'RR', 31000);

    const first = await runGenerate();
    expect(first).toMatchObject({ due: 4, created: 4, alreadyVisited: 1, skipped: { noStartDate: 1 } });
    expect(await runGenerate()).toMatchObject({ due: 4, created: 0, alreadyGenerated: 4 });

    const newCase = await caseOf(vehicles.new);
    expect(newCase).toMatchObject({ serviceTypeId: ids['1F'], dueMileage: 1000, status: 'OPEN' });
    expect(newCase.dueDate.toISOString().slice(0, 10)).toBe(dates.addDays(dates.localDateOf(new Date(Date.now() - 25 * DAY)), 30));
    expect((await caseOf(vehicles.second)).serviceTypeId).toBe(ids['2F']);
    expect(await caseOf(vehicles.rg)).toMatchObject({ serviceTypeId: ids.RG, dueMileage: 30000 });
    expect((await caseOf(vehicles.early)).status).toBe('VISITED');
  });

  it('a service filter and another branch generate nothing more', async () => {
    expect(await runGenerate({ serviceTypeIds: [ids['2F']] })).toMatchObject({ due: 1, created: 0 });
    expect(await runGenerate({ branchId: ids.other })).toMatchObject({ vehiclesChecked: 0, due: 0 });
  });

  it('lists the 1st follow-up due, saves contacts and moves the case to done', async () => {
    const range = { stage: 'FIRST' as const, from: dates.addDays(today, -30), to: dates.addDays(today, 30), includeFirstNotDone: false, onlyFollowedUp: false, page: 1, limit: 25, modelId: [ids.model] };
    const before = await csc.list({ ...range, state: 'DUE' }, officer);
    expect(before.items.map((item) => item.vehicle.id).sort()).toEqual([vehicles.new, vehicles.second, vehicles.rg].sort());
    const target = await caseOf(vehicles.rg);
    await csc.saveFollowUp(target.id, { stage: 'FIRST', contacts: [{ slot: 1, contactDate: today, contactPerson: 'Owner', remarks: 'No answer', doneById: ids.officer }], booking: null, closure: { reasonId: reason.R0001, remarks: 'Travelling' } }, officer);
    const after = await csc.list({ ...range, state: 'DUE' }, officer);
    expect(after.stateCounts).toEqual({ DUE: 2, DONE: 1, BOTH: 4 });
    expect((await db.cscCase.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('OPEN');
    // Partial closure: the case now waits in the 2nd follow-up list.
    const second = await csc.list({ ...range, stage: 'SECOND', state: 'DUE' }, officer);
    expect(second.items.map((item) => item.id)).toEqual([target.id]);
    await expect(csc.saveFollowUp(target.id, { stage: 'FIRST', contacts: [{ slot: 1, contactDate: dates.addDays(today, 1), contactPerson: null, remarks: 'x' }] }, officer)).rejects.toThrow(/future/);
  });

  it('books the vehicle in through a CSC booking and refuses a second booking', async () => {
    const target = await caseOf(vehicles.second);
    const scheduledAt = new Date(Date.now() + 3 * DAY).toISOString();
    const saved = await csc.saveFollowUp(target.id, { stage: 'FIRST', contacts: [{ slot: 1, contactDate: today, contactPerson: 'Owner', remarks: 'Coming on Monday' }], booking: { scheduledAt, notes: null } }, officer);
    expect(saved.booking).toMatchObject({ linked: false });
    const booking = await db.serviceAppointment.findUniqueOrThrow({ where: { id: saved.booking!.id }, include: { requests: true } });
    expect(booking).toMatchObject({ source: 'CSC', vehicleId: vehicles.second, branchId: ids.branch, serviceTypeId: ids['2F'] });
    expect(booking.requests[0].description).toMatch(/CSC follow-up/);
    await expect(csc.saveFollowUp(target.id, { stage: 'SECOND', contacts: [], booking: { scheduledAt, notes: null } }, officer)).rejects.toThrow(/already booked/);
  });

  it('a final reason closes the case; closed cases take no more entries and show in the no-show analysis', async () => {
    const target = await caseOf(vehicles.new);
    await expect(csc.saveFollowUp(target.id, { stage: 'FIRST', contacts: [], closure: { reasonId: reason.R0004, remarks: null }, booking: { scheduledAt: new Date(Date.now() + DAY).toISOString(), notes: null } }, officer)).rejects.toThrow(/cannot also be booked/);
    const saved = await csc.saveFollowUp(target.id, { stage: 'FIRST', contacts: [], closure: { reasonId: reason.R0004, remarks: 'Sold' } }, officer);
    expect(saved.status).toBe('CLOSED');
    await expect(csc.saveFollowUp(target.id, { stage: 'SECOND', contacts: [] }, officer)).rejects.toThrow(/closed/);
    const noShow = await report('csc-no-show', { from: dates.addDays(today, -30), to: dates.addDays(today, 30), model: ids.model, by: 'service' });
    expect(noShow.totals).toMatchObject({ count: 1, reason_R0004: 1 });
    await expect(csc.deleteReason(reason.R0004, ids.officer)).rejects.toThrow(/cannot be deleted/);
  });

  it('opening a job card marks the open case visited and links the job; cancelling it re-opens the case', async () => {
    const target = await caseOf(vehicles.rg);
    const card = await workflow.open({
      branchName: `CSC fixture ${run}`, vehicleId: vehicles.rg, customerId: ids.customer, serviceTypeId: ids.RR, mileage: 29000, serviceAdvisorId: ids.advisor,
      teamId: ids.team, bayId: ids.bay, promisedAt: new Date(Date.now() + 2 * DAY).toISOString(), description: 'Service', complaints: [{ description: 'Service' }], createdById: ids.advisor,
    });
    expect(await db.cscCase.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ status: 'VISITED', visitJobCardId: card.id });
    await db.jobCard.update({ where: { id: card.id }, data: { status: 'CANCELLED' } });
    await csc.list({ stage: 'FIRST', state: 'BOTH', from: dates.addDays(today, -30), to: dates.addDays(today, 30), includeFirstNotDone: false, onlyFollowedUp: false, page: 1, limit: 25 }, officer);
    expect(await db.cscCase.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ status: 'OPEN', visitJobCardId: null });
  });

  it('keeps cases to their branch', async () => {
    const target = await caseOf(vehicles.second);
    await expect(csc.detail(target.id, outsider)).rejects.toThrow(/your branch/);
    await expect(csc.list({ stage: 'FIRST', state: 'BOTH', from: today, to: today, branchId: ids.branch, includeFirstNotDone: false, onlyFollowedUp: false, page: 1, limit: 25 }, outsider)).rejects.toThrow(/your branch/);
    expect((await csc.detail(target.id, officer)).customer?.phoneNumber).toBe('+2348000000000');
  });

  it('the follow-up report counts generated, contacted, booked, visited and closed', async () => {
    const months = [...new Set([today, dates.addDays(today, 30)].map((day) => day.slice(0, 7)))];
    const totals = { count: 0, contacted: 0, booked: 0, visited: 0, closed: 0 };
    for (const month of months) {
      const result = await report('csc-followup', { month, model: ids.model });
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += result.totals[key] ?? 0;
    }
    expect(totals).toEqual({ count: 4, contacted: 2, booked: 1, visited: 1, closed: 1 });
  });
});
