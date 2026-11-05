import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';

/**
 * Bulk maintenance of model labour rates (gap analysis §6), replacing legacy's "Labour Rate Update Utility"
 * XLS import. Every change is set-based SQL in one transaction: the change log trigger on LabourRate records
 * each changed row, and one AuditLog event records the whole change. Every write can run as a dry run first
 * (`dryRun: true`) and, when applied, must state the count it previewed (`expected`), so a change made by
 * someone else in between is refused instead of silently widening the edit.
 *
 * `rate` is the hourly rate for TIME pricing and the fixed amount for FIXED pricing.
 */

const uuid = z.string().uuid();
const pricing = z.enum(['TIME', 'FIXED']);
/** Rounding for "change by %": to the kobo, or to a round naira amount as legacy rates are. */
const roundTo = z.union([z.literal(0.01), z.literal(1), z.literal(5), z.literal(10), z.literal(50), z.literal(100)]).default(0.01);

export const rateFilterSchema = z.object({
  modelIds: z.array(uuid).max(500).optional(),
  labourItemIds: z.array(uuid).max(1000).optional(),
  vehicleSystem: z.string().trim().max(100).optional(),
  group: z.string().trim().max(100).optional(),
  /** Labour code or description, or model code or description. */
  search: z.string().trim().max(100).optional(),
  pricing: pricing.optional(),
  active: z.boolean().optional(),
}).strict();
export type RateFilter = z.infer<typeof rateFilterSchema>;

export const rateScopeSchema = z.union([
  z.object({ ids: z.array(uuid).min(1).max(20000) }).strict(),
  z.object({ filter: rateFilterSchema }).strict(),
]);
export type RateScope = z.infer<typeof rateScopeSchema>;

export const bulkActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SET_HOURS'), hours: z.number().positive().max(1000) }).strict(),
  z.object({ type: z.literal('SET_RATE'), rate: z.number().nonnegative().max(1e9) }).strict(),
  z.object({ type: z.literal('CHANGE_PERCENT'), percent: z.number().min(-90).max(500).refine((p) => p !== 0, 'Enter a percentage other than 0'), roundTo }).strict(),
  z.object({ type: z.literal('SET_PRICING'), pricing }).strict(),
  z.object({ type: z.literal('SET_ACTIVE'), active: z.boolean() }).strict(),
]);
export type BulkAction = z.infer<typeof bulkActionSchema>;

const dryRunFields = {
  dryRun: z.boolean().optional(),
  /** The count the preview showed. Required to apply. */
  expected: z.number().int().nonnegative().optional(),
};

export const bulkUpdateSchema = z.object({ scope: rateScopeSchema, action: bulkActionSchema, ...dryRunFields }).strict();
export const applyToModelsSchema = z.object({
  labourItemId: uuid,
  /** The models to add the labour to. Omitted: every active model. */
  modelIds: z.array(uuid).min(1).max(500).optional(),
  pricing,
  hours: z.number().positive().max(1000),
  rate: z.number().nonnegative().max(1e9),
  active: z.boolean().default(true),
  /** Replace the rate on models that already have one; otherwise they are left as they are. */
  overwrite: z.boolean().default(false),
  ...dryRunFields,
}).strict();
export const copyModelSchema = z.object({
  fromModelId: uuid,
  toModelIds: z.array(uuid).min(1).max(500),
  overwrite: z.boolean().default(false),
  /** Optional change on the copied rate, e.g. +5 for a dearer model. */
  percent: z.number().min(-90).max(500).optional(),
  roundTo,
  ...dryRunFields,
}).strict();

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 180_000, maxWait: 10_000 };

