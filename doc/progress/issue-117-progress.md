# Issue 117 progress

Plan: M1 permissions and seed regression; M2 permission-based job detail scope; M3 additive version/signature schema; M4 immutable revisions; M5 signed decisions and integrity gate; M6 isolated print; M7 runbook and verification. Commit each milestone locally. Never push or access a non-local database.

- [x] M1 Permissions: 85 role/action and repeated-seed tests passed. Existing job-bill route uses its own permission. System Node executable required because default nvm shim has no active version.
- [x] M2 Job detail scope: two nested-data visibility tests passed; service defaults to no financial access.
- [x] M3 Schema: additive migration; historical versions backfilled; legacy approvals explicitly preserved, new approvals require signatures. Prisma schema validation passed using a localhost placeholder (no database contacted). Initial engine DLL replacement hit Windows EPERM; regeneration subsequently succeeded. No existing process was stopped.
- [x] M4 Revisions: pure revision plan tests passed; existing catalogue validation and shared job lock reused. Create rejects existing scope; revise requires latest source; old values and new scope audited transactionally.
- [x] M5 Signatures: 31 hash/gate/decision tests pass; frontend typecheck passed. Counter pointer canvas adds no dependency, bounded PNG (64 KiB) stored as a private data URL reference because customer documents currently accept URLs but have no upload provider. New unsigned portal decisions are rejected rather than bypassing signatures; portal capture remains deferred. Admin overrides are explicit and audited. Latest-estimate queries select hash evidence without image data to avoid leaking signatures through billing. Prisma generation subsequently succeeded without replacing any user process.
- [x] M6 Print: explicit print projection and component tests pass (including excluded fields, signature/blank lines, superseded marker and denied access); frontend production build passed at milestone gate; lint has 0 errors. Browser pagination/touch device interaction not visually verified. DocumentTerms was absent in this checkout, so added to the same additive migration with branch/company fallback.
- [x] M7 Documentation and verification: final gates passed; billing account runbook and per-criterion acceptance report complete.

Defaults: WorkshopManager creates first estimates and prints, without signing. ServiceManager revises/prints/signs without creating. BillingOfficer remains home-branch only, without estimate access. View-only callers receive operational fields without prices. Remote signatures deferred. Account creation is a runbook only. Existing estimate number/date fields from #79 will be reused.

## Final verification

- Backend: schema validation, typecheck and build passed. Final suite: **64 passed / 15 skipped suites; 867 passed / 98 skipped tests**.
- Frontend: required-field/rendered-print tests (2) passed; typecheck passed; lint **0 errors / 72 warnings** (includes two image-element warnings for private signature PNGs); production build passed.
- `git diff --check` passed. All work stays on `issue-117/estimate-signatures`; no push, PR, merge or issue closure.
- No database migration/seed was applied, and no account was created. Database integration tests are skipped because no separate local `TEST_DATABASE_URL` was supplied. Final backend validation uses a localhost-only DATABASE_URL guard.
- Not manually verified: physical phone/tablet input, browser print pagination/layout, deployment/migration execution, configured company/branch terms, production account/login. Printing includes CSS A4 margins and page counters; browser support still needs physical/preview verification.
- New signature images use private bounded PNG data URL references. A remote upload provider is not present in the current customer-document implementation. Future portal capture fields are present, but the old unsigned portal action now fails safely.
- Expanded role matrix preserves existing Admin billing rights: this checkout's Admin role does not have `invoice:job-bill:create`, and the instruction to leave existing Admin rights unchanged is followed. SuperAdmin retains its bypass.

## Issue acceptance criteria

Pass below means implementation and automated checks pass; it does not claim a production deployment or physical-device verification.

