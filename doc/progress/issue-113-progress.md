# Issue 113 progress

Step 0 and P1–P3 complete on `issue-113/service-transactions`. Stop here; await authorization for P4.

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
- [ ] P4 labour slips, separate hours, totals and QC-gated READY
- [ ] P5 numbered bookings, optional requests, cancellation and linked conversion
- [ ] P6 audited remarks in any status, document output and picking print
- [ ] P7 existing-component frontend and permission gating
- [ ] P8 documentation and Swagger examples

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
