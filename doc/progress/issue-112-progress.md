# Issue 112 progress

- Plan approved. Slice 1 covers the CSI attribute, response and card masters on `feat/issue-112-csi-masters`.
- Legacy master seeding awaits the verified export. Survey generation, responses and reports are outside slice 1.
- Implemented the three master screens and API, branch scoping, decimal validation, card revision snapshots and master audit entries.
- Verification passed for seven validation tests, one localhost API integration test, both TypeScript checks, scoped client ESLint, local migration and rollback rehearsal, and HTTP smoke checks for all three master routes.
- Interactive visual review remains outstanding. The browser host was unavailable and approval for the native browser fallback timed out.

## Draft PR summary

## Slice 2 plan: card generation and printing

1. Reuse the existing CSI API, immutable card revisions, branch scoping and role seed. Add an issued survey per delivered job with immutable job/contact details and an additive migration.
2. Reuse PageHeader, Field/inputCls, Button, Badge, DataTable, DateInput, branch store and Lucide icons. Add a generation screen, hook and questionnaire print view; keep retrieval in hooks and card selection in tested pure functions.
3. Cover loading, empty with next action, retriable error, field validation, disabled selection, success and permission denial. Stack filters on mobile; allow the existing table scroll container; print one questionnaire per job.
4. Filter delivered jobs by Lagos job-date range, job numbers, service type, model, dependent variant and registration; generate selected jobs atomically with duplicate protection and audited reprints.
5. Select active card revisions effective on the job-opening date; use the shared accidental category. TODO(confirm): reject equally applicable cards on the same effective date instead of choosing one arbitrarily. Scoring, responses and reports remain later slices.
6. Run focused tests, typechecks, scoped lint and the mandatory UI scan. Attempt local visual verification without remote database writes; record any environment blockers and unverified states explicitly.

Recon: existing CSI masters already use the shared table, fields, badges, toasts and branch store; the invoice/receipt views provide print patterns. Use existing responsive spacing, border/background/foreground tokens and Lucide icons. No new dependency or design system.

## Slice 3 plan: responses and reports

1. Reuse the issued revision and job snapshot for response entry; use ModalFame with accidental-close prevention, existing fields/date controls and inline validation. Cover loading, error/retry, read-only access, disabled saving, corrections and success feedback; stack details and controls on mobile.
2. Store all answers with decimal scores and a versioned audit of corrections. TODO(confirm): proposed formula and satisfaction bands; safe default requires every answer and assigns no unconfirmed bands.
3. Register all three CSI reports in the existing report framework, using its filters, lookups, print and Excel pipeline. Use stored snapshots, reject oversize results and enforce separate report permissions.
4. Validate focused score/audit/branch/permission/report tests, both typechecks, scoped lint and UI source scans. The browser helper could not retain a reliable local page view; desktop/mobile, keyboard/contrast and print/export visuals remain unverified.

## Continuation status

- Implemented generation, immutable issuance/reprints, response entry/corrections and all three framework report registrations. No new dependencies and no database writes.
- Both additive operational migrations are written but unapplied. Legacy seeding awaits verified master exports. Business formula, bands and grants remain explicit TODO(confirm) rollout items.
- The generation route compiled and returned HTTP 200 on the existing local Next server. No application server was stopped. Integrated browser tools were unavailable; native Computer Use navigation did not yield a stable local app view. No successful UI screenshots were captured.
- Database integration coverage now includes concurrent issuance, duplicate retries, branch/role isolation, immutable Unicode question snapshots, response scoring and competing corrections. It remains skipped because no disposable localhost TEST_DATABASE_URL is configured. Non-local database URLs were not used.
- Final affected checks: 5 backend suites / 27 tests passed; 1 local database integration test skipped. Both frontend/backend TypeScript checks and scoped frontend ESLint passed. No full-suite or production build run.
- All five new routes compiled and returned HTTP 200 on the existing local frontend: generation, response entry and the three reports. This is a compile/HTTP smoke check, not an authenticated workflow or visual verification.
- Visual limitations: desktop/mobile layout, focus/keyboard behavior, contrast, paper/PDF pagination and Excel appearance remain unverified. No claim of completed visual QA. Currency is not displayed by these CSI screens; Unicode database round-trip/print checks are included in the pending local integration/visual work.

## Permission follow-up, 24 November 2026

