/** Read-only inspection; never executes migration SQL or changes migration history. */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const attempts = await prisma.$queryRaw`
    SELECT migration_name, started_at, finished_at, rolled_back_at, logs
    FROM "_prisma_migrations"
    WHERE migration_name = '20261020100000_estimate_versions_signatures'
    ORDER BY started_at DESC LIMIT 3
  `;
  const columns = await prisma.$queryRaw`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('DocumentTerms', 'Estimate', 'CustomerApproval', 'EstimateSignature')
    ORDER BY table_name, ordinal_position
  `;
  const incompatibleTermsColumns = await prisma.$queryRaw`
    SELECT expected.name AS incompatible_or_missing_column, c.udt_name AS actual_type,
           expected.udt AS expected_type, c.is_nullable
    FROM (VALUES ('id', 'text', false), ('type', 'text', false), ('branchId', 'text', true),
                 ('terms', '_text', false), ('footer', 'text', true), ('updatedAt', 'timestamp', false),
                 ('companyName', 'text', true), ('companyAddress', 'text', true), ('companyPhone', 'text', true))
         AS expected(name, udt, nullable)
    LEFT JOIN information_schema.columns c ON c.table_schema = current_schema()
         AND c.table_name = 'DocumentTerms' AND c.column_name = expected.name
    WHERE (c.column_name IS NULL AND expected.name NOT IN ('companyName', 'companyAddress', 'companyPhone'))
         OR (c.column_name IS NOT NULL AND c.udt_name <> expected.udt)
         OR (NOT expected.nullable AND c.is_nullable <> 'NO')
    ORDER BY expected.name
  `;
  const indexes = await prisma.$queryRaw`
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename IN ('DocumentTerms', 'Estimate', 'CustomerApproval', 'EstimateSignature')
    ORDER BY tablename, indexname
  `;
  const enumTypeColumn = columns.find(column => column.table_name === 'DocumentTerms' && column.column_name === 'documentType');
  const blockingTermsColumns = incompatibleTermsColumns.filter(column =>
    !(column.incompatible_or_missing_column === 'type' && column.actual_type === null && enumTypeColumn));
  console.log(JSON.stringify({ attempts, incompatibleTermsColumns: blockingTermsColumns,
    supportedTermsMapping: enumTypeColumn ? { existingColumn: 'documentType', existingType: enumTypeColumn.udt_name,
      recovery: 'Preserve existing documentType and add synchronized text type alias' } : null,
    columns, indexes }, null, 2));
}
main().catch((error) => {
  let message = error.message || String(error);
  if (process.env.DATABASE_URL) message = message.split(process.env.DATABASE_URL).join('[DATABASE_URL]');
  console.error(message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