/** WHERE clause over LabourRate lr, LabourItem li and WorkshopMaster m (the model). */
export function scopeSql(scope: RateScope): Prisma.Sql {
  if ('ids' in scope) return Prisma.sql`lr.id IN (${Prisma.join(scope.ids)})`;
  const f = scope.filter;
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.modelIds?.length) parts.push(Prisma.sql`lr."modelId" IN (${Prisma.join(f.modelIds)})`);
  if (f.labourItemIds?.length) parts.push(Prisma.sql`lr."labourItemId" IN (${Prisma.join(f.labourItemIds)})`);
  if (f.vehicleSystem) parts.push(Prisma.sql`li."vehicleSystem" = ${f.vehicleSystem}`);
  if (f.group) parts.push(Prisma.sql`li."group" = ${f.group}`);
  if (f.pricing) parts.push(Prisma.sql`lr.pricing = ${f.pricing}`);
  if (f.active !== undefined) parts.push(Prisma.sql`lr.active = ${f.active}`);
  if (f.search) {
    const like = `%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    parts.push(Prisma.sql`(li.code ILIKE ${like} OR li.description ILIKE ${like} OR m.code ILIKE ${like} OR m.description ILIKE ${like})`);
  }
  return Prisma.join(parts, ' AND ');
}

const FROM = Prisma.sql`"LabourRate" lr JOIN "LabourItem" li ON li.id = lr."labourItemId" JOIN "WorkshopMaster" m ON m.id = lr."modelId"`;

/** Rounds `expr` to a multiple of `step` without floating-point noise. */
function roundSql(expr: Prisma.Sql, step: number): Prisma.Sql {
  return Prisma.sql`(ROUND((${expr})::numeric / ${step}::numeric) * ${step}::numeric)::double precision`;
}

/** The column an action changes and its new value, as SQL over lr. */
export function actionSql(action: BulkAction): { column: Prisma.Sql; label: string; value: Prisma.Sql } {
  switch (action.type) {
    case 'SET_HOURS': return { column: Prisma.raw('hours'), label: 'hours', value: Prisma.sql`${action.hours}::double precision` };
    case 'SET_RATE': return { column: Prisma.raw('rate'), label: 'rate', value: Prisma.sql`${action.rate}::double precision` };
    case 'CHANGE_PERCENT':
      return { column: Prisma.raw('rate'), label: 'rate', value: roundSql(Prisma.sql`lr.rate * ${1 + action.percent / 100}::double precision`, action.roundTo) };
    case 'SET_PRICING': return { column: Prisma.raw('pricing'), label: 'pricing', value: Prisma.sql`${action.pricing}::text` };
    case 'SET_ACTIVE': return { column: Prisma.raw('active'), label: 'active', value: Prisma.sql`${action.active}::boolean` };
  }
}

function assertExpected(dryRun: boolean | undefined, expected: number | undefined, actual: number) {
  if (dryRun) return;
  if (expected === undefined) throw new BadRequestError('Preview the change first: send the previewed count as "expected"');
  if (expected !== actual)
    throw new ConflictError(`The rates changed since the preview: it showed ${expected}, now ${actual}. Preview again.`);
}

type Sample = { model: string; labour: string; old: unknown; new: unknown };

/** Set hours, set rate, change by %, set pricing or (de)activate the selected or filtered rates. */
export async function bulkUpdateRates(actorId: string, input: z.infer<typeof bulkUpdateSchema>) {
  const { column, label, value } = actionSql(input.action);
  const where = scopeSql(input.scope);
  const changing = Prisma.sql`lr.${column} IS DISTINCT FROM ${value}`;

  return prisma.$transaction(async (tx: Tx) => {
    const [counts] = await tx.$queryRaw<{ matched: bigint; changing: bigint }[]>`
      SELECT count(*) AS matched, count(*) FILTER (WHERE ${changing}) AS changing FROM ${FROM} WHERE ${where}`;
    const matched = Number(counts.matched);
    const willChange = Number(counts.changing);
    const sample = await tx.$queryRaw<Sample[]>`
      SELECT m.description AS model, li.code || ' ' || li.description AS labour, to_jsonb(lr.${column}) AS old, to_jsonb(${value}) AS new
      FROM ${FROM} WHERE ${where} AND ${changing} ORDER BY m.description, li.code LIMIT 10`;
    const result = { matched, changing: willChange, field: label, sample };
    assertExpected(input.dryRun, input.expected, willChange);
    if (input.dryRun || willChange === 0) return { ...result, applied: false };

    const updated = await tx.$executeRaw`
      UPDATE "LabourRate" lr SET ${column} = ${value}
      FROM "LabourItem" li, "WorkshopMaster" m
      WHERE li.id = lr."labourItemId" AND m.id = lr."modelId" AND ${where} AND ${changing}`;
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'LABOUR_RATE_BULK_UPDATE',
        details: JSON.stringify({ rows: updated, matched, action: input.action, scope: 'ids' in input.scope ? { ids: input.scope.ids.length } : input.scope }),
      },
    });
    return { ...result, changing: updated, applied: true };
  }, TX_OPTIONS);
}

/** Adds one labour to many models at once (ABJ added labours to 42 models in one go). */
export async function applyLabourToModels(actorId: string, input: z.infer<typeof applyToModelsSchema>) {
  const labour = await prisma.labourItem.findUnique({ where: { id: input.labourItemId }, select: { id: true, code: true, description: true } });
  if (!labour) throw new NotFoundError('Labour operation not found');
  if (input.modelIds) {
    const found = await prisma.workshopMaster.count({ where: { id: { in: input.modelIds }, kind: 'MODEL' } });
    if (found !== new Set(input.modelIds).size) throw new BadRequestError('One or more models were not found');
  }
  const models = input.modelIds
    ? Prisma.sql`m.id IN (${Prisma.join(input.modelIds)})`
    : Prisma.sql`m.active`;
  const differs = Prisma.sql`(lr.pricing, lr.hours, lr.rate, lr.active) IS DISTINCT FROM (${input.pricing}::text, ${input.hours}::double precision, ${input.rate}::double precision, ${input.active}::boolean)`;

  return prisma.$transaction(async (tx: Tx) => {
    const [counts] = await tx.$queryRaw<{ models: bigint; create: bigint; existing: bigint; differ: bigint }[]>`
      SELECT count(*) AS models,
             count(*) FILTER (WHERE lr.id IS NULL) AS create,
             count(lr.id) AS existing,
             count(lr.id) FILTER (WHERE ${differs}) AS differ
      FROM "WorkshopMaster" m
      LEFT JOIN "LabourRate" lr ON lr."modelId" = m.id AND lr."labourItemId" = ${labour.id}
      WHERE m.kind = 'MODEL' AND ${models}`;
    const result = {
      labour: `${labour.code} ${labour.description}`,
      models: Number(counts.models),
      create: Number(counts.create),
      update: input.overwrite ? Number(counts.differ) : 0,
      keep: Number(counts.existing) - (input.overwrite ? Number(counts.differ) : 0),
    };
    assertExpected(input.dryRun, input.expected, result.create + result.update);
    if (input.dryRun || result.create + result.update === 0) return { ...result, applied: false };

    const conflict = input.overwrite
      ? Prisma.sql`DO UPDATE SET pricing = EXCLUDED.pricing, hours = EXCLUDED.hours, rate = EXCLUDED.rate, active = EXCLUDED.active
          WHERE ("LabourRate".pricing, "LabourRate".hours, "LabourRate".rate, "LabourRate".active)
            IS DISTINCT FROM (EXCLUDED.pricing, EXCLUDED.hours, EXCLUDED.rate, EXCLUDED.active)`
      : Prisma.sql`DO NOTHING`;
    const written = await tx.$executeRaw`
      INSERT INTO "LabourRate" (id, "labourItemId", "modelId", pricing, hours, rate, active)
      SELECT gen_random_uuid()::text, ${labour.id}, m.id, ${input.pricing}, ${input.hours}, ${input.rate}, ${input.active}
      FROM "WorkshopMaster" m WHERE m.kind = 'MODEL' AND ${models}
      ON CONFLICT ("labourItemId", "modelId") ${conflict}`;
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'LABOUR_RATE_APPLY_TO_MODELS',
        details: JSON.stringify({ ...result, rows: written, pricing: input.pricing, hours: input.hours, rate: input.rate, active: input.active, overwrite: input.overwrite, modelIds: input.modelIds ?? 'ALL_ACTIVE' }),
      },
    });
    return { ...result, applied: true };
  }, TX_OPTIONS);
}

/** Copies every rate of one model to others, e.g. when a new model arrives. */
export async function copyModelRates(actorId: string, input: z.infer<typeof copyModelSchema>) {
  const targets = [...new Set(input.toModelIds.filter((id) => id !== input.fromModelId))];
  if (!targets.length) throw new BadRequestError('Choose at least one model other than the source');
  const models = await prisma.workshopMaster.findMany({ where: { id: { in: [input.fromModelId, ...targets] }, kind: 'MODEL' }, select: { id: true, description: true } });
  const source = models.find((m) => m.id === input.fromModelId);
  if (!source) throw new NotFoundError('Source model not found');
  if (models.length !== targets.length + 1) throw new BadRequestError('One or more target models were not found');

  const newRate = input.percent ? roundSql(Prisma.sql`s.rate * ${1 + input.percent / 100}::double precision`, input.roundTo) : Prisma.sql`s.rate`;
  const pairs = Prisma.sql`
    FROM "LabourRate" s CROSS JOIN (SELECT unnest(ARRAY[${Prisma.join(targets)}]::text[]) AS "modelId") t
    LEFT JOIN "LabourRate" lr ON lr."modelId" = t."modelId" AND lr."labourItemId" = s."labourItemId"
    WHERE s."modelId" = ${input.fromModelId}`;

  return prisma.$transaction(async (tx: Tx) => {
    const [counts] = await tx.$queryRaw<{ source: bigint; create: bigint; existing: bigint; differ: bigint }[]>`
      SELECT count(DISTINCT s.id) AS source,
             count(*) FILTER (WHERE lr.id IS NULL) AS create,
             count(lr.id) AS existing,
             count(lr.id) FILTER (WHERE (lr.pricing, lr.hours, lr.rate, lr.active) IS DISTINCT FROM (s.pricing, s.hours, ${newRate}, s.active)) AS differ
      ${pairs}`;
    const result = {
      from: source.description,
      sourceRates: Number(counts.source),
      models: targets.length,
      create: Number(counts.create),
      update: input.overwrite ? Number(counts.differ) : 0,
      keep: Number(counts.existing) - (input.overwrite ? Number(counts.differ) : 0),
    };
    assertExpected(input.dryRun, input.expected, result.create + result.update);
    if (input.dryRun || result.create + result.update === 0) return { ...result, applied: false };

    const conflict = input.overwrite
      ? Prisma.sql`DO UPDATE SET pricing = EXCLUDED.pricing, hours = EXCLUDED.hours, rate = EXCLUDED.rate, active = EXCLUDED.active
          WHERE ("LabourRate".pricing, "LabourRate".hours, "LabourRate".rate, "LabourRate".active)
            IS DISTINCT FROM (EXCLUDED.pricing, EXCLUDED.hours, EXCLUDED.rate, EXCLUDED.active)`
      : Prisma.sql`DO NOTHING`;
    const written = await tx.$executeRaw`
      INSERT INTO "LabourRate" (id, "labourItemId", "modelId", pricing, hours, rate, active)
      SELECT gen_random_uuid()::text, s."labourItemId", t."modelId", s.pricing, s.hours, ${newRate}, s.active
      FROM "LabourRate" s CROSS JOIN (SELECT unnest(ARRAY[${Prisma.join(targets)}]::text[]) AS "modelId") t
      WHERE s."modelId" = ${input.fromModelId}
      ON CONFLICT ("labourItemId", "modelId") ${conflict}`;
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'LABOUR_RATE_COPY_MODEL',
        details: JSON.stringify({ ...result, rows: written, fromModelId: input.fromModelId, toModelIds: targets, overwrite: input.overwrite, percent: input.percent ?? null, roundTo: input.roundTo }),
      },
    });
    return { ...result, applied: true };
  }, TX_OPTIONS);
}

export const gridQuerySchema = rateFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** One page of rates for the grid, with the filter's total. */
export async function listRates(query: z.infer<typeof gridQuerySchema>) {
  const { page, limit, ...filter } = query;
  const where = scopeSql({ filter });
  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw<{
      id: string; labourItemId: string; modelId: string; pricing: string; hours: number; rate: number; active: boolean;
      modelCode: string; modelDescription: string; labourCode: string; labourDescription: string;
      vehicleSystem: string | null; group: string | null; labourActive: boolean;
    }[]>`
      SELECT lr.id, lr."labourItemId", lr."modelId", lr.pricing, lr.hours, lr.rate, lr.active,
             m.code AS "modelCode", m.description AS "modelDescription",
             li.code AS "labourCode", li.description AS "labourDescription",
             li."vehicleSystem", li."group", li.active AS "labourActive"
      FROM ${FROM} WHERE ${where}
      ORDER BY m.description, li.code
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM ${FROM} WHERE ${where}`,
  ]);
  const count = Number(total);
  return { rates: rows, meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) } };
}

/** Choices for the grid filters: models with their rate counts, vehicle systems and groups in use. */
export async function rateFilterOptions() {
  const [models, systems, groups] = await Promise.all([
    prisma.$queryRaw<{ id: string; code: string; description: string; active: boolean; rates: bigint }[]>`
      SELECT m.id, m.code, m.description, m.active, count(lr.id) AS rates
      FROM "WorkshopMaster" m LEFT JOIN "LabourRate" lr ON lr."modelId" = m.id
      WHERE m.kind = 'MODEL' GROUP BY m.id ORDER BY m.description`,
    prisma.labourItem.findMany({ where: { vehicleSystem: { not: null } }, distinct: ['vehicleSystem'], select: { vehicleSystem: true }, orderBy: { vehicleSystem: 'asc' } }),
    prisma.labourItem.findMany({ where: { group: { not: null } }, distinct: ['group'], select: { group: true }, orderBy: { group: 'asc' } }),
  ]);
  return {
    models: models.map((m) => ({ ...m, rates: Number(m.rates) })),
    vehicleSystems: systems.map((s) => s.vehicleSystem!).filter(Boolean),
    groups: groups.map((g) => g.group!).filter(Boolean),
  };
}

export const editRateSchema = z.object({
  pricing: pricing.optional(),
  hours: z.number().positive().max(1000).optional(),
  rate: z.number().nonnegative().max(1e9).optional(),
  active: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to change');

/** Inline edit of one rate. */
export async function editRate(id: string, data: z.infer<typeof editRateSchema>) {
  const existing = await prisma.labourRate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError('Labour rate not found');
  return prisma.labourRate.update({ where: { id }, data });
}
