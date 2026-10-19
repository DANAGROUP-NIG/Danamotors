# Issue #79 progress -> audited 19 October 2026

Branch: `issue-79/audit-completion`. The audit starts at `c882afd`. Local commits only; nothing pushed, merged, posted or closed. No non-local database writes were performed during this audit.

## Current status

The ten report routes and APIs are implemented. The actionable audit gaps have been fixed and checked against synthetic localhost data. Business decisions and exact legacy SQL parity remain open; this is not a production sign-off.

| Area | Status | Evidence |
|---|---|---|
| Framework, ten routes, validation, branch scope | DONE | `reports.routes.ts`, `report.validation.ts`, monthly config and shared components; route tests; frontend/server filter-contract QA |
| M1 tax register | DONE | Legacy photo layout is default; category/VAT layout selectable; stored VAT reconciles to annexure, including explicit unknown residuals; modes/type/order covered |
| M2 booked/availed | DONE | Linked bookings take priority within grace; walk-ins separate; pure matching/summary tests |
| M3 estimate/job | DONE | Part IDs and canonical operation codes; stored actual amounts, net returns, standalone shortage groups |
| M4 unbilled parts | DONE | Issued minus returned minus active billed quantities; exact links also deduct non-customer lines |
| M5 corporate bills/master | DONE | Current vehicle fleet grouping; Admin management and reviewed VIN workbook upload; empty master handled |
| M6/M7 deliveries | DONE | Canonical and legacy models, model/service grids with collision-safe keys and row/column totals |
| M8 warranty attendance | DONE | Opening snapshot, or coverageFor at historical date/mileage marked calculated; missing data stays UNKNOWN |
| M9 warranty parts | PARTIAL: business decision | WARRANTY-only, claim/billed filters, per-vehicle subtotals and uncapped searchable picker done. Undefined job-type dimension remains hidden pending confirmation |
| M10 history | DONE against explicit issue sections | Eleven section groups, chosen options, schemas for empty Excel sheets, section page breaks, vehicle-page action, PDI gate and portal privacy tests |
| Parts VAT/Tally | DONE, switch OFF | Category/rate/exemption/discount/customer-only tests; invoice persistence; identical OFF calculator output; combined VAT mapping tested |
| Permissions/indexes/migrations | DONE locally | Default role grants and four indexes verified in code; all 57 migrations deployed on disposable PostgreSQL 18.4; all five report SQL migrations replayed |
| Exact legacy-query parity | UNVERIFIABLE | `vehicle_history_card.sql` and `workshop_bill_report.sql` absent |
| CI configuration | DONE | Jest failures now fail the job. Hosted CI was not triggered |

Detailed before/after classifications, bugs and verification limits: [audit](../testing/issue-79-audit.md). Complete implementation inventory: [changed files](issue-79-changed-files.md). Prepared but unposted [issue summary](../testing/issue-79-summary-comment.md).

## Independently executed checks

Initial audit backend results: 58 default suites / 720 tests pass (15 DB suites / 98 tests skipped). With local DB enabled: 71 suites / 815 tests pass, two stock-transfer notification assertions fail, one catalogue suite/test stays skipped. These counts supersede historical notes. Backend typecheck and build pass. Frontend ESLint has zero errors and the production build generates 80 pages. The report integration chain runs against the disposable database on `127.0.0.1:55479`, not the configured LAN development database.

The complete DB-enabled suite has unrelated stock-transfer notification failures; the report chain passes. Do not describe the entire DB suite as green. See audit for exact final suite/test counts and failures.

All ten real shared output components were rendered from synthetic local report responses. Screen and print captures were inspected; 390px checks assert document width is 390px while tables scroll internally. Real XLSX handlers were invoked and read back, checking identical rows/columns and eleven history sheets. PDFs have the specified A4 orientations and history has eleven pages. This is component/browser QA, not an authenticated end-to-end role-matrix session or representative production performance test.

## Business input and TODO(confirm)

- Enable parts VAT only after business approval; default stays OFF. Confirm imported exemption/tax flags before using the imported parts for new VAT-enabled billing.
- Historical source cash/credit flags `I`/`Z` remain unclassified. Reports never infer historical type from payment status or later credit approval. New bills retain the existing explicit approved-credit rule.
- A/B/C canonical category meanings follow the issue (SPARES/OIL/ACCESSORIES); verify source-import provenance before remapping existing imported records. No existing invoice VAT amounts or breakdowns were backfilled by this audit.
- M9 job type has no agreed definition or recorded dimension. Do not substitute service type or modify Job Card Opening here.
- Delivery targets need an agreed owner and period. None are invented.
- Fleet reports use current vehicle membership; historical membership is not recorded. Confirm whether membership history is required.
- Legacy SQL files are required for exact section/query parity. Free-service sequence and missing historical tax IDs are not invented.

Code comments are beside the relevant billing classification, settings, delivery, warranty-parts and corporate queries. Existing import scripts preserve raw legacy flags. Counter sales, #75 standalone-estimate UI and Job Card Opening are outside this audit.

## Migration and seed history

This audit replayed migrations only on a newly initialized local cluster under ignored `.audit-local/pg`; all five report migrations replay successfully after deployment. No LAN migration deployment, seed, enrichment or backfill was performed. The snapshot migration now guards ADD COLUMN with IF NOT EXISTS; a previously deployed checksum differs, so reconcile migration history through the normal deployment process before a future rollout. No migration-history row was edited here.

Earlier progress notes recorded a 19 October LAN cohort seed and snapshot enrichment (75 invoices, 74 active, active stored total NGN 7,422,930). Those are historical claims supported by existing files in `doc/testing/issue-79-*verification.json`; they were not rerun or independently confirmed against that target during this local-only audit. They replace earlier historical ?seed blocked? statements, which are no longer current status. Source flags and exact legacy report parity remain unresolved despite seed success.

For local manual testing, use the [walkthrough](../testing/issue-79-frontend-walkthrough.md), explicitly setting a disposable local DATABASE_URL first. Do not run any seed against a non-local database under this task.

## Output-photo follow-up (19 October)

M1, M2, M4, M5, M7 and M9 now use the supplied legacy output columns across screen/print/XLSX. M7 includes the free-service breakdown and separately counted accidental deliveries. Missing historical dealer rates and requisition numbers remain blank. Only #79 reports are included; the two additional photographed report types were explicitly excluded by the user. See doc/reports.md for the full column contract. This supersedes the initial audit decision to default M1 to CATEGORY.

Follow-up verification: 59 default suites / 724 tests pass (15 DB suites / 98 tests skipped); all 66 report tests passed with the local database enabled, and the chain was rerun after the final assertions. Backend typecheck/build and frontend lint/build pass. Ten real component XLSX exports and true 390px/print captures pass; affected print captures inspected. No non-local database writes. The earlier full DB-suite stock-transfer failures were not rerun for this column-only follow-up.

## Scope correction requested by user

Issue #79 supersedes the output-photo follow-up above. Removed duplicate top metric cards, M7 free-service breakdown/custom buckets, M5 extra customer/type subdivisions, and the extra M1 layout selector. Restored the issue column sets and inclusive service-type grid totals. Required M2/M4 summaries and subtotals/grand totals remain. No database writes.
