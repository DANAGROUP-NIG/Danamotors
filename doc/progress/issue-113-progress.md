# Issue 113 progress

Step 0 and P1–P4 complete on `issue-113/service-transactions`. Stop here; await authorization for P5.

## Plan
1. P1: reconcile shared schema, then add only missing fields in one additive migration.
2. P2–P6: requisitions, returns, labour, bookings, remarks and picking print, one phase per run.
3. P7: frontend one screen at a time, using supplied screenshots as references.
4. P8: job-card documentation and Swagger examples.

## Recon findings
- Existing: ServiceAppointment, JobComplaint, PartIssuance, PartReturn, JobCardLabour, LabourRate, ChargeType, JobCardLine, DocumentSequence, job remarks/workDone and engineer.
- Existing sequence helper: server/src/shared/db/documentSequence.ts; inventory issue/return implementation: server/src/modules/inventory/inventory.service.ts; permissions: server/src/shared/constants/roles.ts and client/features/auth/roles.ts.
- Existing customer form: client/features/customers/components/CustomerCreateForm.tsx. Appointment and job-card features already exist.
- Existing READY transition checks passed QC in job-card-workflow.service.ts; preserve it.
- Missing in current schema: booking number/mileage/booking status/requests/cancellation reason/follow-up link; requisition, return and labour slip headers; labour standard/charged hour separation; Estimate.remarks.
- JobCardLine.partIssuanceId is unique: split charge lines need a deliberate additive-compatible relationship change in P1, not a second issuance for the same stock movement.
- Workshop reports PR #81 is in current branch ancestry (merge 1b53f0d), but its remote feature branch has bookingNumber, BookingStatus and standardHours absent from the current schema. Reconcile existing definitions/migrations before adding anything.
- Issues #64 and #67 are closed completed, with warranty, charge-type, customer, vehicle and job workflow structures present locally. No PDI-named branch or commit found in available refs; PDI implementation not established by this recon.
- Keep branch-indent PickingList untouched. Picking list is a read-only print action.

## Acceptance checklist
- [x] P1 shared schema reconciled and additive migration verified locally
- [x] P2 stock-safe requisitions, rate snapshots, goodwill splits, cancellation and permissions
- [x] P3 bounded returns, split reductions, reversal and historical row readability
- [x] P4 labour slips, separate hours, totals and QC-gated READY
- [x] P5 numbered bookings, optional requests, cancellation and linked conversion
- [x] P6 audited remarks in any status, document output and picking print
- [x] P7 existing-component frontend and permission gating
- [x] P8 documentation and Swagger examples

## P1 milestone
- Added bookingNumber, BookingStatus, mileage, cancellation reason, AC flag, optional request rows and follow-up-job relation. The existing appointmentId/jobCards relation already supplies conversion links in both directions.
- Reused reports-branch names AppointmentRequest, bookingNumber, bookingStatus and standardHours. Kept the existing BookingServiceType relation rather than introducing a second service-type relation. No requisition/slip schema was found in any available origin branch.
- Added PartRequisition and PartRequisitionLine, PartReturnSlip (reusing PartReturn as its lines), and LabourSlip (reusing JobCardLabour as its lines). Added branch document uniqueness, foreign keys and lookup indexes.
- Added nullable Estimate.remarks and standardHours; existing JobCardLabour.hours remains charged hours. No additional technician structure or duplicate chargedHours column.
- Requisition lines hold decimal rate/amount/share snapshots and link both approved/customer JobCardLines. The existing unique PartIssuance-to-primary-charge relation stays intact for older code.
- Existing bare issuances, returns and labour remain readable. New return fields are nullable for historical rows. No legacy data import or price backfill.
- One transactional, additive, idempotent migration: 20261021100000_service_transaction_documents. Existing ChargeType and branch-indent PickingList are unchanged.
- Passed: Prisma validation/generation; migration application/reapplication against existing, partial and full pre-P1 schemas; legacy-row preservation; split links; decimal snapshots; separate hours; foreign-key, cancellation and percentage checks; zero Prisma schema drift; backend typecheck (also lint) and build.
- Full backend suite: PASS, 73 suites / 921 tests passed; 16 suites / 100 tests skipped. TEST_DATABASE_URL was empty and DATABASE_URL pointed to an unused localhost port, so database integration tests were intentionally skipped. The separate P1 migration tests ran against disposable local PostgreSQL and passed.
- Database writes were limited to disposable, localhost-only PostgreSQL clusters under .audit-local. No non-local database access, push, PR or issue mutation.
- P2–P8 remain pending. Runtime issuance, return, cancellation, numbering and branch-authorization behavior will be implemented and tested in their respective phases.

