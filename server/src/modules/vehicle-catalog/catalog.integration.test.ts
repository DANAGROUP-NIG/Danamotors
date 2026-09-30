import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { seedCatalogTransaction } from './catalog-seed';
import { parseCatalog, KIA_COUNTS } from './catalog-source';

// Temporary tables shadow the application catalogue only within this transaction.
// No application rows are changed; every fixture is rolled back, including DDL.
const integration = process.env.CATALOG_DATABASE_TEST === '1' ? describe : describe.skip;
integration('Catalogue seed in isolated PostgreSQL temporary tables', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());
  it('seeds an empty catalogue twice, preserves IDs/specs/nulls and rolls back malformed batches', async () => {
    const source = JSON.parse(readFileSync(resolve(__dirname, '../../../data/kia.json'), 'utf8'));
    const migration = readFileSync(resolve(__dirname, '../../../prisma/migrations/20260930100000_vehicle_catalog/migration.sql'), 'utf8');
    const rollback = new Error('ROLLBACK_CATALOG_TEST');
    await expect(prisma.$transaction(async tx => {
      const statements = migration.split(';').map(statement => statement.replace(/--[^\n]*/g, '').trim());
      for (const statement of statements) {
        if (/^CREATE TABLE "VehicleCatalog/.test(statement)) {
          await tx.$executeRawUnsafe(statement.replace('CREATE TABLE', 'CREATE TEMPORARY TABLE'));
        } else if (/^CREATE (UNIQUE )?INDEX .* ON "VehicleCatalog/.test(statement) || /^ALTER TABLE "VehicleCatalog/.test(statement)) {
          await tx.$executeRawUnsafe(statement);
        }
      }
      const first = await seedCatalogTransaction(tx, source);
      for (const key of Object.keys(KIA_COUNTS) as (keyof typeof KIA_COUNTS)[]) {
        expect(first[key]).toEqual({ inserted: KIA_COUNTS[key], updated: 0 });
      }
      const before = await tx.$queryRaw<{ id: string; powerHp: number | null; specs: unknown }[]>`SELECT id, "powerHp", specs FROM "VehicleCatalogEngine" ORDER BY id`;
      const second = await seedCatalogTransaction(tx, source);
      for (const key of Object.keys(KIA_COUNTS) as (keyof typeof KIA_COUNTS)[]) {
        expect(second[key]).toEqual({ inserted: 0, updated: KIA_COUNTS[key] });
      }
      const after = await tx.$queryRaw`SELECT id, "powerHp", specs FROM "VehicleCatalogEngine" ORDER BY id`;
      expect(after).toEqual(before);
      expect(before).toHaveLength(629);
      const sourceEngines = parseCatalog(source).data.makes.flatMap(make => make.models.flatMap(model => model.generations.flatMap(generation => generation.engines)));
      expect(before.filter(engine => engine.powerHp === null)).toHaveLength(sourceEngines.filter(engine => engine.powerHp === null).length);
      expect(before.map(engine => JSON.stringify(engine.specs, Object.keys(engine.specs as object).sort())).sort()).toEqual(sourceEngines.map(engine => JSON.stringify(engine.specs, Object.keys(engine.specs).sort())).sort());
      const malformed = structuredClone(source);
      malformed.makes[0].models[0].generations[0].engines[0].cylinders = 'invalid';
      await expect(seedCatalogTransaction(tx, malformed)).rejects.toThrow();
      expect(await tx.$queryRaw`SELECT id, "powerHp", specs FROM "VehicleCatalogEngine" ORDER BY id`).toEqual(before);
      throw rollback;
    }, { timeout: 120_000, maxWait: 15_000 })).rejects.toBe(rollback);
  }, 150_000);
});
