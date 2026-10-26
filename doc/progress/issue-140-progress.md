# Issue 140 progress

Branch: feat/issue-140-dry-run. Suggestions excluded: email, job list sorting, customer billing filter, finance discounts.

## Mapping
Existing ServiceAppointment.requests / AppointmentRequest and JobCard.complaints store complaints; no parallel complaint field/table needed. Both use WorkshopMaster SERVICE_TYPE; Service is a separate appointment catalog. JobCard status is a string normalized by canonicalJobStatus. Workflow lives in job-card-workflow.service; assignment/QC in workshop.service; parts in requisition/inventory; billing in finance/job-billing.service. EstimateSignature already stores capture, terms and server timestamp. Notification model, repository, authenticated list/read/count endpoints and polling UI exist. Permissions live in ROLE_PERMISSIONS. Background timer pattern exists in finance/credit-terms.

## Phase 1
Required customer requests reuse existing DB rows. Protected appointment modal, progressive booking detail disclosure, registration validation, Lagos promised-date validation and field-error display added. No migration needed for this phase.

Validation: booking.logic tests 4/4 passed; backend typecheck passed. Targeted frontend lint passed; frontend typecheck rechecking a required-field compatibility fix. Runtime uses installed Node directly because nvm shim has no active version.