## P2 milestone
- Added branch-scoped list/detail/create/cancel and store print-data endpoints under /api/inventory/requisitions, with strict Zod validation and Swagger examples. Actual frontend screens/print layout remain P7.
- Each requisition uses the existing transactional DocumentSequence helper with a branch-specific key and the Africa/Lagos year. The header, issuance records, stock movements, charge lines and audit write commit or roll back together.
- Locks the job first, then stock records in stable order. Available stock excludes reserved quantities. Request-only lines can have zero issuance, including when no stock record exists.
- Source-record prices follow the existing warranty/retail/unit-price rule and are snapshotted with decimal helpers. Warranty requires coverage/case and an eligible part (100/0); goodwill requires its separate permission, a reason and a valid split; free lines retain the existing linked-campaign rule.
- Both goodwill charge shares reconcile to the original amount. Billing consumes the saved customer charge rather than current source prices. Job-card line synchronization leaves document-managed charges intact, including after cancellation. Existing issuance behavior remains the legacy path.
- Preserved existing approved-estimate scope checks for issued work. Booking request/estimate optionality does not bypass the existing work-approval gate.
- Cancellation requires a reason, restores stock once, removes both charge shares and audits the original document amounts/status. Billed/delivered/cancelled jobs or active bills reject writes. Manual charge reallocation and the bare return endpoint cannot bypass requisition snapshots.
- TODO(confirm), safe default: cancel active returns before cancelling their requisition; existing claim/bill references block cancellation rather than silently losing claim history.
- TODO(confirm), safe default: issuing/cancelling parts on READY jobs reopens them to IN_PROGRESS, clears readyAt and requires another QC. Request-only documents do not change readiness.
- Added requisition:read/create/cancel/goodwill to server/client permission constants and ROLE_PERMISSIONS, plus an idempotent permission migration. Store roles get read/create/cancel without goodwill, labour or booking grants. Read grants extend to workshop/service managers, advisors and warranty officers; goodwill defaults to Admin/WarrantyOfficer (SuperAdmin retains its standard bypass).
- Passed: strict backend typecheck/lint and final build; full backend suite (75 suites, 948 tests passed; 17 suites, 114 tests skipped). After the final QC safeguard, reran the changed requisition logic and database files: 38 tests passed, including 15 real database integration tests. The permission migration applied twice with exactly 19 default grants and no duplicates.
- Database tests prove multi-part atomic issuance, all four charge types, price snapshots through sync/approval checks and actual invoice creation, no-stock requests, reserved-stock rejection, cross-branch 403, cancellation reversal, concurrency, audit-failure rollback and repeat QC.
- All database writes used fresh localhost-only PostgreSQL clusters under .audit-local. No non-local database writes, dependency changes, push, PR or issue mutation. P3–P8 remain pending.

### P2 files changed
- client/features/auth/roles.ts
- server/prisma/migrations/20261021110000_requisition_permissions/migration.sql
- server/src/modules/requisition/requisition.logic.ts
- server/src/modules/requisition/requisition.logic.test.ts
- server/src/modules/requisition/requisition.validation.ts
- server/src/modules/requisition/requisition.service.ts
- server/src/modules/requisition/requisition.controller.ts
- server/src/modules/requisition/requisition.controller.test.ts
- server/src/modules/requisition/requisition.routes.ts
- server/src/modules/requisition/requisition.integration.test.ts
- server/src/modules/finance/job-billing.service.ts
- server/src/modules/inventory/inventory.service.ts
- server/src/modules/job-card-line/jobCardLine.service.ts
- server/src/modules/service/estimate-approval.ts
- server/src/routes/index.ts
- server/src/shared/constants/roles.ts
- doc/progress/issue-113-progress.md

