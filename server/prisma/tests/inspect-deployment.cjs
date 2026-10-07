// Read-only deployment diagnostics. Does not print connection strings or row payloads.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  console.log('Migrations:', await prisma.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM public._prisma_migrations
    WHERE migration_name >= '20260928115900'
    ORDER BY started_at
  `);
  console.log('JobCard indexes:', await prisma.$queryRaw`
    SELECT c.relname AS name, i.indisvalid AS valid, pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'public."JobCard"'::regclass
    ORDER BY c.relname
  `);
  console.log('JobCard size:', await prisma.$queryRaw`
    SELECT pg_size_pretty(pg_total_relation_size('public."JobCard"')) AS size
  `);
  console.log('Archive snapshot counts:', await prisma.$queryRaw`
    SELECT "sourceTable", "sourceRowCount" FROM legacy_archive."TableSnapshot"
    ORDER BY "sourceTable", "migrationKey"
  `);
  require('ts-node/register/transpile-only');
  const { checkDatabaseSchema } = require('../../src/prisma/check-schema');
  const applicationPrisma = require('../../src/prisma/client').default;
  try {
    await checkDatabaseSchema();
    const { ServiceRepository } = require('../../src/modules/service/service.repository');
    const rows = await new ServiceRepository().listJobCards({ take: 5 });
    console.log('Schema compatibility and job-card list read passed:', { returnedRows: rows.length });
  } finally {
    await applicationPrisma.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
