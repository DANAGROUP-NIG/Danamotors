# Flexible job advances

1. Preserve existing feature-branch edits; extend receipt/job links with an additive migration and immutable receipt snapshot.
2. Require a positive eligible advance for every transition into In Progress, independent of the suggested percentage.
3. Reserve job advances against other allocations; support multiple receipts and protect edits/reversals.
4. Apply advances atomically to the final invoice without recording cash twice; preserve normal billing/payment/delivery states.
5. Add job advance summary, receipt capture/linking and printable advance details to existing frontend flows.
6. Run focused finance/workflow/UI regressions, typechecks, lint/build; document local database validation limits.

## Progress
- Analysis: existing receipts support unallocated advances; job deposit link is singular and checks a minimum percentage. Billing currently does not apply deposits. Existing user edits in job creation, billing and money helpers will be preserved.
- Safety: working on existing feature branch DevPastey. No non-local database writes. No new dependencies.
- Milestone: additive receipt/job links and legacy backfill written; Prisma client generated locally. Flexible receive/link flow, immutable snapshots, receipt print, work gate (including automatic rework), final-bill allocation and reserved-credit protection implemented. 79 focused tests passed before final coverage additions. No database migration executed.
- Milestone: backend and frontend typechecks and scoped frontend lint passed. Receipt snapshots preserve their original estimate basis; later invoices apply advances without generating another receipt. Tally export uses a stable advance receipt reference, offset by the final sales bill, regardless of export order.
- Policy: every move into In Progress requires at least NGN 0.01, including rework and zero-percent estimates. Only confirmed cash/POS/transfer receipts count. Cheques remain excluded until a clearance workflow is approved (TODO(confirm)).
- Accounting safeguard: job advances are immutable; cancellation requires replacement funds while work is active and an accounting reversal once the related bill is exported. Excess remains customer credit. Applying excess to an already exported bill/note is blocked until a dedicated Tally adjustment voucher is implemented (TODO(confirm)); allocation before export is supported.
- Validation milestone: both typechecks and scoped ESLint passed; all 33 frontend tests passed; focused billing, advances, work-gate, receipt reversal, visibility and Tally checks passed. The first production build hit the unconfigured Node shim in child processes; retry uses the existing Node installation on the process PATH without changing machine configuration. Full backend suite running with integration URLs disabled and a localhost-only fallback connection.
- Production build remains blocked by the existing NVM launcher error in Turbopack CSS worker processes. Attempts: normal explicit Node executable, process PATH preferring Program Files Node, and process PATH plus direct installed NVM Node. All report No active Node.js version is configured. Stopped build retries; no machine-wide Node configuration or application build configuration was changed.
- Review correction: moved advance capture out of the estimate-only panel so authorized receipt staff can receive advances without estimate-line access. Payment summaries and receipt details keep independent financial permissions. The first full backend run exposed stale receipt mocks in customer-credit tests; those mocks were updated for the new reservation checks and the failing file is being rerun.

## Review and rollout
- Receipt creation: POST /finance/receipts with advanceJobCardId, required idempotencyKey, positive amount, SERVICE_PARTS category and no invoice allocations. Retrying identical details returns the original receipt.
- Existing receipt linking: POST /service/job-cards/:id/deposit accepts fully unallocated, active, non-cheque service receipts for the same customer and branch. Multiple receipts may be linked; another job cannot consume the same receipt.
- Job detail returns canStartWork and a permission-scoped advanceSummary plus receipt history. The workspace enables capture independently of estimate-line visibility and disables Start work until funded. The server is authoritative for both manual and automatic In Progress transitions.
- Billing applies reserved receipts oldest first in its transaction. Invoice totals/taxes remain full values; outstanding/status reflect applied money. Final balance receipts use the existing invoice payment flow. Billed denotes invoice issuance; Paid denotes zero balance; delivery retains existing payment/approved-credit checks.
- Print route: /finance/receipts/:id/print. New receipts retain the original estimate version, amount, cumulative advance, percentage and estimated balance snapshot. Legacy links are backfilled without inventing historical snapshots.
- Migration: server/prisma/migrations/20261110120000_flexible_job_advances/migration.sql. This is additive and includes legacy deposit links. It has NOT been applied to a database. Existing startup schema checks will require the migration before serving the new client.
- Local integration test is included and restricted to an explicitly supplied localhost TEST_DATABASE_URL. It uses rollback-only fixtures to exercise receipt retries, reservations, final allocation and balance payment. It has not run because no disposable local database was supplied; remote integration URLs were disabled during verification.
- No role changes, new dependencies, dev server, browser run, screenshot, push or PR. Existing user edits to job creation, billing and money helpers were preserved.

## Final verification
- Final affected backend run: 17 suites / 147 tests passed; 1 localhost PostgreSQL integration test skipped (no disposable local database supplied). Includes finance, receipts/reversals, credit, Tally, manual/automatic work gates, permissions, API documentation and schema checks.
- Broader run: 93 suites / 1,139 tests passed, 25 suites / 180 tests skipped, then stopped on the new retry-key assertion because validation was edited during that run. This run was not fully green. The final stable affected run above includes that assertion and passed. No further full-suite rerun was performed.
- Frontend regression run: all 33 tests passed. Final scoped lint, backend/frontend typechecks, backend compilation, editor diagnostics and git diff --check passed.
- Frontend production build: BLOCKED by the existing NVM launcher in Turbopack child processes after three attempts. Application source checks passed; no machine runtime or build configuration was changed.
- Migration and real-database validation remain pending review and a disposable LOCAL database. No database writes or external side effects were performed.