## P3 milestone
- Added /api/inventory/return-slips list/detail/create/cancel and internal print-data routes. Reused requisition:read/create/cancel and branch:all access rules; no new permission or schema migration.
- A slip derives its branch, job and charge type from its requisition. Strict validation rejects duplicate rows, foreign requisition lines, unissued requests, non-positive quantities and caller-supplied rate/type/header overrides.
- Numbers use the existing transactional DocumentSequence helper with a branch-specific RETURN key and the Africa/Lagos year.
- The job row lock serializes return, requisition, billing and cancellation writes. Stock rows lock in stable order. Returns cannot exceed issued minus all active previous returns, including bare historical return rows attached to the issuance; rejected/cancelled rows do not consume capacity.
- Stock, PartReturn lines, slip header, both charge shares, QC state and audit commit atomically. New returns use the original requisition source/rate snapshots and normal RETURNED stock movements.
- Remaining warranty/goodwill/customer/free charges are recalculated from the original allocation with decimal helpers. Full returns retain zero-quantity/zero-amount charge rows to preserve tax, campaign, source, rate and primary-issuance snapshots for reversal. Billing excludes those zeroed rows.
- Cancellation requires a reason, takes the returned stock out again with an ISSUED movement, marks the return lines/slip cancelled and restores the correct remaining shares even when slips are cancelled out of order. It refuses insufficient available stock, including stock reserved for transfers; repeated cancellation cannot reverse twice.
- Billed/delivered/cancelled jobs and active bills reject return or cancellation writes. Cancelled requisitions reject returns. Existing P2 safe defaults remain: resolve claim/bill references before changing their charges; changes on READY jobs reopen them for passed QC again.
- Fixed legacy issuance scope accounting so cancelled slip returns no longer reduce quantities counted against approved estimates. Historical bare PartReturn rows remain readable through the existing inventory readers; the legacy writer still refuses document-managed requisition parts.
- Passed: 18 pure-rule/validation/permission-route tests; 32 live local database tests (17 return-slip tests plus 15 requisition regressions); strict backend typecheck/lint and build; full backend suite (77 suites / 967 tests passed, 18 suites / 132 database-dependent tests skipped).
- Database tests cover actual invoice reduction after a price change; all four charge-type full return/cancel round trips; original tax/campaign/rate preservation; multi-part slips; remaining-quantity limits; out-of-order cancellation; branch 403; closed-job refusal; reserved-stock cancellation refusal; concurrent returns/cancellations; QC reset; legacy reads; and rollback on both create/cancel audit failure.
- All database writes were confined to disposable localhost-only PostgreSQL clusters under .audit-local. No dependencies, schema changes, non-local database writes, browser/dev-server runs, push, PR or issue mutation. Frontend return screens/print layouts remain P7; P4–P8 are pending.

### P3 files changed
- server/src/modules/requisition/return-slip.logic.ts
- server/src/modules/requisition/return-slip.logic.test.ts
- server/src/modules/requisition/return-slip.validation.ts
- server/src/modules/requisition/return-slip.service.ts
- server/src/modules/requisition/return-slip.controller.ts
- server/src/modules/requisition/return-slip.routes.ts
- server/src/modules/requisition/return-slip.routes.test.ts
- server/src/modules/requisition/return-slip.integration.test.ts
- server/src/modules/finance/job-billing.service.ts
- server/src/modules/inventory/inventory.service.ts
- server/src/routes/index.ts
- doc/progress/issue-113-progress.md

