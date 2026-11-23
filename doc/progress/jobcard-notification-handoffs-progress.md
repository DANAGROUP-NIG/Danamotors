# Jobcard notification handoffs

Branch: `feat/jobcard-notification-handoffs`.

## Plan
1. Restore Node using the installed 22.23.2 binary; preserve existing edits.
2. Build and test pure routing, legacy normalization and timer policy.
3. Add a transactional outbox, durable failures and delivery audit with an additive migration.
4. Route legacy lifecycle/reminder paths centrally, preserving parts/warranty behavior.
5. Run affected tests, backend checks and a disposable local staging database flow if available.
6. Record verification limits and final matrix.

## Audit milestone
Existing lifecycle sends are scattered across workflow/workshop services; billing and implicit reopen transitions are missed. Assigned QC also broadcasts to QC-capable staff. Assignment keys suppress A → B → A. No actor exclusion, empty-role fallback, durable failures or status-age escalation exists. Delivery reminders are optional and target advisor/technician/customer. Full audit table was delivered in chat before implementation approval.

No workflow/permission changes authorized. Existing `notification.service.ts` SHA256: `C4F599B2986805E7B0B9AA2BEF3859AA599B072D68F963E2B022BFD5D4DEE8A9`.

## Decisions
- Capture notification events with a deferred database trigger so every committed writer is covered, including nested estimate/labour/billing changes. Rolled-back changes leave no outbox rows.
- Central routing owns lifecycle delivery, baseline in-app audit, failure records and reminders; existing parts/warranty sends remain separate.
- TODO(confirm): working hours default to 08:00–18:00 Monday–Friday, Africa/Lagos; configurable centrally. Timers use elapsed hours, with delivery deferred outside working hours.
- Channel preferences/quiet hours are explicitly deferred by the user.
- Never write to a non-local database. Any staging verification must use a disposable localhost database.

## Implementation milestone
- Pure routing and worker tests passed before replacing old lifecycle send logic.
- Added deferred outbox capture, atomic in-app delivery/audit, role fallback and durable failure/Admin alert handling. Added inspector reassignment and QC-reset handoffs to avoid losing those action changes.
- Removed only obsolete lifecycle sends; separate actual parts and warranty paths remain. All actor-bearing parts/labour/estimate writers propagate notification actor context.
- Local PostgreSQL 18 staging on localhost:55439 accepted the exact additive migration. Six integration cases passed, including rollback safety, full lifecycle/rework/rebilling, fallback, shortened timers, injected send failure/replay, and nested-history actor exclusion. An additional inspector/QC-reset case is being verified.
- Actor lookup uses current-transaction row identity (`xmin`) after a staging test exposed unreliable timestamp-based matching for nested writes.
- Typecheck/lint, build, schema validation and whitespace checks passed at this milestone. Full backend suite and final affected checks are in progress.
- Original `notification.service.ts` SHA256 remains unchanged. No new dependencies, workflow changes, permissions changes, commits or pushes.

## Final verification milestone
- Final focused run: 6 suites / 68 tests passed, including 7 local staging cases. Added explicit inspector reassignment, actor-bearing QC reset and UTC timestamp assertions.
- Full backend run: 100 suites / 1,167 tests passed; 26 suites / 186 tests skipped. The policy suite encountered an old in-flight compiler snapshot while its event type was being extended; its isolated cache-free rerun passed all 31 tests. No second full-suite run.
- Final build passed. Typecheck/lint, schema validation and whitespace checks passed.
- Broader existing workshop service integration remains blocked by its stale estimate approval fixture (missing expected version/hash). Business rules were not changed to accommodate the fixture. Actual API/UI E2E and hosted staging remain unverified.
- Existing Prisma DLL is locked, but matches the bundled engine hash; generated client types/runtime passed compilation and local DB tests. Normal generation should run with backend processes stopped for deployment.
- Full audit, final matrix, changed-file list, settings and limitations are in `doc/jobcard-notification-router.md`.
- Disposable localhost database was stopped and generated test artifacts removed. Final SHA256 confirms original service edits are unchanged; invoice edits remain preserved.
