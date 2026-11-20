import type { PrismaClient } from '@prisma/client';
import type { JobCardWorkflowService } from '../service/job-card-workflow.service';
import type { RepeatActor, RepeatJobService } from './repeat-job.service';
import type { ReportDefinition, ReportScope } from '../reports/core/types';

jest.mock('../notification/notification.service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({ notifyRole: jest.fn().mockResolvedValue(undefined), notifyUsers: jest.fn().mockResolvedValue(undefined), createNotification: jest.fn().mockResolvedValue(undefined) })),
  NOTIFICATION_TYPES: {},
}));

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

const DAY = 86_400_000;

describeDb('repeat jobs on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let repeats: RepeatJobService;
  let reports: ReportDefinition[];
  const ids: Record<string, string> = {};
  const reason: Record<string, string> = {};
  const run = `${Date.now()}`.slice(-8);
  let sequence = 0;
  let manager: RepeatActor;
  let otherManager: RepeatActor;
  let admin: RepeatActor;

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('Repeat job tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    workflow = new (require('../service/job-card-workflow.service').JobCardWorkflowService)();
    repeats = new (require('./repeat-job.service').RepeatJobService)();
    reports = require('../reports/reports.registry').REPORTS;

    ids.branch = (await db.branch.create({ data: { name: `Repeat fixture ${run}` } })).id;
    await db.branchSettings.create({ data: { branchId: ids.branch, repeatWindowDays: 15, repeatWindowKm: 500 } });
    const role = async (name: string) => (await db.role.upsert({ where: { name }, update: {}, create: { name } })).id;
    const user = async (name: string, roleName: string) =>
      (await db.user.create({ data: { firstName: 'Synthetic', lastName: name, email: `repeat-${name.toLowerCase()}-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: await role(roleName), branchId: ids.branch } })).id;
    ids.advisor = await user('Advisor', 'ServiceAdviser');
    ids.engineer = await user('Engineer', 'Engineer');
    ids.technician = await user('Technician', 'Technician');
    ids.manager = await user('Manager', 'WorkshopManager');
    ids.manager2 = await user('ManagerTwo', 'WorkshopManager');
    ids.admin = await user('Admin', 'Admin');
    const actor = (userId: string, roleName: string): RepeatActor => ({ userId, role: roleName, branchId: ids.branch, allBranches: false, canReview: true });
    manager = actor(ids.manager, 'WorkshopManager');
    otherManager = actor(ids.manager2, 'WorkshopManager');
    admin = actor(ids.admin, 'Admin');
    ids.customer = (await db.customer.create({ data: { firstName: 'Repeat', lastName: 'Customer', branchId: ids.branch } })).id;

    const master = async (kind: string, code: string, extra: Record<string, unknown> = {}) => (await db.workshopMaster.create({ data: { kind, code: `${code}-${run}`, description: `${kind} ${code}`, ...extra } })).id;
    const make = await master('MAKE', 'MK');
    const product = await master('PRODUCT', 'PR', { parentId: make });
    ids.model = await master('MODEL', 'MD', { parentId: product });
    ids.variant = await master('VARIANT', 'VR', { parentId: ids.model });
    ids.team = await master('TEAM', 'TM');
    ids.bay = await master('BAY', 'BY');
    ids.paidType = await master('SERVICE_TYPE', 'RR', { category: 'RUNNING_REPAIR' });
    ids.pdiType = await master('SERVICE_TYPE', 'PD', { preDelivery: true, category: 'PDI' });
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId: ids.paidType, modelId: ids.model, serviceCharge: 0 } });
    for (const row of await db.workshopMaster.findMany({ where: { kind: 'REPEAT_REASON' }, select: { id: true, code: true } })) reason[row.code] = row.id;
    if (!reason['0'] || !reason['4']) throw new Error('Run the repeat job migration first (REPEAT_REASON codes 0–6)');
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const vehicle = async () => (await db.vehicle.create({ data: { vin: `KNAREPT${run}${++sequence}`, customerId: ids.customer, catalogueId: ids.variant, customModel: 'Repeat model' } })).id;

  /** A finished job written directly (billing itself is covered by the billing tests). */
  const pastJob = (vehicleId: string, daysAgo: number, mileage: number, extra: Record<string, unknown> = {}) =>
    db.jobCard.create({
      data: {
        jobNumber: `RPT-${run}-${++sequence}`, description: 'Air conditioning not cooling', branchId: ids.branch, vehicleId, customerId: ids.customer, serviceTypeId: ids.paidType,
        mileage, status: 'DELIVERED', billedAt: new Date(Date.now() - daysAgo * DAY + 3600_000), createdAt: new Date(Date.now() - daysAgo * DAY),
        engineerId: ids.engineer, serviceAdvisorId: ids.advisor, technicianId: ids.technician, workDone: 'Recharged AC gas', ...extra,
      },
    });

  const open = (vehicleId: string, mileage: number, extra: Record<string, unknown> = {}) =>
    workflow.open({
      branchName: `Repeat fixture ${run}`, vehicleId, customerId: ids.customer, serviceTypeId: ids.paidType, mileage, serviceAdvisorId: ids.advisor, engineerId: ids.engineer,
      teamId: ids.team, bayId: ids.bay, promisedAt: new Date(Date.now() + 2 * DAY).toISOString(), description: 'AC not cooling again', complaints: [{ description: 'AC not cooling again' }],
      createdById: ids.advisor, ...extra,
    });

  const scope = (): ReportScope => ({ branchIds: [ids.branch], branch: null, timeZone: 'Africa/Lagos', permissions: [] });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
  const report = (slug: string, query: Record<string, unknown>) => {
    const definition = reports.find((row) => row.slug === slug)!;
    return definition.run(db, scope(), definition.query.parse({ from: today, to: today, ...query }));
  };

  let flaggedId: string;
  let manualId: string;

  it('flags a job within the km window of the last billed job automatically and stores the window', async () => {
    const vehicleId = await vehicle();
    const previous = await pastJob(vehicleId, 40, 30000);
    const card = await open(vehicleId, 30300);
    expect(card).toMatchObject({ isRepeat: true, previousJobId: previous.id });
    const record = await db.repeatJob.findUniqueOrThrow({ where: { jobCardId: card.id } });
    expect(record).toMatchObject({ source: 'AUTOMATIC', status: 'PENDING_REVIEW', daysDifference: 40, kmDifference: 300, windowDays: 15, windowKm: 500, previousEngineerId: ids.engineer, previousServiceAdvisorId: ids.advisor });
    expect(record.previousTechnicianIds).toEqual([ids.technician]);
    flaggedId = record.id;
  });

  it('never compares with an open, cancelled or PDI job', async () => {
    const openPrevious = await vehicle();
    await pastJob(openPrevious, 3, 1000, { status: 'IN_PROGRESS', billedAt: null });
    expect((await open(openPrevious, 1100)).isRepeat).toBe(false);

    const cancelled = await vehicle();
    await pastJob(cancelled, 3, 1000, { status: 'CANCELLED' });
    expect((await open(cancelled, 1100)).isRepeat).toBe(false);

    const pdi = await vehicle();
    await pastJob(pdi, 3, 10, { jobType: 'PDI', serviceTypeId: ids.pdiType });
    expect((await open(pdi, 120)).isRepeat).toBe(false);
  });

  it('records a job picked by hand outside the window as manual, with the opening note', async () => {
    const vehicleId = await vehicle();
    const previous = await pastJob(vehicleId, 200, 10000);
    const card = await open(vehicleId, 30000, { isRepeat: true, previousJobId: previous.id, repeatReason: 'Customer says the same rattle is back' });
    const record = await db.repeatJob.findUniqueOrThrow({ where: { jobCardId: card.id } });
    expect(record).toMatchObject({ source: 'MANUAL', kmDifference: 20000, openingNote: 'Customer says the same rattle is back' });
    manualId = record.id;
  });

  it('confirms a review with two reasons; the list and the analysis count it', async () => {
    await repeats.review(flaggedId, { reasonIds: [reason['1'], reason['4']], remarks: 'Compressor clutch not replaced; no road test' }, manager);
    const detail = await repeats.detail(flaggedId, manager);
    expect(detail).toMatchObject({ status: 'CONFIRMED', reviewedBy: { id: ids.manager }, reasons: [{ code: '1' }, { code: '4' }] });

    const list = await report('repeat-list', {});
    expect(list.rows.find((row) => row.repeatId === flaggedId)).toMatchObject({ reviewStatus: 'CONFIRMED', previousEngineer: 'Synthetic Engineer' });

    const analysis = await report('repeat-analysis', { by: 'engineer' });
    const group = analysis.groups.find((row) => row.key === ids.engineer)!;
    expect(group.totals).toMatchObject({ confirmed: 1, reason_1: 1, reason_4: 1 });
    expect(group.totals.repeats).toBeGreaterThanOrEqual(2);
  });

  it('takes a "not a repeat" job out of the counts and lists it only with the option', async () => {
    await repeats.review(manualId, { reasonIds: [reason['0']], remarks: 'Different noise: scheduled service' }, manager);
    const record = await db.repeatJob.findUniqueOrThrow({ where: { id: manualId }, include: { jobCard: true } });
    expect(record.status).toBe('NOT_REPEAT');
    expect(record.jobCard.isRepeat).toBe(false);

    expect((await report('repeat-list', {})).rows.some((row) => row.repeatId === manualId)).toBe(false);
    expect((await report('repeat-list', { includeNotRepeat: 'true' })).rows.some((row) => row.repeatId === manualId)).toBe(true);
    const only = await report('repeat-list', { onlyNotRepeat: 'true' });
    expect(only.rows.map((row) => row.repeatId)).toEqual([manualId]);

    const summary = await report('repeat-summary', {});
    expect(summary.rows).toEqual([expect.objectContaining({ day: today, repeats: 1, confirmed: 1, notRepeat: 1 })]);
    expect(summary.totals.jobs).toBeGreaterThanOrEqual(5);
  });

  it('lets only the reviewer or an Admin change a reviewed record, and audits each review', async () => {
    await expect(repeats.review(flaggedId, { reasonIds: [reason['4']], remarks: 'x' }, otherManager)).rejects.toThrow('reviewer or an Admin');
    await repeats.review(flaggedId, { reasonIds: [reason['4']], remarks: 'Workmanship only' }, admin);
    await expect(repeats.review(flaggedId, { reasonIds: [reason['0'], reason['4']], remarks: 'x' }, admin)).rejects.toThrow('cannot be combined');
    const audits = await db.auditLog.findMany({ where: { action: 'REPEAT_JOB_REVIEWED', details: { contains: flaggedId } } });
    expect(audits).toHaveLength(2);
  });
});