## P4 milestone
- Implemented /api/service/labour-slips list/detail/create, add line, save replacement line and internal print-data endpoints using jobcard:read / jobcard:labour:update. Work done and vehicle-ready use the existing job-card update endpoint and its jobcard:update permission. No additional role grants.
- Reused LabourService's model-rate and technician/employee resolver. One technician login or current employee mechanic per line; no second/third technician structure. Header/line groups and branch-active engineer fields reuse existing masters/users.
- Standard hours and charged hours are stored separately (standardHours and existing hours); API responses also expose chargedHours. TIME uses decimal hours × rate; FIXED keeps its model amount independently of charged hours. Amounts use the existing decimal money helpers.
- Schema correction discovered during P4: a nullable JobCardLabour.pricing snapshot is necessary to preserve FIXED/TIME semantics when charged hours or catalogue pricing change. Added one small additive/idempotent migration, rather than guessing from amounts or adding another hours field. Historical pricing remains null and existing hours/rate/amount are not backfilled or rewritten.
- Rates, standard hours and pricing mode remain snapshotted when editing the same operation. Changing the operation resolves the new model rate. Charge type is explicit on every submitted line; goodwill needs warranty:update and a reason, warranty needs coverage/case, and free labour needs a linked campaign.
- Each slip line owns the existing JobCardLabour and its JobCardLine. Billing and approval scope consume the saved fixed-unit/time quantity. Sync and legacy edit/delete/reclassification paths cannot overwrite document-managed charges. Legacy and slip labour can share the same approved operation without treating fixed-operation charged hours as billed units.
- Job-row locks serialize writes, approved scope is checked before changes, and audit entries include old/new line values. Billed/delivered/cancelled jobs and active bills reject all slip writes. Existing claim/bill references block edits rather than invalidating their history.
- Vehicle ready still calls the existing lifecycle: transition to QC, record passed QC, then READY; a pending QC leaves status/readyAt unchanged and returns the existing clear error. Work done persists through the same workflow. New/edited work on READY jobs reopens them and resets QC, preserving the P2/P3 safeguard.
- TODO(confirm), safe footer default: goodwill is a separate subtotal; it is not silently included in customer, warranty or free amounts. All four subtotals reconcile to totalAmount.
- Passed: new pure/validation/permission-route tests and existing mechanic tests; updated billing regression test; strict backend typecheck/lint and build; 46 live database tests (14 labour, 15 requisition and 17 return tests). The pricing migration was applied twice, preserved a pre-existing legacy labour row, and rejected an invalid pricing mode. Full backend suite passed: 79 suites / 980 tests; 19 suites / 146 database-dependent tests skipped in the non-database run.
- Live tests include actual fixed-price invoice creation after catalogue changes, time vs standard hours, line editing/addition, all payer totals, employee-without-login assignment, branch 403, closed-job rejection, legacy-path protection, QC refusal/pass, mixed legacy/slip scope, concurrent writes and audit-failure rollback.
- All database writes used fresh localhost-only clusters under .audit-local. No new dependencies, frontend/screenshots/browser/dev-server work, non-local database writes, push, PR or issue mutation. P5–P8 remain pending.

### P4 files changed
- server/prisma/schema.prisma
- server/prisma/migrations/20261021120000_labour_pricing_snapshot/migration.sql
- server/src/modules/service/labour-slip.logic.ts
- server/src/modules/service/labour-slip.logic.test.ts
- server/src/modules/service/labour-slip.validation.ts
- server/src/modules/service/labour-slip.service.ts
- server/src/modules/service/labour-slip.controller.ts
- server/src/modules/service/labour-slip.routes.ts
- server/src/modules/service/labour-slip.routes.test.ts
- server/src/modules/service/labour-slip.integration.test.ts
- server/src/modules/service/labour.service.ts
- server/src/modules/service/estimate-approval.ts
- server/src/modules/finance/job-billing.service.ts
- server/src/modules/finance/job-billing.service.test.ts
- server/src/modules/job-card-line/jobCardLine.service.ts
- server/src/modules/requisition/requisition.logic.ts
- server/src/routes/index.ts
- doc/progress/issue-113-progress.md


