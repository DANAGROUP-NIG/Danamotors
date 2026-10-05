import { createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseCatalog, normalizeCatalogName, catalogAliases } from './catalog-source';

type Row = Record<string, unknown>;
type Counts = { inserted: number; updated: number };
export type SeedSummary = Record<'makes' | 'models' | 'generations' | 'engines', Counts>;
const stableId = (key: unknown[]) => {
  const hex = createHash('sha256').update(JSON.stringify(key)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const identifier = (value: string) => Prisma.raw(`"${value}"`);

// Table/column identifiers are internal constants. All source values are bound JSON parameters.
async function upsertRows(tx: Prisma.TransactionClient, table: string, types: Record<string, string>, keys: string[], rows: Row[]) {
  const returned: Row[] = [];
  const counts: Counts = { inserted: 0, updated: 0 };
  const columns = Object.keys(types);
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const result = await tx.$queryRaw<Row[]>(Prisma.sql`
      INSERT INTO ${identifier(table)} (${Prisma.join(columns.map(identifier))})
      SELECT ${Prisma.join(columns.map(identifier))}
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS incoming(
        ${Prisma.join(columns.map(column => Prisma.sql`${identifier(column)} ${Prisma.raw(types[column])}`))}
      )
      ON CONFLICT (${Prisma.join(keys.map(identifier))}) DO UPDATE SET
        ${Prisma.join(columns.filter(column => column !== 'id').map(column => Prisma.sql`${identifier(column)} = EXCLUDED.${identifier(column)}`))}
      RETURNING id, ${Prisma.join(keys.map(identifier))}, (xmax = 0) AS inserted
    `);
    for (const row of result) { counts[row.inserted ? 'inserted' : 'updated']++; returned.push(row); }
  }
  return { counts, rows: returned };
}
export async function seedCatalogTransaction(tx: Prisma.TransactionClient, input: unknown): Promise<SeedSummary> {
  const { data } = parseCatalog(input); // Validate the complete file before the first write.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(731904202)`;
  const makes = await upsertRows(tx, 'VehicleCatalogMake', { id: 'text', name: 'text' }, ['name'], data.makes.map(make => ({ id: stableId(['make', make.name]), name: make.name })));
  const makeIds = new Map(makes.rows.map(row => [String(row.name), String(row.id)]));
  const modelRows = data.makes.flatMap(make => make.models.map(model => ({
    id: stableId(['model', make.name, model.name]), makeId: makeIds.get(make.name)!, name: model.name,
    searchName: normalizeCatalogName(model.name), aliases: catalogAliases(model.name), yearStart: model.yearStart, yearEnd: model.yearEnd,
  })));
  const models = await upsertRows(tx, 'VehicleCatalogModel', { id: 'text', makeId: 'text', name: 'text', searchName: 'text', aliases: 'text[]', yearStart: 'integer', yearEnd: 'integer' }, ['makeId', 'name'], modelRows);
  const modelIds = new Map(models.rows.map(row => [JSON.stringify([row.makeId, row.name]), String(row.id)]));
  const generationRows: Row[] = [];
  const sourceGenerations: { key: string; engines: typeof data.makes[number]['models'][number]['generations'][number]['engines'] }[] = [];
  for (const make of data.makes) for (const model of make.models) {
    const modelId = modelIds.get(JSON.stringify([makeIds.get(make.name), model.name]))!;
    const occurrences = new Map<string, number>();
    for (const generation of model.generations) {
      const natural = JSON.stringify([modelId, generation.name, generation.yearStart]);
      const sourceOrdinal = occurrences.get(natural) ?? 0; occurrences.set(natural, sourceOrdinal + 1);
      const key = JSON.stringify([modelId, generation.name, generation.yearStart, sourceOrdinal]);
      generationRows.push({ id: stableId(['generation', key]), modelId, name: generation.name, yearStart: generation.yearStart, yearEnd: generation.yearEnd, bodyType: generation.bodyType, sourceOrdinal });
      sourceGenerations.push({ key, engines: generation.engines });
    }
  }
  const generations = await upsertRows(tx, 'VehicleCatalogGeneration', { id: 'text', modelId: 'text', name: 'text', yearStart: 'integer', yearEnd: 'integer', bodyType: 'text', sourceOrdinal: 'integer' }, ['modelId', 'name', 'yearStart', 'sourceOrdinal'], generationRows);
  const generationIds = new Map(generations.rows.map(row => [JSON.stringify([row.modelId, row.name, row.yearStart, row.sourceOrdinal]), String(row.id)]));
  const engineRows = sourceGenerations.flatMap(source => {
    const generationId = generationIds.get(source.key)!;
    const occurrences = new Map<string, number>();
    return source.engines.map(engine => {
      const sourceOrdinal = occurrences.get(engine.label) ?? 0; occurrences.set(engine.label, sourceOrdinal + 1);
      return { ...engine, id: stableId(['engine', generationId, engine.label, sourceOrdinal]), generationId, sourceOrdinal };
    });
  });
  const engines = await upsertRows(tx, 'VehicleCatalogEngine', {
    id: 'text', generationId: 'text', label: 'text', sourceOrdinal: 'integer', fuelType: 'text', cylinders: 'integer', displacementCc: 'integer', powerHp: 'double precision', torqueNm: 'double precision', transmission: 'text', drivetrain: 'text', zeroToHundredKmhS: 'double precision', topSpeedKmh: 'double precision', fuelEconomyCombinedL100: 'double precision', lengthMm: 'integer', widthMm: 'integer', heightMm: 'integer', wheelbaseMm: 'integer', curbWeightKg: 'integer', specs: 'jsonb',
  }, ['generationId', 'label', 'sourceOrdinal'], engineRows);
  return { makes: makes.counts, models: models.counts, generations: generations.counts, engines: engines.counts };
}
export async function seedVehicleCatalog(prisma: PrismaClient, input: unknown) {
  parseCatalog(input);
  return prisma.$transaction(tx => seedCatalogTransaction(tx, input), { timeout: 120_000, maxWait: 15_000 });
}
