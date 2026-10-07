# Database deployment and performance

Run from `server` before starting a new application build:

```powershell
npm run prisma:status
npm run db:prepare
npm run dev
```

`db:prepare` applies committed migrations and regenerates the Prisma client. Review pending migration SQL before deployment and obtain deployment approval. Stop the API and all other database writers throughout deployment; the archive locks protect each snapshot transaction, not the interval between migrations. Do not reset or force-push a database to fix missing columns.

## Preserving historical records

Two new migrations preserve data before the existing cleanup steps, without modifying previously committed migration files:

- `20260928115900_preserve_legacy_records` snapshots document counters, invoice lines (when present), legacy SRN headers/lines and MIT headers/lines, including fields later removed.
- `20261005090000_preserve_legacy_labour` snapshots charge lines and vehicles before standalone labour cleanup and sale-date reconciliation.

Complete rows are stored as JSONB in `legacy_archive."RecordSnapshot"`, with a migration key, source table, content hash and capture time. Column metadata and source row counts are stored in `legacy_archive."TableSnapshot"`. Snapshot copying and verification are transactional. Identical snapshots are not duplicated on retry; changed row contents produce another retained version. Each source row's complete payload must match its archived copy before the archive migration succeeds. PUBLIC access to the archive schema, tables and capture function is revoked.

The existing migrations still remove legacy tables/rows from the active schema. Their original data remains in the archive for audit/recovery, including enum values encoded as JSON strings. These archived records do not appear in current application screens and are not automatically converted into new MRN or catalogue-labour records. If they must remain visible in the app, implement a historical-data view or conversion before deployment. This archive is not a substitute for an independent database backup.

Inspect retained records through an authorized database connection:

```sql
SELECT "sourceTable", "sourceRowCount", "archivedAt"
FROM legacy_archive."TableSnapshot"
ORDER BY "sourceTable", "migrationKey";

SELECT "payload"
FROM legacy_archive."RecordSnapshot"
WHERE "sourceTable" = 'StockReceiptNote';

SELECT "payload"
FROM legacy_archive."RecordSnapshot"
WHERE "sourceTable" = 'JobCardLine' AND "payload"->>'id' = '<original-line-id>';
```

An isolated integration check is included in `prisma/tests/preserve-legacy-records.cjs`. It uses `@electric-sql/pglite` installed separately, never `DATABASE_URL`. Run `node prisma/tests/preserve-legacy-records.cjs <path-to-pglite-package>`. It checks historical payload preservation, removed enums/fields, snapshot retries, the original counter/labour migrations, and the complete fresh migration chain. It does not validate live data, provider connectivity, or production load.

The warranty columns are introduced by `20260930090000_warranty_and_campaigns`. Startup checks the database's column names against the generated client and refuses HTTP traffic on missing columns or a failed connection. This check detects missing columns, not incompatible column types or missing indexes.

The job-card list defaults to 50 records, orders by creation time and ID, and returns list relations without history, complaints, inspections, estimates, previous jobs or appointment details. Fetch the job-card detail endpoint for those relations. Four composite indexes support global, branch, branch/status and customer sorting. Index builds run in a transaction-compatible SQL batch during maintenance. They can temporarily block writes; a five-second lock timeout aborts the migration if it cannot acquire the table lock. The four builds commit atomically. The integration check executes each migration as a single batch, matching Prisma execution.

Prisma reuses one client and its connection pool. Keep the API close to the database region. The configured database is Supabase; use its documented migration-compatible direct/session connection for Prisma Migrate and a pooler suitable for your runtime for application traffic. Do not invent a direct hostname or change database credentials without checking provider configuration.

Queries taking at least `DB_SLOW_QUERY_MS` (default 500ms) are logged without parameters. Set `DB_QUERY_LOG=true` temporarily for all query timings. Permission lookups select names only; authorization is not cached, so there is no added cache staleness.

After deployment, measure endpoint p50/p95/p99 under representative concurrency and run `EXPLAIN (ANALYZE, BUFFERS)` on representative read queries. Check pool wait times, database CPU and slow-query logs. Indexes are intended improvements, not measured latency guarantees. Large offsets and case-insensitive substring searches can remain expensive; use measured query plans to decide on cursor pagination and trigram indexes.
