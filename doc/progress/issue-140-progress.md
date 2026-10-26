# Issue 140 progress

Branch: feat/issue-140-dry-run. Suggestions excluded: email, job list sorting, customer billing filter, finance discounts.

## Mapping
Existing ServiceAppointment.requests / AppointmentRequest and JobCard.complaints store complaints; no parallel complaint field/table needed. Both use WorkshopMaster SERVICE_TYPE; Service is a separate appointment catalog. JobCard status is a string normalized by canonicalJobStatus. Workflow lives in job-card-workflow.service; assignment/QC in workshop.service; parts in requisition/inventory; billing in finance/job-billing.service. EstimateSignature already stores capture, terms and server timestamp. Notification model, repository, authenticated list/read/count endpoints and polling UI exist. Permissions live in ROLE_PERMISSIONS. Background timer pattern exists in finance/credit-terms.

## Phase 1
Required customer requests reuse existing DB rows. Protected appointment modal, progressive booking detail disclosure, registration validation, Lagos promised-date validation and field-error display added. No migration needed for this phase.

Validation: booking.logic tests 4/4 passed; backend typecheck passed. Targeted frontend lint passed; frontend typecheck rechecking a required-field compatibility fix. Runtime uses installed Node directly because nvm shim has no active version.

## Phase 2
Estimate percentage defaults to 60; Decimal calculation returned by server. Estimate signature now captures explicit job-card/estimate terms consent and a terms snapshot, preserving the existing server signedAt/capturedBy evidence and print projection. Existing receipt records are linked as deposits (one receipt per job); the workflow blocks starting work without sufficient payment. Clear findings label is centralized. Migration 20261026100000_estimate_upfront_deposit includes rollback SQL. No database was changed. Signature/deposit/decision tests: 25 passed; frontend typecheck and scoped lint passed.
Backend typecheck passed; additional deposit gate test passed (2 deposit tests total). Signed print now shows the immutable consent snapshot.

## Phase 3
One backend transition-role map, with server-provided allowed actions in UI. Technician progress requires their assignment; only service advisor can mark READY; failed QC can return for rework. WAITING_PARTS permits resume or completion with available scope. Existing assignment endpoint now has a selector in workshop actions. Parts collection stores assigned technician confirmation and server timestamp; retries preserve original evidence. Technician open/closed counts use one groupBy query and an additive index. Migration 20261026110000_parts_receipt_progress includes rollback.
Phase 3 validation: transition tests 2/2, workflow/workshop regression tests 40/40, parts collection/count tests 2/2; backend/client typechecks and scoped frontend lint passed.

## Phase 4
Central NotificationService.notify(event, recipients, payload), in-app channel map and centralized templates. Composite dedupe indexes make per-recipient persistence idempotent, including repeated reminder sweeps. Hooks run after requisition/issuance, collection, assignment, lifecycle and QC transactions. Active recipients come from branch roles, assignments and QC permission grants. Existing staff bell/feed reused; active customer portal accounts now receive READY/reminders through the same model and authenticated self-only feed/read routes with a portal bell. Persistence failures retry and emit static diagnostic warnings without breaking committed actions. JOB_PROMISED_REMINDERS_ENABLED=true enables a five-minute periodic sweep; defaults off. Stored notification dedupe keys are reminder sent markers, keyed by promised timestamp. Email remains excluded as an issue suggestion. Migration 20261026120000_workshop_notifications includes rollback (removes portal-only notification rows when reverting to staff-only schema). Notification tests 14/14; client/backend typechecks and scoped client lint passed.
Regression validation after notification hooks: workflow, requisition, parts collection/count and inventory tests 75/75 passed.

## Phase 5
The existing job-bill preview/create operation accepts consolidateVehicle; selecting Warranty consolidation finds all open/unbilled vehicle jobs and requires readiness plus a common branch/customer. Vehicle and job row locks, a serializable transaction and existing billedAt/active-invoice guards prevent duplicate billing. One invoice retains all job links and source-labelled lines; all jobs are billed atomically. Delivery checks include consolidated invoice balances. Cancellation reopens every linked job atomically; staff/customer job views include the linked bill. Migration 20261026130000_warranty_consolidated_bills creates an indexed additive relation, with rollback SQL. Existing discount and customer filters are unchanged (suggestions excluded).
Phase 5 validation: billing tests 20/20 passed; workflow regression test passed in the same run; client typecheck and scoped invoice lint passed. Backend typecheck passed. The consolidation fixture was corrected to include existing VAT/rounding rules (no pricing logic changed).

## Final audit corrections
Walk-in request input now hides pricing/vehicle extras; portal bookings capture required complaint text into existing request rows; request removal is rejected. Added direct job-opening date guard and structured service validation/duplicate-field errors. Deposit start guard checks unallocated receipt funds. Existing vehicle fixtures updated for the required registration rule; no production data changed.
Final frontend validation: production build passed; whole-client lint has zero errors and 70 existing warnings (scoped touched-file lint is clean). Backend build passed. Receipt selection now filters by the job customer and service register; zero-percent deposits need no receipt; the percentage editor validates its field. Signature capture uses the job branch's terms and printing prefers the signed terms snapshot.
Full backend run (one complete run): 1036 passed, 2 fixture failures, 176 skipped across 111 suites. Failures are old minimal-booking OpenAPI example and vehicle schema fixture missing now-required fields; correcting those and rerunning only affected suites. Database integration tests skipped explicitly (TEST_DATABASE_URL empty); DATABASE_URL forced to localhost for safety. No external database was contacted.
Scoped backend typecheck after final corrections passed. Appointment edit modal also uses accidental-close protection.

## Completion
Both full-suite fixture failures are resolved: service-transactions OpenAPI suite passed; catalog/deposit/error-handler focused rerun passed 22/22. Earlier final correction suites passed 57/57. Both backend and frontend builds/typechecks passed; scoped touched-file lint passed. Whole frontend lint: 0 errors, 70 existing warnings. No database integration execution or migration application was attempted.

## Assumptions and deployment
- Existing approved estimate signature captures job-card approval plus explicit terms consent; historical approval/override behavior is retained.
- Deposits use existing service receipt records and their unallocated funds. No parallel payment ledger is created.
- Warranty consolidation preserves existing charge allocations and tax rules, and requires ready jobs with the same customer/branch; mixed or unfinished jobs fail safely.
- Technician closed counts include BILLED, DELIVERED and CANCELLED (and normalized legacy forms).
- Customer in-app delivery requires an active existing portal account; staff recipients are assignment/role based.
- Reminders default off; enable JOB_PROMISED_REMINDERS_ENABLED=true to run the 24h/12h windows.
- Apply the four migrations in timestamp order using the normal deployment workflow (server: prisma migrate deploy, then prisma generate): 20261026100000_estimate_upfront_deposit; 20261026110000_parts_receipt_progress; 20261026120000_workshop_notifications; 20261026130000_warranty_consolidated_bills. Each includes rollback.sql. Existing permissions are reused; no role seed changes or new dependencies.
- Suggestions skipped: email notifications, requested newest-first change, customer job-card billing filter, and finance discount changes. Existing implementations of any such behavior are preserved.
