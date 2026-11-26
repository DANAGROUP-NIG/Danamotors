# Separate booking conversion consent

1. Separate opening consent (JOB_CARD terms + checkbox) from estimate approval (JOB_ESTIMATE terms + signature).
2. Show terms when Convert to job card is clicked; reveal the checkbox after the terms reach the bottom; continue into the existing opening form only after acceptance.
3. Validate the accepted terms hash against the current appointment and effective branch/company terms inside the conversion transaction; save an immutable opening consent snapshot and audit event.
4. Add focused backend/frontend regression coverage and scoped checks. No database writes, browser runs or changes to the advance-payment policy.

## Progress
- Implemented the separate modal, API terms document, conversion proof, dedicated job-card consent storage and estimate-only approval wording.
- Reused the existing JOB_CARD terms type and branch/company fallback. Existing estimate signatures and opening records remain separate. Existing user edits are preserved on feature branch DevPastey.
- The opening snapshot records the accepted terms, appointment identity/version, server timestamp and capturing staff member, with a separate audit event. Missing, unchecked or stale consent is rejected by the backend, including the legacy opening endpoint.
- The checkbox appears once the terms reach the bottom; short terms that fit entirely in view already satisfy this condition. Closing/reopening the modal or receiving changed terms resets acceptance.
- Validation: focused consent, estimate decisions, document terms, booking permissions, OpenAPI and job-card regression suites passed; 18 frontend tests passed; scoped frontend ESLint, both TypeScript checks, editor diagnostics and whitespace checks passed. Existing integration fixtures were updated, but database integration tests were not run.
- Additive migration `20261111090000_booking_opening_consent` is written but not applied. No database writes or browser runs were performed. Apply it to the intended local database before testing persistence; existing jobs retain null historical opening consent.
