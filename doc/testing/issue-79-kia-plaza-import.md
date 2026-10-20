# Kia Plaza test-data import

Requested source: Kia Plaza's AutoEnhancer SQL Server on `10.1.172.133`, accessible over its LAN. Credentials are not embedded in repository files. Configured target: PostgreSQL `danagroup_danamotors_dev` at `209.74.93.26`.

**Current result:** no import performed. SQL Server port 1433 timed out in the sandbox and in an explicitly authorized unsandboxed read-only attempt. The target PostgreSQL port 5432 was also unreachable both ways. The user confirmed that the source requires LAN access. No source schema/records were read and no target records were written; migrations were not applied.

## Run the inspection on the Kia Plaza LAN

On a Windows machine with access to that LAN, open PowerShell in the repo's `server` directory and run:

```powershell
.\prisma\legacy\inspect-monthly-report-source.ps1 -OutputPath "$env:TEMP\kia-plaza-monthly-source.json"
```

Enter the supplied SQL Server credentials in the secure prompt. If SQL Server uses a named instance or a different port, supply `-Server '10.1.172.133\INSTANCE'` or `-Server 'tcp:10.1.172.133,PORT'`. The script only sends SELECT statements. It exports table/column/foreign-key metadata, counts and at most three sample records for issue-listed source tables. It never writes to SQL Server or PostgreSQL and never writes credentials into the output. Use `-SampleRows 0` for metadata only; sample records are needed to verify date/code representations for import mapping.

The JSON contains real business records; keep it private. It is an inspection artifact, not a complete import dataset. Share it back in this conversation, or make this execution environment able to reach both databases, so the actual mappings and a bounded related-data export can be built from verified fields.

## Target readiness

From a machine that can reach the configured development database:

```powershell
node prisma/legacy/inspect-monthly-report-target.cjs
```

This prints only the target host/database, recent migration names and branch/customer/job counts. No credentials or individual customers are printed. Apply the four issue-79 migrations before importing new snapshot/corporate fields, then regenerate Prisma.

## Import constraints for the next step

- Keep the SQL Server source read-only; never update legacy flags or bills.
- Use a bounded period/sample, selected after verifying available job/bill/booking dates.
- Export the related customers, vehicles/catalogue, jobs, bookings, estimates and lines, requisitions/returns, labour, bills/category tax and available warranty/fleet records together.
- Map verified legacy keys with an import namespace and idempotent upserts; report duplicates/conflicts instead of overwriting existing records.
- Preserve source stored invoice amounts. Do not recalculate old invoices or enable parts VAT.
- Use the real Kia Plaza branch in the target if it exists; do not guess a branch ID.
- Produce a dry-run preview with source counts, mapped/skipped/conflicting records and report reconciliation numbers before applying a target transaction.
- Do not fabricate claims, snapshots, fleet groups or delivery targets absent from source data. Use the separate synthetic QA fixture to test flows the legacy data cannot cover.
- Verify M1–M10 against imported source totals and record the chosen date range in the frontend walkthrough.

These constraints are prepared; the importer is deliberately not implemented against guessed column names while source access is unavailable.

## Supplied inspection reviewed — 14 October 2026

The supplied `kia-plaza-monthly-source.json` contains schema, counts and three sample rows per table. These samples are unrelated and cannot seed connected report workflows accurately. The main labour tables are `joblaborhead` and `joblabordetail`; category tax is in `jobfatax`, and fleet membership is in `CorporateCustomerVins`.

Run `server/prisma/legacy/export-monthly-report-cohort.ps1` with the PowerShell extension on the LAN-connected machine. It prompts for credentials and writes `kia-plaza-monthly-cohort.json` to Documents. By default it selects the latest source job month, up to 100 initial jobs and 100 bookings, plus their related records. Optional `-FromDate yyyy-MM-dd -ToDate yyyy-MM-dd` selects another period. It performs SELECT queries only, excludes employee salary fields, and marks capped selections and partial vehicle history explicitly. PowerShell parsing and SQL quote/empty-predicate checks passed; live queries still require LAN access.

Return the cohort JSON for verified mapping and an import dry run. Target database connectivity must also be restored before applying data. No migrations or target writes have been performed. The exporter is ready; the importer and real-data reconciliation remain pending.

## Connected cohort received — 14 October 2026

Reviewed the July 2026 cohort: 104 jobs, 100 bookings, 75 bills (74 active), 140 requisition part lines, 86 labour lines and 64 estimates. All ten checked billing/requisition/labour/estimate/catalogue joins match, and seven checked parent keys have no duplicates. Source active bill total is NGN 7,422,930. This is a capped sample (177 matching period jobs, 166 bookings), not a complete monthly reconciliation. No warranty claims were exported.

Aggregate evidence is in `issue-79-kia-plaza-cohort-summary.json`. The raw export remains outside the repository. The offline validator `server/prisma/legacy/validate-monthly-report-cohort.cjs` checks format/counts, composite joins, duplicate keys, flag frequencies and stored amounts. Valid export, orphan, count mismatch and duplicate detection checks passed.

Read-only target connection checks failed both inside and outside the sandbox at 209.74.93.26:5432. Await restored target access and verified source meanings for cashinv I/Z and taxcategory A/B/C. No target import, migration or writes performed. Do not interpret these flags from payment status or invent historical VAT snapshots.