- First committed the completed CSI implementation and evidence as `ed4bc08` as requested. The permission follow-up is separate from that commit.
- Added the missing explicit Admin grants. Consolidated canonical CSI full/read/operator groups in ROLE_PERMISSIONS while retaining WorkshopManager/Auditor read-only and CCU generation/response access. No new cross-branch grants.
- Added the missing normalized ServiceManager frontend role and workshop fallback entry. Centralized eight CSI identifiers and reused them in navigation, route guards, feature access and report registrations.
- Added focused API-guard/seed-idempotency and frontend/backend parity tests. Existing live role records are not updated automatically; role seeding and session refresh are deployment steps. No database writes are part of this follow-up.
- Validation: 16 role/seed checks, 129 existing role/workflow regression checks and two frontend parity tests passed. Backend/frontend typechecks, scoped frontend ESLint and whitespace checks passed. Frontend changes replace existing identifiers with shared constants and recognize ServiceManager; no labels or layouts were changed.

### Roles settings catalog correction

- Root cause: Roles settings reads persisted Permission rows. Source constants and seed defaults did not register CSI actions on an existing database. The earlier seed-only deployment guidance is superseded by the additive permission migration.
- Added `20261124140000_csi_permissions`: registers eight actions and adds the canonical grants to existing built-in roles. It preserves existing IDs, descriptions and custom role assignments; it does not reset roles or grant access to unrelated built-in roles.
- Grouped all eight actions under Customer satisfaction (CSI). Fixed nested permission labels so read and update actions are distinct. Reused the existing PermissionGrid checkboxes, loading skeleton, Lucide expand control and Tailwind tokens; no new UI components or dependencies. Existing loading, error, selected/disabled and permission-denied behavior is unchanged.
- Validation: 17 focused backend tests and three frontend tests passed, both TypeScript checks and scoped ESLint passed. Executed the SQL twice against disposable localhost tables in a rolled-back transaction: all 15 built-in role grant sets match ROLE_PERMISSIONS and custom grants/permission metadata survive. Stopped the disposable database afterwards.
- Deployment remains pending for the configured application database. Apply pending migrations, reload Roles settings, then refresh staff sessions after assignments change. No non-local database was written. No commit or push performed for this correction.
- No browser run for this label/catalog correction. Desktop/mobile wrapping, keyboard interaction and rendered settings states were not visually reverified; the existing layout and controls are reused.
- Final added-source scan passed all eight checks for pictographs, replacement characters, mojibake, long dashes, hard-coded colors/pixel utilities, browser dialogs and missing-value placeholders.

## Follow-up verification, 24 November 2026

This milestone supersedes the earlier skipped-database and unavailable-browser results above.

- Created a fresh, isolated localhost PostgreSQL cluster using the installed PostgreSQL 18 tools. Applied the complete migration chain, including both CSI operational migrations. No configured or non-local application database was used.
- Corrected the integration vehicle fixture to satisfy the existing model-identity constraint. Extended the real API test to cover all three reports, average/formula consistency, inactive historical lookup options and branch isolation. Final result: six suites, 28 tests passed, none skipped.
- Rehearsed removal of the new operational objects inside a transaction and rolled back. Survey and answer rows were preserved.
- Used an isolated headless Chrome profile with intercepted, synthetic API data. Captured desktop/mobile loading, filled, empty, error, validation, saved and permission-denied states. Verified native modal Tab trapping, visible focus, backdrop protection, Unicode save/read-back and sampled 4.76:1 text contrast.
- Visual fixes: muted disabled filters; wrapped mobile empty states outside wide result tables; explicit CSI denial copy; visible average-score summary cards and matching Excel total keys; compact questionnaire print spacing with row/signoff break protection.
- The long 29-question fixture generates a two-page A4 PDF. Excel workbook score/percentage/average values match the rendered report. Manual paper/PDF glyph inspection and desktop Excel appearance remain release checks.
- Evidence: [screenshots, PDF and workbook](./issue-112-visual/README.md). No new dependency, push or commit. Business confirmation and verified legacy seeding remain pending.
- Final source scan passed across 10 new UI files and added lines in six shared files: no new emoji/pictographs, replacement characters, mojibake, long dashes, literal missing-value placeholders, hard-coded colors/pixel utilities or browser alert/confirm/prompt calls. UTF-8 source round trips passed; readable status/fallback mappings were reviewed.
- Both typechecks and final scoped frontend lint passed without warnings after the guard dependency cleanup. The two new migrations were validated locally; the configured application's migration/role rollout remains untouched. All temporary verification listeners were stopped; the existing local Next server was left running.

Add CSI masters with branch-scoped access and immutable card revisions.

- Attribute and response maintenance, branch-unique codes, deactivation and used-record protection are covered by the validation and integration tests.
- Card composition, exact decimal totals, retained historical descriptions and marks, and stale edit protection are covered by the same suites.
- Role and branch isolation are covered by the API integration test. Each master route compiled and returned HTTP 200 through the local app.
- Deploy the additive migration and apply the role seed. Review the three screens at desktop and mobile sizes before rollout. The verified legacy master export is still needed for business seeding.
