# Recover the failed issue 117 migration

The original migration unconditionally created `DocumentTerms`. A database with that table already present fails with PostgreSQL 42P07 / Prisma P3018. Earlier migration statements may already have completed. Missing tables in a checkout's migration history do not prove absence in a deployed database.

The corrected migration is atomic and safe to retry after the reported partial failure. It preserves compatible existing terms, adds only absent optional company-header columns, skips already-created columns/indexes/constraints/tables, and only backfills estimate versions when first adding the version column. It never resets existing approvals to legacy or rewrites later signed revisions on a retry.

## Operator recovery

Use the updated migration file from this branch on the deployment checkout. From `server`, against the intended database:

```sh
npx prisma migrate resolve --rolled-back 20261020100000_estimate_versions_signatures
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```

`--rolled-back` updates Prisma's failed-migration record; it does **not** undo partially applied SQL. The corrected migration handles that state explicitly. Do not reset the database, drop `DocumentTerms`, or mark this migration applied without successfully completing its SQL. A new later migration cannot clear the P3018 block by itself. If the original migration has already succeeded in another environment, preserve that environment's migration history and coordinate this failed-migration correction before deployment.

The preflight checks the existing terms table before any new schema/data changes. If it reports incompatible or missing columns, stop and collect this read-only result in a SQL client; the existing table needs an explicit mapping rather than an automatic conversion:

```sql
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema() AND table_name = 'DocumentTerms'
ORDER BY ordinal_position;
```

The print code requires text `id`, `type`, `branchId`, `footer`; text-array `terms`; and timestamp `updatedAt`, with the required fields non-null. Optional company header fields are added only when absent. Existing terms, footer and other columns are preserved. Duplicate pre-existing terms that violate the model's uniqueness constraints also stop the transaction without deleting data.

## Local regression test

The Python regression harness starts its own fresh PostgreSQL cluster bound only to `127.0.0.1`, picks an available local port, ignores `DATABASE_URL`, and stops its own cluster in a finally block. Data/log files remain under the ignored `.audit-local` folder.

```powershell
python server/prisma/tests/issue117-migration-recovery.py --pg-bin 'C:\Program Files\PostgreSQL\18\bin'
```

Verified locally on PostgreSQL 18: all four cases passed. Cases: fresh install; the original partial duplicate-table failure with existing terms; repeated application preserving newer versions, signature evidence and new approval requirements; incompatible terms layout aborting before writes. No production/deployment database is accessed by the test.

Recovery was not run against the user's database. Its existing `DocumentTerms` column definitions remain unverified until the operator runs the corrected migration's preflight or supplies the read-only inspection result.
