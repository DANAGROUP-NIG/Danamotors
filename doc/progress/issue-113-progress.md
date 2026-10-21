# Issue 113 progress

Step 0 and P1 complete on `issue-113/service-transactions`. Stop here; await authorization for P2.

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
- [ ] P2 stock-safe requisitions, rate snapshots, goodwill splits, cancellation and permissions
- [ ] P3 bounded returns, split reductions, reversal and historical row readability
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