| Criterion | Result |
| --- | --- |
| CCU officer/manager view only; forbidden actions return 403 | Pass ? role/action middleware matrix |
| Adviser opens/edits job cards, revises without creating; no parts/workshop/bill action | Pass ? role/action matrix and revise service tests |
| Workshop manager workshop actions; cannot issue parts | Pass ? role/action matrix |
| Store manager/officer issue/return/view; cannot edit estimates or create bills | Pass ? unchanged store permissions and matrix |
| Billing officer views and bills without job-card/parts writes | Pass ? matrix; no branch-all or estimate grant |
| View-only job detail has no estimate/invoice/prices; matching sections tolerate absent fields | Pass ? nested visibility tests and frontend build; manual whole-screen review not verified |
| Re-seeding preserves role changes | Pass ? mocked seed run twice reconstructs the same permissions |
| Revision creates linked unsigned N+1, superseding readable source | Pass ? pure and transactional service tests |
| Revisions audit actor and previous/new scope | Pass ? transactional audit assertions |
| Customer sees scope and signs before new approval | Pass ? signature save transaction and required-field tests; real touch input not verified |
| Decline requires reason and blocks work until revised/signed | Pass ? decision and gate tests |
| Signature stores name/time/actor/device/version/total/hash | Pass ? schema and transaction evidence test |
| Changed signed content invalidates approval | Pass ? hash mutation tests and gate checks |
| Pre-signature approvals remain valid and labelled | Pass ? gate compatibility and explicit UI label |
| Sign permission required; Admin override requires reason and audit | Pass ? middleware matrix and override tests |
| Standalone print contains customer estimate content only | Pass ? server projection and rendered component checks |
| No source/internal remarks/QC/cost/other estimates in print | Pass ? projection and rendered exclusions |
| Signed/unsigned/superseded print states | Pass ? rendered component checks |
| Print permission guards button, page and API | Pass ? matrix, denied component rendering and API middleware |
| Job-card print excludes estimate section | Pass ? section uses print:hidden |
| Production billing account exists and passes login checks | Not verified ? explicitly excluded; Users runbook supplied |
| No password in issue/code/seed/docs | Pass ? no credentials or real-person account created |

## Files changed by milestone

- **M1:** `server/src/shared/constants/roles.ts`, `roles.issue117.test.ts`; `client/features/auth/roles.ts`.
- **M2:** `job-card-visibility.ts` and test; service/controller boundary; job-card detail page. Final visibility follow-up also updates `JobCardLabourSection.tsx` and the separate labour response.
- **M3:** `server/prisma/schema.prisma`, additive `20261020100000_estimate_versions_signatures/migration.sql` (versions, signature/approval evidence and DocumentTerms).
- **M4:** `estimate-revision.ts` and test, `estimate-revise-service.test.ts`, shared service/repository/routes/latest-estimate query, `JobCardEstimateSection.tsx`.
- **M5:** `estimate-signature.ts` and test, `estimate-approval.ts` and test, `estimate-decisions.test.ts`, service validation/controller/service, `EstimateSignatureDialog.tsx`, `signature-fields.ts`, job-card types and estimate display.
- **M6:** `estimate-print.ts` and test, print API in `service.routes.ts`, `client/app/(dashboard)/job-cards/[id]/estimates/[estimateId]/print/page.tsx`, `client/test/issue117-components.test.mjs`, estimate print link, `JobCardEditForm.tsx` links/integrity display.
- **M7:** `doc/job-cards.md`, `doc/roles-and-permissions.md`, this progress/acceptance report; final regression assertions and view-only display fixes.

## TODO(confirm) defaults applied

1. ServiceAdviser retains `invoice:create`; it does not guard job bills in this checkout.
2. ServiceManager revises/prints/signs but cannot create estimates. WorkshopManager creates the first estimate and prints, with no sign/revise rights; old staff approve is replaced by sign.
3. CCU sees operational job details without estimate/invoice data or nested monetary fields. Job-card print omits the estimate section entirely.
4. BillingOfficer remains home-branch only, retains invoice/job-bill rights and receives no estimate rights.
5. Counter capture only; future portal compatible schema, remote flow deferred. Reasoned/audited Admin override retained.
6. Billing account creation is a Users runbook, with proposed role-based login requiring operational confirmation. No named person or password is seeded.

## Follow-up: existing DocumentTerms migration collision

Reported deployment failed with P3018 / 42P07 because `DocumentTerms` already existed. The original implementation incorrectly inferred database absence from checkout absence. Corrected the failed migration to preserve compatible existing terms and safely resume either a clean or partial application, with an atomic transaction and early compatibility checks. No deployed database was accessed. Recovery uses `migrate resolve --rolled-back` followed by the corrected `migrate deploy`, not a reset or unverified applied marker. See `doc/testing/issue-117-migration-recovery.md` for operator commands and local regression coverage. Existing deployment table column layout has not yet been supplied.

Follow-up verification: all four migration regression scenarios passed on a newly initialized PostgreSQL 18 cluster bound to 127.0.0.1. The test cluster was stopped afterward. No existing/local service or non-local database was modified. `git diff --check` passed.
