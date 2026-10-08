# Issue #77 delivery log

Source: https://github.com/DANAGROUP-NIG/Danamotors/issues/77
Dependency reviewed: issue #65 (closed). Legacy screenshots are workflow references; later screens will use the current app design.

## Phase 1 — credit application outstanding correction

### Plan and scope

Fix credit approval and request checks in credit.service.ts, correct the dashboard outstanding aggregate, add colocated service regression tests, and update route Swagger and billing guidance. No schema, endpoint, permission, or frontend changes are required. Existing portal cache invalidation includes invoices and the dashboard.

### Decisions and assumptions

- Invoice.outstandingAmount is authoritative; receipts need not have Payment rows.
- Preserve the current Credit Payment and USED credit transaction until phase 2 unifies credit records.
- Use receipt-style Paid / Partially Paid settlement; overdue rules remain phase 5.
- Lock and recheck Pending before financial writes; decline conditionally updates Pending to avoid overwriting concurrent approval.
- Audit customer decisions with customer/application/invoice IDs in details; customer IDs are not staff User IDs.
- Correct the dashboard's full-total sum and standalone-invoice branch scope because phase 1 acceptance requires accurate outstanding totals.
- No historical data repair here; phase 5 previews and audits repairs.

### Acceptance evidence

- Approval reduces outstanding and sets Paid / Partially Paid: credit.service.test.ts (partial, full settlement, prior receipt allocation, fractional currency).
- Overpayment, duplicate approval, insufficient credit, cancelled invoices, and foreign customers are rejected before financial writes.
- Serializable transaction, row-lock queries, bounded rollback retries, non-replayed timeouts, and atomic audit writes have regression coverage.
- Dashboard total uses stored outstanding, excludes cancelled invoices, includes overdue amounts, and scopes standalone invoices correctly: dashboard.service.test.ts (3 passed).
- Phase 1 acceptance behavior: implemented. Remaining issue acceptance criteria belong to phases 2–5.

### Validation

Commands ran through Node child_process because the unified terminal could not initialize. The installed runtime is C:/Program Files/nodejs/node.exe (v24.16.0); the PATH node shim has no configured NVM version. All CLI paths below are relative to the indicated project directory.

| Check | Command | Result |
| --- | --- | --- |
| Backend typecheck | server: node node_modules/typescript/bin/tsc --noEmit | Passed, including final recheck |
| Backend build | server: node node_modules/typescript/bin/tsc | Passed, including final recheck |
| Backend suite | server: node node_modules/jest/bin/jest.js --runInBand | 29 suites, 412 tests passed; 6 suites / 35 tests skipped |
| Dashboard regressions | server: node node_modules/jest/bin/jest.js --runInBand src/modules/dashboard/dashboard.service.test.ts | 3 passed; added after full-suite discovery |
| Frontend lint | client: node node_modules/eslint/bin/eslint.js . | Passed: 0 errors, 70 existing warnings |
| Default frontend build | client: node node_modules/next/dist/bin/next build | Failed: Turbopack CSS worker invokes unconfigured NVM shim; reproduced after child PATH correction |
| Alternate frontend build | client: node node_modules/next/dist/bin/next build --webpack | Passed: compilation, TypeScript, and 56 generated static pages |
| Swagger | Load src/config/swagger through ts-node; assert decision route, 409 response, and request fields | Passed |
| Patch whitespace | git diff --check | Passed |

The database integration suites skipped because TEST_DATABASE_URL is absent. No database URL or secrets were printed. No production database writes were performed.

### Files

- Backend: server/src/modules/credit/credit.service.ts; server/src/modules/dashboard/dashboard.service.ts.
- Swagger: server/src/modules/credit/credit.routes.ts; server/src/modules/customer-portal/portal.routes.ts.
- Tests: server/src/modules/credit/credit.service.test.ts (16 regressions); server/src/modules/dashboard/dashboard.service.test.ts (3 regressions).
- Documentation: doc/billing.md and this delivery log.
- Frontend and migrations: none.

### Risks and follow-up

- Historical approvals with stale invoice outstanding are not repaired by this phase.
- The separate wallet and hand-edit path remain until phase 2; concurrent legacy manual wallet edits remain an existing limitation.
- Default Turbopack frontend build is blocked by the environment's unconfigured Node shim. Webpack production build passes; no frontend configuration was changed.

### Proposed PR

