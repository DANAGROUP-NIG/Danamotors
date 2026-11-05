/**
 * Bulk model labour rate maintenance against a real PostgreSQL database: filters, preview and the
 * "expected" guard, % change with rounding, apply-to-models, copy-model, and the change log rows.
 * Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest labourRateBulk.integration
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb('Labour rate bulk maintenance (database)', () => {
  let prisma: typeof import('../../prisma/client').default;
  let bulk: typeof import('./labourRateBulk');
  let runAsUser: <T>(userId: string | undefined, fn: () => T) => T;
  const run = `${Date.now()}`.slice(-7);
  let actorId: string;
  const models: string[] = [];
  const labours: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require('../../prisma/client').default;
    bulk = require('./labourRateBulk');
    runAsUser = require('../../shared/requestContext').runAsUser;
    actorId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
    for (const n of [1, 2, 3]) {
      const m = await prisma.workshopMaster.create({ data: { kind: 'MODEL', code: `LR${run}M${n}`, description: `LR${run} Model ${n}` } });
      models.push(m.id);
    }
    for (const n of [1, 2]) {
      const l = await prisma.labourItem.create({
        data: { code: `LR${run}L${n}`, description: `LR${run} Labour ${n}`, rate: 1000, vehicleSystem: `SYS${run}`, group: n === 1 ? `GRP${run}A` : `GRP${run}B` },
      });
      labours.push(l.id);
    }
    // Models 1 and 2 have both labours; model 3 has none.
    for (const modelId of models.slice(0, 2))
      for (const labourItemId of labours)
        await prisma.labourRate.create({ data: { modelId, labourItemId, pricing: 'TIME', hours: 1.5, rate: 1000 } });
  });

  afterAll(async () => {
    await prisma.labourRate.deleteMany({ where: { modelId: { in: models } } });
    await prisma.labourItem.deleteMany({ where: { id: { in: labours } } });
    await prisma.workshopMaster.deleteMany({ where: { id: { in: models } } });
    await prisma.$disconnect();
  });

  const mine = { modelIds: () => models };
  const rates = () => prisma.labourRate.findMany({ where: { modelId: { in: models } }, orderBy: [{ modelId: 'asc' }, { labourItemId: 'asc' }] });

  it('lists the grid with filters and totals', async () => {
    const page = await bulk.listRates({ modelIds: mine.modelIds(), group: `GRP${run}A`, page: 1, limit: 100 });
    expect(page.meta.total).toBe(2);
    expect(page.rates.every((r) => r.labourCode === `LR${run}L1`)).toBe(true);
    const search = await bulk.listRates({ search: `LR${run} Model 2`, page: 1, limit: 100 });
    expect(search.meta.total).toBe(2);
  });

  it('previews a % change, refuses a stale count, then applies it with rounding', async () => {
    const input = { scope: { filter: { modelIds: mine.modelIds(), vehicleSystem: `SYS${run}` } }, action: { type: 'CHANGE_PERCENT' as const, percent: 7.5, roundTo: 50 as const } };
    const preview = await bulk.bulkUpdateRates(actorId, { ...input, dryRun: true });
    expect(preview).toMatchObject({ matched: 4, changing: 4, applied: false });
    expect(preview.sample[0]).toMatchObject({ old: 1000, new: 1100 }); // 1075 rounded to 50
    expect((await rates()).every((r) => r.rate === 1000)).toBe(true);

    await expect(bulk.bulkUpdateRates(actorId, input)).rejects.toThrow('Preview the change first');
    await expect(bulk.bulkUpdateRates(actorId, { ...input, expected: 3 })).rejects.toThrow('changed since the preview');

    const applied = await runAsUser(actorId, () => bulk.bulkUpdateRates(actorId, { ...input, expected: 4 }));
    expect(applied).toMatchObject({ changing: 4, applied: true });
    expect((await rates()).map((r) => r.rate)).toEqual([1100, 1100, 1100, 1100]);

    const log = await prisma.changeLog.findMany({ where: { entity: 'LabourRate', recordId: { in: (await rates()).map((r) => r.id) }, action: 'UPDATE' } });
    expect(log).toHaveLength(4);
    expect(log.every((r) => r.userId === actorId)).toBe(true);
    const event = await prisma.auditLog.findFirstOrThrow({ where: { action: 'LABOUR_RATE_BULK_UPDATE', userId: actorId }, orderBy: { createdAt: 'desc' } });
    expect(JSON.parse(event.details!)).toMatchObject({ rows: 4, matched: 4 });
  });

  it('only counts and writes rows that change', async () => {
    const [first] = await rates();
    const input = { scope: { ids: [first.id] }, action: { type: 'SET_HOURS' as const, hours: 1.5 } };
    expect(await bulk.bulkUpdateRates(actorId, { ...input, dryRun: true })).toMatchObject({ matched: 1, changing: 0 });
    const deactivate = { scope: { filter: { modelIds: [models[1]] } }, action: { type: 'SET_ACTIVE' as const, active: false } };
    const result = await bulk.bulkUpdateRates(actorId, { ...deactivate, expected: 2 });
    expect(result).toMatchObject({ changing: 2, applied: true });
    expect((await prisma.labourRate.findMany({ where: { modelId: models[1] } })).every((r) => !r.active)).toBe(true);
  });

  it('adds a labour to the chosen models, keeping or overwriting existing rates', async () => {
    const base = { labourItemId: labours[0], modelIds: models, pricing: 'FIXED' as const, hours: 2, rate: 5000, active: true };
    const keep = await bulk.applyLabourToModels(actorId, { ...base, overwrite: false, dryRun: true });
    expect(keep).toMatchObject({ models: 3, create: 1, update: 0, keep: 2 });
    await bulk.applyLabourToModels(actorId, { ...base, overwrite: false, expected: 1 });
    const created = await prisma.labourRate.findUniqueOrThrow({ where: { labourItemId_modelId: { labourItemId: labours[0], modelId: models[2] } } });
    expect(created).toMatchObject({ pricing: 'FIXED', hours: 2, rate: 5000, active: true });

    const overwrite = await bulk.applyLabourToModels(actorId, { ...base, overwrite: true, dryRun: true });
    expect(overwrite).toMatchObject({ create: 0, update: 2, keep: 1 });
    await bulk.applyLabourToModels(actorId, { ...base, overwrite: true, expected: 2 });
    expect((await prisma.labourRate.findMany({ where: { labourItemId: labours[0], modelId: { in: models } } })).every((r) => r.rate === 5000)).toBe(true);
  });

  it('copies a model\'s rates to another model with a % change', async () => {
    const input = { fromModelId: models[0], toModelIds: [models[2]], overwrite: false, percent: 10, roundTo: 1 as const };
    const preview = await bulk.copyModelRates(actorId, { ...input, dryRun: true });
    // Model 1 has labour 1 (5000) and labour 2 (1100); model 3 already has labour 1.
    expect(preview).toMatchObject({ sourceRates: 2, create: 1, update: 0, keep: 1 });
    await bulk.copyModelRates(actorId, { ...input, expected: 1 });
    const copied = await prisma.labourRate.findUniqueOrThrow({ where: { labourItemId_modelId: { labourItemId: labours[1], modelId: models[2] } } });
    expect(copied.rate).toBe(1210);
    await expect(bulk.copyModelRates(actorId, { ...input, toModelIds: [models[0]], dryRun: true })).rejects.toThrow('other than the source');
  });
});
