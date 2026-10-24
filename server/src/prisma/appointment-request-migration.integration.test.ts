import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('AppointmentRequest defectCode forward repair on localhost', () => {
  let db: PrismaClient;
  const migration = readFileSync(resolve(__dirname, '../../prisma/migrations/20261021140000_appointment_request_defect_code_repair/migration.sql'), 'utf8');
  beforeAll(() => {
    if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Migration tests require a disposable localhost database');
    db = new PrismaClient({ datasources: { db: { url } } });
  });
  afterAll(async () => { await db?.$disconnect(); });
  it.each([false, true])('preserves rows and is repeatable when the column already exists: %s', async present => {
    const schema = `issue113_repair_${process.pid}_${present ? 'present' : 'missing'}`;
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      try {
        await tx.$executeRawUnsafe('CREATE TABLE "AppointmentRequest" (id TEXT PRIMARY KEY, description TEXT NOT NULL, "estimatedParts" NUMERIC(18,2) NOT NULL)');
        if (present) await tx.$executeRawUnsafe('ALTER TABLE "AppointmentRequest" ADD COLUMN "defectCode" TEXT');
        await tx.$executeRawUnsafe(`INSERT INTO "AppointmentRequest" (id, description, "estimatedParts") VALUES ('synthetic-request', 'Preserved request', 123.45)`);
        if (present) await tx.$executeRawUnsafe(`UPDATE "AppointmentRequest" SET "defectCode" = 'SYNTHETIC-DEFECT'`);
        await tx.$executeRawUnsafe(migration);
        const columns = await tx.$queryRaw<{ data_type: string; is_nullable: string }[]>`SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'AppointmentRequest' AND column_name = 'defectCode'`;
        expect(columns).toEqual([{ data_type: 'text', is_nullable: 'YES' }]);
        const rows = await tx.$queryRaw<{ description: string; amount: string; defectCode: string | null }[]>`SELECT description, "estimatedParts"::text AS amount, "defectCode" FROM "AppointmentRequest"`;
        expect(rows).toEqual([{ description: 'Preserved request', amount: '123.45', defectCode: present ? 'SYNTHETIC-DEFECT' : null }]);
        await tx.$executeRawUnsafe(`UPDATE "AppointmentRequest" SET "defectCode" = 'SYNTHETIC-DEFECT'`);
        await tx.$executeRawUnsafe(migration);
        expect(await tx.$queryRaw`SELECT "defectCode" FROM "AppointmentRequest"`).toEqual([{ defectCode: 'SYNTHETIC-DEFECT' }]);
      } finally { await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    });
  });
});