Title: Fix credit application invoice outstanding and dashboard totals (#77, phase 1)

Approval now reduces the authoritative invoice outstanding in the same serializable transaction as the Credit payment and customer-credit deduction. Fresh row-locked validation prevents over-adjustment and duplicate approvals, conditional decline cannot overwrite approval, and every approval has a financial audit entry. The dashboard sums remaining balances instead of full bill totals. Request/decision Swagger and billing documentation explain the behavior.

Assumptions: retain the existing wallet and Payment records for this independently reviewable phase; historical repair and wallet unification follow later. Settlement status matches the receipt service. Customer actors are identified in audit details rather than a staff User foreign key.

Validation: backend typecheck/build pass; backend suite and separate dashboard regressions pass (415 tests total); frontend lint has 0 errors; webpack production build passes. Default Turbopack build is blocked by the local Node shim. Database tests skipped without TEST_DATABASE_URL.

### Remaining phases

2. Party adjustment, FIFO, wallet unification, opening balances.
3. Party reports and UI, printing, Excel.
4. Debit/credit notes, registers, Tally XML.
5. Recalculation, overdue rules, letters.

Stop after phase 1 per the attached brief; resume phase 2 when the user says continue.

## Phase 2 — party adjustments and unified credit

Plan: extend ReceiptAllocation as the single adjustment store; introduce PartyAdjustmentBatch and PartyNote for opening balances; migrate legacy wallet/approved applications; add account, paged document, FIFO preview, save, reverse and opening endpoints; implement shared adjustment UI and customer Account entry points. No adjustment Tally journal is generated. Validation and acceptance evidence will be recorded as work completes.

### Built

- Generalized ReceiptAllocation into the single dated adjustment store, retaining existing IDs and receipt-entry rows. Added PartyNote openings and PartyAdjustmentBatch source/actor/key/reversal metadata.
- Implemented manual save, bounded editable FIFO preview and Admin reversal. Serializable transactions, stable party/document locks, bounded rollback retries, currency/date/ownership checks and atomic financial audits protect writes.
- Unified available credit across receipt advances and active credit notes/opening credits. Numeric SQL sums avoid binary-float aggregation; Account debit/credit totals use one database snapshot. Customer.creditBalance remains a trigger-maintained read-only compatibility cache.
- Changed customer approval to consume canonical credit documents and reduce outstanding in the same transaction, without creating a second Payment. Disabled the manual wallet edit endpoint and removed its UI.
- Added Admin opening debit/credit capture, numbered by direction and excluded from Tally. Migrated legacy wallets and approved applications with stable legacy keys, existing Payment linkage and a one-time backfill marker.
- Added the responsive paired adjustment workspace, searchable branch-scoped name/code party picker, positive-balance filters, editable amounts, inline errors, sticky totals, retry-safe dates/keys, refresh and reversal reasons.
- Added the customer Account tab, Finance/sidebar links and invoice payment entry point. Adapted staff/portal invoice and receipt-register displays for generalized allocations and scoped credit-cache invalidation.
- Preserved allocation history during receipt edits/cancellation, blocked changes while later batches are active, and moved canonical notes/batches during customer merges. Admin reversal follows original document IDs after a merge.

### Assumptions and decisions

- Legacy wallet balances and receipt advances are preserved as independent credit sources, per the brief. Positive wallet values become opening credits; negative values become opening debits. Review source overlap during snapshot reconciliation rather than guessing a destructive deduplication.
- Wallet openings use the UTC migration cutover date because reliable provenance for the remaining legacy wallet is unavailable. Legacy approved applications use decisionDate with createdAt fallback. Legacy note numbers use the UTC cutover year; new openings use their effective year and separate debit/credit series.
- Preserve existing Float money columns and the invoice settlement statuses for compatibility; new note/batch amounts are Decimal(18,2). Arithmetic uses money helpers and numeric database sums. The existing supported monetary limit is NGN 1e12; FIFO caps a batch before converting its Decimal aggregate.
- Adjustments create no Tally journal and keep tallyPostedAt null. Any involved exported/posted document or batch blocks reversal. Opening balances are excluded from Tally.
- Vendor parties are excluded from lookup and financial entry. The hidden creditor selector belongs to the phase 3 report filters.
- Party/document branch validation applies to new adjustments. Reversal is Admin-only and restores the original IDs after a merge, even when a standalone invoice now derives a different branch from its customer. Receipt/note branch snapshots stay intact.
- The grid paginates up to 100 rows per page (UI uses 25), selections/FIFO are bounded to 200 per side, and the recent-history view shows 20 batches. The reversal API accepts any batch ID.
- Original customer approvals remain decision history when their batches are reversed. A linked legacy Credit Payment is removed atomically on reversal; new approvals never create that compatibility Payment.

### Acceptance evidence

| Phase 2 criterion | Status / evidence |
| --- | --- |
| One adjustment store with debit/credit document sides | Implemented: schema, check constraints, dated ReceiptAllocation writes; party-account.service.test.ts — records canonical pairs and note-to-opening-debit pairs |
| Manual equal-total adjustment updates both balances | Done: service/rule tests cover Decimal currency, overdraw, foreign documents, duplicate selection, date limits, equal/positive totals and audit |
| FIFO oldest date then number, partial last match, editable preview | Done: party-adjustment.test.ts; UI prefill remains editable and save revalidates balances |
| Exactly-once creation and bounded transaction retries | Done: service idempotency, changed-key-details conflict and rollback/timeout tests; receipt-create.test.ts remains green |
| Admin reversal, required remark, no Tally-posted reversal | Done: role/permission tests plus batch/invoice/receipt/note/export guards, duplicate reversal, restored balances, retained rows and legacy Payment cleanup |
| Reuse receipt advances and derive the wallet | Done: numeric sum test; mixed receipt/opening credit approval test; database trigger implementation. PostgreSQL execution is pending a test URL |
| Admin opening debit/credit with date/narration, excluded from Tally | Done: schemas, role gates, numbered/excluded/idempotent opening tests, branch/future-date guards and opening modal |
| Branch access and debtor-only scope | Done: party-account.controller.test.ts and vendor entry guards |
| Account tab, entry points, grids/loading/empty/error/success states | Implemented; frontend lint/build pass. Browser execution against a migrated database remains pending |
| Safe, idempotent legacy backfill | Implemented: transactional guarded SQL, stable keys/IDs, backfill marker, preserved advances, sequence seeding, source checks, audit and read-only preflight. Migration execution/rerun on a snapshot remains pending |
| Swagger and billing documentation | Done: eight new endpoint paths, selection schema, disabled wallet response and canonical approval descriptions verified |

The new PostgreSQL integration test exercises receipt advance reuse, opening idempotency, paired allocations, derived-cache protection, Tally/duplicate reversal guards, receipt cancellation and credit preservation/reversal after a cross-branch merge. It rolls all fixtures back and only runs against an explicitly supplied migrated TEST_DATABASE_URL.

### Files (phase 2)

- Backend additions: server/src/modules/finance/party-adjustment.ts; party-account.validation.ts; party-account.service.ts; party-account.controller.ts.
- Backend integration: finance.routes.ts; receipt.service.ts; finance.repository.ts; job-billing.service.ts; document-number.ts; tally.service.ts; credit/credit.service.ts, credit.controller.ts and credit.routes.ts; customer/customer.service.ts, customer.controller.ts, customer.repository.ts, customer.routes.ts and customer-read-scope.ts; customer-portal/portal.service.ts, portal.repository.ts and portal.routes.ts; shared/constants/roles.ts; prisma/seed/portal.ts.
- Frontend additions: app/(dashboard)/finance/receipts/advance-adjustment/page.tsx; features/finance/api/party-account.api.ts; hooks/use-party-account.ts; components/party-adjustment-workspace.tsx and OpeningBalanceModal.tsx.
- Frontend integration: customer Account tab/card; Finance/sidebar/route guard/API routes; invoice receipt capture/manage hooks and generalized allocation types/displays; receipt register; portal invoice totals/allocations.
- Migrations: server/prisma/schema.prisma; prisma/migrations/20261008120000_party_adjustments/migration.sql; prisma/party-adjustment-preflight.sql.
- Tests: finance/party-adjustment.test.ts; party-account.service.test.ts; party-account.controller.test.ts; party-account.integration.test.ts; customer/customer-read-scope.test.ts; updated credit.service.test.ts and receipt-create.test.ts.
- Documentation: doc/billing.md; this log; doc/issue-77-frontend-testing.md (working source for the final Word walkthrough).

### Validation

Commands use the actual installed Node runtime, as in phase 1. No production database writes or Tally posting occurred.

- Backend: TypeScript no-emit check and build pass. Final Jest: 34 suites passed, 465 tests passed; 7 database-dependent suites / 36 tests skipped.
- Frontend: ESLint passes with 0 errors and 70 existing warnings; Next.js production webpack build passes, including TypeScript and 57 static pages. The existing Windows NVM worker issue still requires the webpack build workaround described in phase 1.
- Prisma: client generation and schema validation pass. No migration was applied; database-backed tests skip without TEST_DATABASE_URL.
- Browser testing remains planned, not executed. See the maintained frontend testing source.

Final permission review: Accountant receives customer:read for the Account tab, with assigned-branch filtering on customer rows/count and ownership checks on detail/nested reads. Global duplicate lookup is unavailable to Accountant. Existing roles retain their previous customer-directory behavior; new finance endpoints enforce their own branch rules. Tests cover foreign/missing branches, own-branch access, Admin access and matching list/count predicates.

Commands: server `node node_modules/typescript/bin/tsc --noEmit`; `node node_modules/typescript/bin/tsc`; `node node_modules/jest/bin/jest.js --runInBand`; client `node node_modules/eslint/bin/eslint.js .`; `node node_modules/next/dist/bin/next build --webpack` with the installed Node directory prepended to PATH. Prisma generation/validation used the installed CLI. `git diff --check` and untracked-file whitespace checks pass.

### Risks and next phase

- Apply migrations and regenerate before deploying/testing this application version. Run preflight, migration and its rerun on a production snapshot/disposable database first; this environment has no TEST_DATABASE_URL.
- Stored outstanding from legacy approvals is preserved, not repaired here. Phase 5 previews/audits corrections; inconsistent legacy reversal is rejected by document balance bounds.
- Historical unspent-wallet provenance and previously deleted receipt allocation versions cannot be reconstructed. Phase 3 reports must document the cutover boundary and retain cancellation timing, using available audit timestamps for legacy receipt cancellation backfill.
- No live browser walkthrough or Tally company import has been executed in this environment. The testing source distinguishes planned frontend checks from automated evidence.
- The final .docx frontend testing/flow guide is requested for completion of the entire implementation. Source steps are maintained now; add phases 3–5 and render/verify the Word document at final delivery.

### Proposed PR

Title: Add canonical party adjustments, advance reuse and opening balances (#77, phase 2)

Receipt advances and opening credits now fund invoices through one dated ReceiptAllocation store. Manual/FIFO adjustment and Admin reversal maintain both balances with serializable locks, retry keys, posting guards and financial audits. The wallet is derived from canonical credits, legacy balances/applications are preserved by guarded backfill, and customer approval uses the same adjustment service. The customer Account tab and paired adjustment UI expose these flows in the existing design.

Assumptions: preserve legacy wallet/advance sources independently; date unknown wallet provenance at UTC cutover; keep existing Float columns/statuses while using Decimal operations; no adjustment Tally journal; bounded preview/history; vendors remain outside scope; repair historical outstanding in phase 5.

Stop after phase 2 per the brief. Phase 3 (party reports, ledger link, print and Excel) begins only when the user says continue.


## Phase 3 — party reports (2026-10-08)

### Delivered

- Added Party Ledger, Party Outstanding, Age-wise Outstanding and Bill-wise Outstanding with paginated rows and totals over the complete filtered result.
- Shared filters support Lagos calendar dates, branch, party, inclusive party ranges, name/code order, Customer/Dealer/FA party status and debtor-only scope. Age/bill reports optionally include net-credit parties.
- Historical SQL views preserve receipt amount edits, cancellation timing and allocation/reversal timing. Ledger includes opening, running and closing balances and neutral matching events. Invoice branch snapshots survive customer reassignment/merge.
- Ageing has five editable, increasing limits (default 30/60/90/120/180) and six bands; Admin/SuperAdmin can save audited defaults.
- Added streamed, snapshot-consistent print and Excel-compatible SpreadsheetML exports. Ledger/bill printing starts each party on a new page. Server cursor fetches 500 rows at a time; browser disk streaming avoids loading a complete large export into memory.
- Added report-specific permission checks for JSON, print and export, assigned-branch enforcement, report navigation and Customer Account → View ledger.
- Aligned receipt edit/cancellation and allocation timestamps; rejected adjustments backdated before the latest balance-changing activity.
- Executed additive migrations against both a fresh database and a populated legacy fixture, including reruns. Corrected previously unexecuted phase 2 dollar-quote and constraint-owned-index defects and added its advance preflight guard.

### Files and documentation

Backend: finance/party-report validation, calculations, service, controller and tests; finance routes/Swagger; party-account and receipt historical guards; role constants and customer validation.

Frontend: report API/navigation/page/settings components; dynamic finance report route; party report settings route; sidebar/layout access; customer status form and ledger link.

Database: schema and 20261008180000_party_reports migration; guarded corrections to 20261008120000_party_adjustments; disposable-only party-report-migration-fixture.sql and party-report-migration-assertions.sql.

Documentation: billing.md records endpoints, historical semantics and export behavior; issue-77-frontend-testing.md maintains the frontend flow/checklist for the final Word guide.

Integration fixture maintenance: warranty/workshop service references now use the canonical selected service type. Workshop preflight identity/stock reads are redirected into its rollback fixture transaction. No workshop/warranty production behavior changed.

### Assumptions and acceptance status

Implemented: four reports, shared filters, dated balances, age limits/default settings, hidden creditors, permissions, branch scope, totals, customer ledger link, print and Excel-compatible export.

Excel output is a real SpreadsheetML .xml workbook, using existing dependencies; users may Save As .xlsx in Excel. Browsers without a file-system streaming API have a 20 MB fallback cap and must narrow larger exports.

Dates use Africa/Lagos. Current party identity/status is used for historical reporting; newly entered backdated documents can intentionally restate historical balances. Missing legacy cancellation provenance uses the migration cutover timestamp. Unknown wallet provenance and previously deleted allocation history cannot be reconstructed. Legacy invoice outstanding repair remains phase 5.

Live browser/Excel/manual print acceptance remains pending. The documented checklist is planned manual verification, distinct from executed automated checks. No production database, deployment, GitHub comment or PR was changed.

### Migration verification workflow

Use a disposable database only. For the legacy fixture: apply the 40 baseline migrations before party adjustments; execute prisma/party-report-migration-fixture.sql; apply phase 2 and phase 3 migrations; run prisma/party-report-migration-assertions.sql; rerun both migrations and assertions. Verified positive/negative wallet backfill, receipt advance, old allocation identity/date, approved legacy application, single backfill audit, retained legacy invoice cache and receipt cancellation audit timing.

A separate empty disposable database successfully applied all 42 migrations with Prisma migrate deploy. Local PostgreSQL 18 ran on loopback port 55477; neither .env nor the application database URL was changed. Test processes received TEST_DATABASE_URL explicitly.


### Executed verification

- Backend: TypeScript noEmit and production compilation passed. Full Jest run with TEST_DATABASE_URL against the freshly migrated disposable database: **539 passed, 1 skipped, 540 total; 43 suites passed**. The skipped catalog integration suite requires its separate CATALOG_DATABASE_TEST=1 opt-in.
- Report tests cover strict filters, permissions (including omitted-kind default), Lagos date boundaries, age buckets, fractional money, opening/running balances, scoped SQL and bounded cursors. PostgreSQL integration verifies adjustments/reversals, retained branch ownership, receipt amount edit/cancellation historical stability and a real SQL cursor.
- Frontend: ESLint passed with **0 errors / 70 existing warnings**. Next production webpack build passed, including TypeScript and the new finance report/settings routes. Default Turbopack retains the previously documented Windows NVM worker issue.
- Prisma generation and schema validation passed; all **42 migrations** applied cleanly to an empty test database. Populated legacy assertions and both additive migration reruns passed.
- Built OpenAPI verification passed: all five party report/settings paths and PartyReportResult schema are present.
- git diff --check and added-file whitespace checks passed. Generated Next metadata was restored to HEAD.
- The isolated PostgreSQL cluster was stopped and its verified workspace cache directory removed after testing.

Commands (server): node node_modules/typescript/bin/tsc --noEmit; node node_modules/typescript/bin/tsc; node node_modules/jest/bin/jest.js --runInBand (TEST_DATABASE_URL and DATABASE_URL supplied only to the child test process); Prisma CLI generate/validate/migrate deploy. Legacy migration fixture, migration reruns and assertions executed with PostgreSQL psql -v ON_ERROR_STOP=1.

Commands (client): node node_modules/eslint/bin/eslint.js .; node node_modules/next/dist/bin/next build --webpack, with the installed Node directory prepended to PATH.

### Risks and next phase

Apply migrations and regenerate the Prisma client before application rollout. Review the backfill against a disposable production snapshot first. Production was not migrated here. Legacy cancellation/history limits and phase 5 cache repairs remain documented; the frontend browser/Excel/print checklist remains to be executed.

Stop after phase 3 as requested in the delivery brief. Phase 4 is debit/credit note forms, registers and Tally vouchers; begin only after the user says continue. Maintain the frontend guide through phases 4 and 5, then create and visually verify the final Word .docx testing and flow walkthrough.

Proposed PR title: Add historical party reports, ageing, print and Excel exports (#77, phase 3).
