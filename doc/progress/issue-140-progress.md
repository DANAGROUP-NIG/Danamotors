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