## P5 milestone
- Extended the existing ServiceAppointment model and APIs; no second booking model or additional migration. Portal/campaign creation uses ServiceService and enquiry approval uses ServiceRepository; all now share the transactional numbered creator.
- Booking numbers use DocumentSequence per branch and Lagos year. The stored number is `<branch UUID>/<YYYY + six-digit sequence>` because bookingNumber is globally unique. TODO(confirm): a shorter business-facing branch prefix can replace the UUID once a stable branch code is agreed; no existing numbers are rewritten.
- createdAt remains the automatic booking timestamp, scheduledAt remains booked-for. Detail/list responses retain linked customer/vehicle data and include workshop service type, AC flag, booking mileage, optional earlier same-vehicle/same-branch follow-up job, requests and decimal-derived parts/oil/labour/total estimates. Booking search includes the number; scheduled-date filtering and notifications use Lagos time.
- Optional requests reuse the job complaint validator/resolver: complaint master, defect code, description and spare/oil/labour estimates. Header totals cannot override calculated request totals. Replacing requests is transactional and audited with old/new values. Booking mileage does not update the actual vehicle odometer until check-in or job opening.
- Canonical bookingStatus is BOOKED, CONVERTED, CANCELLED or NO_SHOW. Existing legacy appointment status remains compatible with its workshop lifecycle; canonical cancellation/no-show maps to its legacy status. Both cancellation paths require a reason, terminal bookings cannot be reopened, and cancelled/no-show bookings release the existing active-booking restriction. Cancellation retains existing role notifications.
- POST /api/service/appointments/:id/convert requires both appointment:update and jobcard:create. It derives customer, vehicle, service, AC and saved requests from the booking and runs the existing job-opening workflow. Empty bookings remain valid, but job opening still requires a complaint supplied by the caller. Booking totals exclude the model service charge; normal job opening adds that charge as before.
- Vehicle-then-booking locks serialize conversion, check-in and booking edits. A booking version check rejects stale conversion data. Job creation, the appointmentId reverse link, CONVERTED status, numbering, actual mileage and conversion audit share one transaction. The legacy job-opening endpoint applies the same copying and single-conversion rule; even a subsequently cancelled job cannot cause a second conversion.
- Branch-bound create/list/get/update/delete/convert requests reject foreign branches with 403; branch:all and SuperAdmin retain all-branch access. Unassigned accounts cannot convert. No permission grants were added. Converted/linked bookings reject header/request changes. TODO(confirm), safe deletion default: numbered bookings retain their history and must be cancelled with a reason; legacy unnumbered deletion rechecks links under a row lock.
- Customer/vehicle creation and duplicate warnings remain on the existing customer/vehicle APIs. P7 can use those APIs for inline creation before booking; booking IDs and bill-to behavior are preserved rather than introducing a parallel customer form or new vehicle validation rules. A follow-up link does not silently mark a job as a repeat.
- Passed: 3 new pure/validation tests, 2 new permission/branch tests, existing branch and job-opening regressions; full backend suite 81 passed suites / 985 passed tests, 20 database suites / 158 tests skipped in the non-database run. All 12 new booking integration tests passed on a disposable localhost database, including simultaneous conversion, duplicate creation, follow-up validation, request replacement, cancellation/no-show, legacy opening, failed validation, audit-failure rollback, mileage and warranty/campaign acknowledgement.
- Strict backend typecheck/lint and build passed. No dependencies, screenshots, browser/dev-server runs, frontend changes or non-local database writes. No push, PR or issue mutation. P6-P8 remain pending.

### P5 files changed
- server/src/modules/service/booking.logic.ts
- server/src/modules/service/booking.logic.test.ts
- server/src/modules/service/booking.persistence.ts
- server/src/modules/service/booking.routes.test.ts
- server/src/modules/service/booking.integration.test.ts
- server/src/modules/service/service.validation.ts
- server/src/modules/service/service.repository.ts
- server/src/modules/service/service.service.ts
- server/src/modules/service/service.controller.ts
- server/src/modules/service/service.routes.ts
- server/src/modules/service/job-card-workflow.service.ts
- server/src/modules/service/branch-access.test.ts
- server/src/modules/enquiry/enquiry.service.ts
- doc/progress/issue-113-progress.md


