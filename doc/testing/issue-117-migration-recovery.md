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

The transaction first recognizes the deployed `documentType` column, adds a text `type` compatibility alias if absent and copies its values without modifying the original enum. A trigger keeps old callers writing `documentType` and new callers writing `type` synchronized, including inserts. Conflicting values are rejected. The remaining preflight validates the terms layout; any failure rolls back the entire attempt. If it reports incompatible or missing columns, stop and collect this read-only result in a SQL client; the existing table needs an explicit mapping rather than an automatic conversion:

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

Verified locally on PostgreSQL 18: all five cases passed. Cases: fresh install; the original partial duplicate-table failure with existing terms; repeated application preserving newer versions, signature evidence and new approval requirements; the diagnostic's enum `documentType` layout with inserts/updates through both names and preserved existing enum labels; incompatible terms layout aborting without committed writes. No production/deployment database is accessed by the test.

Recovery was not run against the user's database. The operator supplied column/index definitions: `documentType` uses `DocumentTermType`, `terms` is a text array, and the scope index uses `documentType` with branch fallback. That layout is covered by the fifth local regression scenario. Actual deployment success still needs operator verification.

### Transaction-aborted follow-on error

If Prisma reports only `current transaction is aborted`, an earlier statement inside the explicit transaction failed. Do not remove the transaction or repeatedly resolve/redeploy to guess the cause. From `server`, run `node prisma/diagnose-issue117.cjs` and inspect/share the output. This script runs only SELECT queries: migration-attempt logs, column definitions, the terms-compatibility check and index definitions. It never applies SQL changes, changes migration history, reads customer records or prints the connection URL. The result distinguishes an existing terms-layout mismatch from a partially applied column/index conflict.
