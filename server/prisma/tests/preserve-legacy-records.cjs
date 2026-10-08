// Isolated PostgreSQL integration check; never connects to DATABASE_URL.
// Pass the path to an installed @electric-sql/pglite package as the first argument.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const migrationsRoot = path.resolve(__dirname, '../migrations');
const sql = name => fs.readFileSync(path.join(migrationsRoot, name, 'migration.sql'), 'utf8');
const archiveMigration = '20260928115900_preserve_legacy_records';
const labourArchiveMigration = '20261005090000_preserve_legacy_labour';

async function testFreshMigrationChain() {
  const db = new PGlite();
  try {
    const migrations = fs.readdirSync(migrationsRoot)
      .filter(name => fs.existsSync(path.join(migrationsRoot, name, 'migration.sql'))).sort();
    for (const name of migrations) {
      // Match Prisma's single-batch execution, including transaction boundaries.
      try { await db.exec(sql(name)); }
      catch (error) { throw new Error(`Fresh migration failed: ${name}`, { cause: error }); }
    }
    const result = await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'JobCard' AND column_name = 'warrantyStatusAtCreation'`);
    assert.equal(result.rows.length, 1);
    const indexes = await db.query(`SELECT indexrelid::regclass::text AS name, indisvalid
      FROM pg_index WHERE indrelid = '"JobCard"'::regclass`);
    for (const name of ['JobCard_createdAt_id_idx', 'JobCard_branchId_createdAt_id_idx',
      'JobCard_branchId_status_createdAt_id_idx', 'JobCard_customerId_createdAt_id_idx']) {
      assert(indexes.rows.some(index => index.name.replaceAll('"', '') === name && index.indisvalid),
        `Missing or invalid index: ${name}`);
    }
    console.log(`PASS: ${migrations.length} migrations apply to a fresh isolated database`);
  } finally { await db.close(); }
}

async function testLegacyPreservation() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TYPE "SrnStatus" AS ENUM ('COMPLETED');
      CREATE TYPE "MitSourceType" AS ENUM ('INTERNAL_TRANSFER', 'EXTERNAL_VENDOR');
      CREATE TABLE "DocumentSequence" (
        "docType" TEXT, "year" INTEGER, "lastValue" INTEGER, "updatedAt" TIMESTAMP(3),
        CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("docType", "year")
      );
      INSERT INTO "DocumentSequence" VALUES ('STN', 2026, 42, '2026-10-06');
      CREATE TABLE "StockReceiptNote" (id TEXT PRIMARY KEY, status "SrnStatus", remarks TEXT);
      INSERT INTO "StockReceiptNote" VALUES ('srn', 'COMPLETED', 'Keep original receipt');
      CREATE TABLE "StockReceiptLine" (id TEXT PRIMARY KEY, "srnId" TEXT, quantity INTEGER);
      INSERT INTO "StockReceiptLine" VALUES ('srn-line', 'srn', 3);
      CREATE TABLE "MaterialInTransit" (id TEXT PRIMARY KEY, "sourceType" "MitSourceType", "waybillNumber" TEXT);
      INSERT INTO "MaterialInTransit" VALUES ('internal', 'INTERNAL_TRANSFER', 'WAYBILL-42'),
        ('external', 'EXTERNAL_VENDOR', 'VENDOR-42');
      CREATE TABLE "MaterialInTransitLine" (id TEXT PRIMARY KEY, "mitId" TEXT, "stnLineId" TEXT, quantity INTEGER);
      INSERT INTO "MaterialInTransitLine" VALUES ('internal-line', 'internal', 'stn-line', 3);
    `);
    const expected = {};
    for (const table of ['DocumentSequence', 'StockReceiptNote', 'StockReceiptLine', 'MaterialInTransit', 'MaterialInTransitLine']) {
      expected[table] = (await db.query(`SELECT to_jsonb(t) AS payload FROM "${table}" t`)).rows.map(row => row.payload);
    }
    await db.exec(sql(archiveMigration));
    await db.exec(sql(archiveMigration)); // retries must not duplicate identical records
    await db.exec(sql('20260928120000_document_sequence_key_value'));
    // Exercise the same removals that the transfer migration performs, including enum drops.
    await db.exec(`DROP TABLE "StockReceiptLine"; DROP TABLE "StockReceiptNote"; DROP TYPE "SrnStatus";
      DELETE FROM "MaterialInTransitLine" WHERE "mitId" = 'internal';
      DELETE FROM "MaterialInTransit" WHERE "sourceType" = 'INTERNAL_TRANSFER';
      ALTER TABLE "MaterialInTransit" DROP COLUMN "sourceType", DROP COLUMN "waybillNumber";
      ALTER TABLE "MaterialInTransitLine" DROP COLUMN "stnLineId";
      DROP TYPE "MitSourceType";`);
    for (const [table, payloads] of Object.entries(expected)) {
      const archived = (await db.query(`SELECT payload FROM legacy_archive."RecordSnapshot" WHERE "sourceTable" = $1`, [table])).rows.map(row => row.payload);
      assert.deepEqual(archived.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        payloads.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    }
    assert.equal((await db.query('SELECT value FROM "DocumentSequence" WHERE key = $1', ['STN_2026'])).rows[0].value, 42);

    await db.exec(`CREATE TABLE "JobCardLabour" (id TEXT PRIMARY KEY);
      CREATE TABLE "JobCardLine" (id TEXT PRIMARY KEY, kind TEXT, description TEXT, amount DOUBLE PRECISION);
      INSERT INTO "JobCardLine" VALUES ('labour', 'LABOUR', 'Historical standalone labour', 12345.67);
      CREATE TABLE "WarrantyCaseLine" ("jobCardLineId" TEXT);
      CREATE TABLE "Vehicle" (id TEXT PRIMARY KEY, "saleDate" TIMESTAMP(3), "warrantyStartDate" TIMESTAMP(3));
      INSERT INTO "Vehicle" VALUES ('vehicle', NULL, '2025-10-06');`);
    const originalLabour = (await db.query('SELECT to_jsonb(t) AS payload FROM "JobCardLine" t')).rows[0].payload;
    await db.exec(sql(labourArchiveMigration));
    await db.exec(sql('20261005100000_reconcile_warranty_with_job_billing'));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "JobCardLine"')).rows[0].count, 0);
    const archivedLabour = await db.query(`SELECT payload FROM legacy_archive."RecordSnapshot" WHERE "sourceTable" = 'JobCardLine'`);
    assert.deepEqual(archivedLabour.rows[0].payload, originalLabour);
    assert.equal((await db.query('SELECT "saleDate" = "warrantyStartDate" AS migrated FROM "Vehicle"')).rows[0].migrated, true);
    assert.equal((await db.query(`SELECT payload->'saleDate' AS original FROM legacy_archive."RecordSnapshot" WHERE "sourceTable" = 'Vehicle'`)).rows[0].original, null);
    console.log('PASS: historical receipts, transfers, removed fields, counters, labour and vehicle data survive cleanup');
  } finally { await db.close(); }
}

(async () => {
  await testLegacyPreservation();
  await testFreshMigrationChain();
})().catch(error => { console.error(error); process.exitCode = 1; });