## P6 milestone
- Added dedicated GET/PUT /api/service/job-cards/:id/remarks and /api/service/estimates/:id/remarks. Reads reuse jobcard:read / estimate:read; writes require jobcard:remarks:update. These endpoints update only the existing remarks fields, normalize blank text to null, reject extra fields and leave workDone, lifecycle/QC, quantities, amounts and estimate versions unchanged.
- Remarks are editable in any status, including billed/delivered/cancelled jobs and approved/rejected/superseded estimates. Each actual change writes JOB_REMARKS_UPDATED or ESTIMATE_REMARKS_UPDATED with actor, branch, document ID and old/new values in the same transaction. No-op saves do not create false change entries. Job-then-estimate locks preserve the preceding value under concurrent writes; an audit failure rolls the edit back.
- Added GET /api/service/job-cards/:id/picking-list/print and /api/service/estimates/:id/picking-list/print, gated by jobcard:picking-list:print. These return internal print data only: branch, job/estimate references and dates, estimate version/status/currency, vehicle, service, mileage, current document remarks, part number, snapshotted flag/description/quantity/rate/amount, UOM and decimal totals. Dates remain ISO timestamps with Africa/Lagos print metadata for P7 formatting.
- TODO(confirm), safe picking source: a job action uses its latest estimate; an estimate action uses that specific revision, including historical revisions. PART and INCLUDED_PART rows represent planned parts. Issued customer/warranty payer shares are never summed into physical picking quantities. Jobs without an estimate return a clear 400 rather than inventing rows. Missing legacy catalogue references remain null, with original descriptions and prices retained.
- Picking print requests write a PICKING_LIST_PRINTED audit event in a consistent snapshot transaction. They do not allocate a document number, create a picking-list record, update job/estimate fields or touch stock, stock transactions, issuances or returns. The existing branch-indent/STN PickingList is untouched.
- Remarks are included in the new internal document output. Existing customer estimate print projection remains unchanged and continues to exclude internal remarks, source flags, costs and unrelated records; its regression test passes.
- Branch-bound document reads, writes and prints reject foreign branches or branchless users with 403; branch:all permits other assigned branches. Linked estimates use the owning job branch and inconsistent branch links are rejected. Standalone estimates are supported; unassigned legacy estimates need a branch before document actions can be performed.
- Added the two permissions to PERMISSIONS and grants to ROLE_PERMISSIONS, plus one additive/idempotent permission migration for existing installations. Safe default remarks editors: SuperAdmin, Admin, WorkshopManager, ServiceAdviser, ServiceManager. Picking printers additionally include GeneralStoreManager and StoreOfficer. A test compares every migration grant to the seed-reset defaults; the migration was applied twice locally and produced exactly 12 grants without duplicates.
- Passed: 12 new pure/validation/route/seed-consistency tests and the existing customer estimate-print regression; 16 live localhost database tests covering all closed-status edits, signature/content preservation, no-op/clear saves, branch denials, standalone estimates, snapshot picking prices, latest vs explicit revision, payer-share duplication avoidance, no business/stock/STN/sequence writes, missing documents, concurrent audit chains and real audit-failure rollback.
- Full backend suite passed: 83 suites / 997 tests; 21 database suites / 174 tests skipped in the non-database run. Strict backend typecheck/lint (same tsc --noEmit command) and build passed. No new dependencies, frontend changes, screenshots/browser/dev-server runs, non-local database writes, push, PR or issue mutation. P7-P8 remain pending.

### P6 files changed
- server/prisma/migrations/20261021130000_service_document_permissions/migration.sql
- server/src/modules/service/service-document.logic.ts
- server/src/modules/service/service-document.validation.ts
- server/src/modules/service/service-document.service.ts
- server/src/modules/service/service-document.routes.ts
- server/src/modules/service/service-document.logic.test.ts
- server/src/modules/service/service-document.routes.test.ts
- server/src/modules/service/service-document.integration.test.ts
- server/src/shared/constants/roles.ts
- server/src/routes/index.ts
- doc/progress/issue-113-progress.md