## User clarification — local-network target and deferred flag mappings

The user confirmed that target access is restricted to the local network. Do not repeat external connection attempts until connectivity changes. The seed must run from a machine on that network or use a confirmed reachable local endpoint.

At the user's request, legacy flag meanings remain a TODO comment. Preserve raw `cashinv` I/Z and `taxcategory` A/B/C; do not guess CASH/CREDIT, exempt status or VAT categories. A future verified seed mapping can populate those fields. Until then, billing-type/category coverage cannot be claimed as validated. No seed has run.

## LAN seed script ready

Run from the repository's `server` directory on a machine that can reach the development database. It uses `server/.env` (or an existing DATABASE_URL environment variable). Check that this points to development before applying anything.

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
node prisma/legacy/inspect-monthly-report-target.cjs
```

Use the existing Kia Plaza branch ID from that output. The seed never creates a branch or guesses its ID. Apply the issue migrations and regenerate the client if they are not already applied:

```powershell
npx prisma migrate deploy
npx prisma generate
```

Dry run, replacing the placeholder with the actual branch ID:

```powershell
.\prisma\legacy\run-monthly-cohort-seed.ps1 -BranchId 'KIA-PLAZA-BRANCH-ID'
```

After reviewing create/skipped counts, apply:

```powershell
.\prisma\legacy\run-monthly-cohort-seed.ps1 -BranchId 'KIA-PLAZA-BRANCH-ID' -Apply
```

The default input is Documents/kia-plaza-monthly-cohort.json; override with `-InputPath`. Record creation and target conflict checks are transactional. Existing unique-key collisions stop rather than overwrite; unchanged deterministic import IDs are skipped on repeats. An edited import record stops reruns. The script prints aggregate counts, never individual customers. It leaves settings/VAT activation, accounts, stock movements and document sequences unchanged.

Offline validation against the supplied cohort passed: Prisma field/required-field checks, stable unique IDs, repeatability, unresolved mapping preservation and excessive-return rejection. Planned records: 143 customers, 156 vehicles, 8 service types, 99 bookings, 104 jobs, 159 parts, 75 invoices, 226 job charge lines, 200 invoice lines, 64 estimates and 647 estimate lines. One booking is skipped for missing related data.

Live database execution is untested here because LAN connectivity is unavailable. Source flags I/Z and A/B/C remain TODOs. Bills preserve stored total/tax/outstanding/rounding but do not populate unverified component totals or VAT category snapshots. Parts remain UNCLASSIFIED; billType remains null and legacy bill-type fallback is not source-validated. Net part quantities use stored qtyissued minus qtyreturned; separate return history is not recreated. Job labour is imported as charge lines without staff assignments. Estimate approval and booking completion flags are not inferred. Corporate assignments and warranty snapshots/claims are excluded. This seed supports testing connected sample workflows, not final financial/category or warranty parity. Select 1–31 July 2026 and the chosen branch.

## Migration recovery — 19 October 2026

Fixed the Engineer role INSERT in 20261014110000_monthly_report_dimensions: Role.updatedAt is required without a database default, so raw SQL must supply CURRENT_TIMESTAMP explicitly. Prisma Client @updatedAt behavior does not apply to migrations. This migration uses BEGIN/COMMIT; a failed connection transaction rolls back its changes.

On the LAN machine, after using the corrected migration file, run from server:

```powershell
npx prisma migrate resolve --rolled-back 20261014110000_monthly_report_dimensions
npm run db:prepare
```

Do not resolve it as applied: its schema and role changes still need execution. Do not roll back the already successful framework migration. If deployment fails again, capture the failed row logs from _prisma_migrations to identify the first SQL error. Live migration validation unavailable here: target is LAN-only and local Docker engine is stopped.

## Live seed runner improvements — 19 October 2026

Batched target conflict checks and inserts to reduce network round trips while retaining one serializable transaction and create-only behavior. Populate customMake/customModel from the source identity for vehicles without catalogue links. Skip fully returned/zero-net part charge lines, as JobCardLine requires positive quantity. Offline checks now cover both database constraints.

Read-only post-import verification compares every planned stored field and reconciles active bill totals:

```powershell
node prisma/legacy/verify-monthly-cohort.cjs "$env:USERPROFILE/Documents/kia-plaza-monthly-cohort.json" 'e0427a77-117d-4719-b952-fb5a89cb7ef1'
```

The live runner also supplies standalone-estimate customer identity from the exported vehicle owner and uses namespace-based UUIDv5 IDs, so report UUID filters accept seeded service/vehicle IDs. Prior failed/interrupted attempts were atomic and rolled back.


## Import completed and verified ? 19 October 2026

Applied to existing KIA PLAZA - KP in danagroup_danamotors_dev. Stored fields match the planned data, allowing only machine-precision double differences; a one-kobo difference is rejected. The database marks the 11 zero-value active bills Paid. All 74 active bills total NGN 7,422,930, matching source. A repeat dry run creates zero records.

Final counts and skipped records are recorded in `issue-79-kia-plaza-import-verification.json`. One incomplete booking and three fully returned/zero-net part lines were skipped. Stock, accounts and settings were not changed by the seed. Use branch KIA PLAZA - KP and July 2026 for sample report testing. Historical limitations in the preceding sections still apply; no complete-month financial/category or warranty parity is claimed.