## P7 milestone
- Extended the existing appointments create/detail/list/edit flow rather than adding another customer or vehicle form. CustomerSelectWithCreate and VehicleSelectWithCreate remain the inline creation paths, preserving their existing validation and duplicate warnings. Selected vehicle registration/model/variant/VIN/engine details are read from the existing vehicle hook.
- Booking UI includes automatic booking number/status/created timestamp, Lagos booked-for entry, workshop service type, optional catalogue service, mileage, AC flag, optional follow-up job, optional complaint/defect requests and parts/oil/labour estimates. Previews reuse the existing requestTotals helper; saved total estimates come from the server. Terminal/converted/linked bookings are read-only, cancellation requires a reason, no-show is explicit, and linked jobs are navigable. Numbered/linked bookings are excluded from legacy delete actions. Branch selection uses branch:all rather than a role name.
- Conversion reuses JobCardOpeningModal/JobCardCreateForm. A pure adapter prefills saved booking customer, vehicle, service and requests (one blank request when the optional booking requests are absent). Existing warranty/campaign acknowledgement remains intact. The API adapter calls /appointments/:id/convert for linked openings and the normal job endpoint otherwise. The regular opening form also copies saved booking requests and service metadata when selecting a booking.
- Added a Service transactions section to the existing RepairWorkspacePage, with keyboard-accessible Requisition/Returns/Labour/Remarks tabs, shared vehicle/job context, lazy first visits and preserved form state when changing tabs. Panels are permission-gated; closed jobs retain readable documents while stock/labour edits are disabled.
- Requisition UI supports multiple part rows, quantities required/issued, non-warranty/warranty/free/goodwill, linked campaign, group/engineer and goodwill reason/approval percentage with complementary customer percentage. Saved document details show source flag, UOM, snapshot rates, amounts, splits and server totals. Goodwill is hidden without requisition:goodwill. Existing stock/approval rules remain server-authoritative and error responses preserve form input.
- Return UI selects a job requisition, displays issued quantities and snapshot rates, calculates the remaining return allowance from active returns, bounds each entered quantity, and submits only positive returns. Saved requisition/return lists are paginated; cancellation requires a reason and requisition:cancel. Cancelled/closed documents cannot be edited.
- Labour UI supports multiple lines on a new slip, adding to an existing slip and editing saved lines. Standard hours and charged hours remain distinct in the saved grid. Each line selects one technician login or one employee mechanic, with employee lookup gated by employee:read. Group/engineer, payer/campaign and goodwill reason follow the backend contract; labour goodwill uses warranty:update. Model rates/standard hours and fixed-price snapshots remain server-derived. Work done uses the existing job update endpoint; vehicle ready is enabled only in QC with a passed result, with the backend gate unchanged.
- Remarks UI selects the job or a particular estimate revision, reads/writes the P6 endpoints with their specific permissions, and remains editable on billed/delivered/cancelled jobs. It does not reuse workDone or change amounts. Errors/retry, pending controls and read-only states are explicit.
- Added internal print pages at /service-transactions/:kind/:id/print for requisitions, returns, labour slips and job/estimate picking data. Print permission is checked before fetching. Picking includes job/estimate references, revision/status, vehicle/service/mileage, part flag/UOM/required quantity, snapshot rates/totals and internal remarks. Currency follows the estimate; dates use Africa/Lagos. Print CSS isolates the document. No stored/numbered picking list, stock operation, STN change or new customer-facing source exposure.
- Shared data reads/mutations stay in hooks and refresh document, job, appointment, inventory and picker caches. Pure helpers cover date conversion, booking-prefill mapping, terminal guards, return allowances and labour payload sanitation. All styling uses existing tokens/components; no dependencies added.
- Passed: 29 self-contained client tests in total (17 new pure/API-contract/render tests plus 12 existing tests), strict client TypeScript, scoped ESLint with zero warnings/errors, and production Next build. Render tests cover permission denial before print fetch, closed transaction controls, delivered-job remarks, QC readiness, one-assignee labour, error states, internal print projection and single-conversion UI. Generated Next/typecheck files were restored and accidental Windows line-ending changes removed.
- QA limitation: the two older client/tests/*.cjs DOM scripts need an external QA directory containing jsdom/esbuild. They could not run because the existing isolated runtime has missing package files; their node --test attempt failed at setup, before assertions. No dependencies were installed. The available client/test suite and targeted new checks passed. No browser, dev server or screenshots were needed for the render/pure checks; interactive browser and paper-output layout QA remain unperformed.
- No backend changes, database writes, dependency changes, push, PR or issue mutation. P8 remains pending.

### P7 files changed
- client/app/(dashboard)/appointments/[id]/page.tsx
- client/app/(dashboard)/service-transactions/[kind]/[id]/print/page.tsx
- client/features/appointments/components/AppointmentCreateForm.tsx
- client/features/appointments/components/AppointmentEditForm.tsx
- client/features/appointments/components/AppointmentsTable.tsx
- client/features/appointments/schemas/appointment.schema.ts
- client/features/appointments/types/appointment.types.ts
- client/features/job-cards/api/job-card.api.ts
- client/features/job-cards/components/JobCardCreateForm.tsx
- client/features/job-cards/components/RepairWorkspacePage.tsx
- client/features/job-cards/components/WorkshopPicker.tsx
- client/features/job-cards/types/job-card.types.ts
- client/features/service-transactions/booking.logic.ts
- client/features/service-transactions/components/BookingFields.tsx
- client/features/service-transactions/components/BookingPanel.tsx
- client/features/service-transactions/components/BookingVehicleSummary.tsx
- client/features/service-transactions/components/LabourLineEditor.tsx
- client/features/service-transactions/components/LabourPanel.tsx
- client/features/service-transactions/components/RemarksPanel.tsx
- client/features/service-transactions/components/RequisitionPanel.tsx
- client/features/service-transactions/components/ReturnPanel.tsx
- client/features/service-transactions/components/SavedLabourLine.tsx
- client/features/service-transactions/components/SavedSlip.tsx
- client/features/service-transactions/components/ServiceDocumentPrint.tsx
- client/features/service-transactions/components/ServiceTransactions.tsx
- client/features/service-transactions/components/TransactionFields.tsx
- client/features/service-transactions/document.types.ts
- client/features/service-transactions/hooks/use-service-transactions.ts
- client/features/service-transactions/transaction.logic.ts
- client/test/service-transactions-ui.test.mjs
- client/test/service-transactions.test.mjs
- doc/progress/issue-113-progress.md


## P8 milestone
- Updated doc/job-cards.md with the six transaction flows, route/permission tables, request and response ownership, per-branch numbering/Lagos dates, booking status vs legacy lifecycle, atomic conversion, warranty acknowledgement, payer splits, stock/return bounds, saved pricing, QC readiness, remarks-only exceptions and internal picking semantics. Corrected the older financial-estimate immutability wording to distinguish audited remarks and clarified booking conversion's saved-customer behavior.
- Documented the four additive P1/P2/P4/P6 migrations, ROLE_PERMISSIONS seed-reset behavior, no legacy business-data backfill/reset, synthetic examples, local-only testing and the P7 DOM/browser QA limitation. No deployment, migration, seed, remote issue operation or PR was performed.
- Added service-transactions.openapi.ts as the assembled Swagger source for 21 paths / 29 operations / 10 schemas. It replaces obsolete booking field/status docs (scheduledAt, not scheduledDate), documents all transaction endpoints, uses the configured BearerAuth scheme and preserves existing methods on shared paths. Examples cover minimal/optional booking requests, reschedule/cancel/no-show/conversion, all four parts payers, returns/cancellation, technician/employee labour, remarks/clearing, workDone/READY and selected read responses. Both source assembly and the compiled runtime were verified.
- Documentation review found a P7 read-contract gap: requisition/return detail and print grids expected a partNumber, while their read models exposed only part IDs. Added a narrow read-only projection from the linked part master; return rows also expose their requisition description/source/UOM. Nullable historical links remain readable with null fields. Stock, rate snapshots, amounts, audit and mutation logic are unchanged. Added assertions to the existing live requisition/return regression tests.
- Passed: 9 new OpenAPI contract checks using the real Zod route validators, assembled path/security/component/path-parameter checks and preservation of shared job GET/PUT routes. Full backend suite: 84 passed suites / 1006 passed tests; 21 database suites / 174 tests skipped in the non-database run. All 32 affected live tests passed separately on disposable localhost clusters (15 requisition, 17 return), including part-number projection, stock/return history and existing billing/audit rollback behavior.
- Strict backend typecheck/lint and build passed. Compiled Swagger verified all 21 paths, 29 operations and 10 schemas. No new dependencies or frontend changes. P1-P8 implementation milestones are complete; interactive browser/paper-layout QA and the two external-runtime legacy DOM scripts remain the documented P7 validation limitation.

### P8 files changed
- doc/job-cards.md
- server/src/config/swagger.ts
- server/src/modules/service/service-transactions.openapi.ts
- server/src/modules/service/service-transactions.openapi.test.ts
- server/src/modules/requisition/requisition.service.ts
- server/src/modules/requisition/return-slip.service.ts
- server/src/modules/requisition/requisition.integration.test.ts
- server/src/modules/requisition/return-slip.integration.test.ts
- doc/progress/issue-113-progress.md


## Post-P8 startup repair
- Reported startup failure: AppointmentRequest.defectCode missing despite all recorded migrations being applied. The original table migration includes the column; the specific cause of database drift was not established and no remote database was inspected or modified.
- Added forward migration 20261021140000_appointment_request_defect_code_repair using ADD COLUMN IF NOT EXISTS, nullable TEXT. Existing migration history and request data are preserved. Updated deployment documentation.
- Passed two live integration cases on disposable localhost PostgreSQL: missing column and existing column, including nullability/type, row preservation and repeat application with a populated defect code.
- Backend strict TypeScript check passed (also the backend lint command). Remote database untouched; rerun db:prepare from server before restarting.
