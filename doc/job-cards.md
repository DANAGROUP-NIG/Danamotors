# JobCard database and workflow

The generated Prisma client and database must use the same migrations. A missing
`JobCard.billedAt` column means the billing migration has not been deployed.
From `server`, run `npm run prisma:deploy`, then `npm run prisma:generate` before
starting the server. Do not reset the database or remove the Prisma field.

`20260928130000_job_billing_receipts_tally` adds the column and the related labour,
invoice and receipt structures used by JobCard details. It also converts existing
payments to receipts; run `prisma/billing-migration-dry-run.sql` before deploying
to another environment and review duplicate bills and ambiguous receipt matches.

New job cards use `OPEN → IN_PROGRESS → QC → READY → BILLED → DELIVERED`,
or `CANCELLED` before billing. Job-card list filters include legacy aliases such as
Ready and Completed. An existing active bill prevents creating a second bill.
Billed cards allow delivery only; delivered and cancelled cards remain closed.

Opening from an appointment prefills customer, vehicle and the existing service.
The appointment's vehicle and branch must match. Vehicle lookup searches all
vehicles, and changing the bill-to customer preserves the vehicle and booking;
it does not change ownership. Recent jobs use `JOB_REPEAT_WINDOW_DAYS`; repeats
require a previous job and reason. Saving opens the new card's detail page.

Delivery requires a bill or admin credit approval, a delivery advisor and, after
the promised time, one to six late-delivery reasons. Delivery generates a gate
pass with a separate print action. Jobs delivered on approved credit remain
billable; subsequent billing preserves their delivered status and gate pass.
The service catalog and service-type behavior remain unchanged.

Verification: run `npm test -- --runInBand` and `npm run typecheck` in `server`, and
`npx tsc --noEmit --incremental false` in `client`.

## Versioned estimates and customer signatures (issue #117)

The workshop manager prepares the first estimate with `POST /api/service/job-cards/:id/estimates` (`estimate:create`). A job with an estimate cannot use create again. An adviser or service manager uses **Revise estimate**, calling `POST /api/service/estimates/:id/revisions` (`estimate:revise`) with the copied/updated description and lines. The server reuses catalogue pricing rules, recalculates totals and creates version N+1 linked to the latest source. The old version becomes `SUPERSEDED`; its lines and signature remain intact. Revision Required links to the estimate section. Declined and cancelled estimates are revised through the same path; closed/cancelled job cards remain closed.

Every revision records the actor and full before/after scope in the audit log. Estimates are never edited in place. The shared job lock prevents concurrent work, decisions and revisions from bypassing the current version.

**Get customer signature** shows the exact version, line quantities, rates, amounts and total before capture. The customer draws with mouse or touch, confirms their name and chooses Approve or Decline. Decline requires a reason. A different signer requires a recorded relationship and is shown as signing for the customer. Capture saves approval and signature atomically with capturing user, device/IP, Lagos timestamp, version, total and SHA-256 content hash. PNG references are private data URLs, limited to 64 KiB and 2048 by 1024 pixels; no new dependency or public asset endpoint is introduced. Existing customer documents use URL references and have no upload provider to reuse.

The API requires `estimate:sign`, `expectedVersion` and `expectedHash` from the displayed estimate. Missing/stale evidence fails. An Admin/SuperAdmin can instead supply a nonempty `overrideReason`; this explicit override is audited. No ordinary unsigned approval is accepted. The existing portal approval call cannot authorize new work without counter signature evidence; remote drawing/typed consent is deferred, with nullable staff capture, channel and consent fields reserved in the model.

New approvals have `signatureRequired=true`. Only pre-migration approvals are marked false, remain valid and display **approved before signatures were introduced**. A signed version/total/hash mismatch displays **invalid** and blocks the work and billing scope gate. A declined revision blocks work until a new revision is signed. All customer-facing dates use Africa/Lagos.

### Standalone print

**Print estimate** opens `/job-cards/:id/estimates/:estimateId/print`. The client and its API data endpoint require `estimate:print`; API branch ownership and job/estimate association are enforced. Browser printing produces an A4 portrait estimate with company/branch, customer/vehicle/job details, complaints, parts, labour, service charge and total, terms, signature or blank signature/date lines, print date and page numbering. A superseded estimate identifies its successor revision. This is labelled **Not a bill**. Internal remarks, QC, assignments, source flags, costs, margins, charge types and other estimates are excluded by an explicit server projection. The job-card print hides the entire estimate section.

This checkout did not contain the issue's referenced `DocumentTerms` model. The same additive migration creates it. Configure `type=JOB_ESTIMATE`, numbered `terms` and `footer` for a branch; that record takes precedence over the company-wide null-branch record. Company header fields come from the company-wide record. No live terms or company settings are written by this task; deployments should populate the applicable records before customer printing.

### Deployment and local checks

Apply `20261020100000_estimate_versions_signatures` through the normal approved deployment workflow, regenerate Prisma and reseed role definitions. The migration backfills historical version order and links without duplicating #79 estimate number/date/standalone fields. Existing approvals retain their validity; future approvals default to requiring signatures. No database migration or seed was run against any database during implementation.

Targeted checks: backend `estimate-revision`, `estimate-signature`, `estimate-approval`, `estimate-decisions`, `estimate-print`, `job-card-visibility`, and `roles.issue117` tests. Frontend: `node --test test/issue117-components.test.mjs` verifies required-field logic and rendered print exclusions/access/signature states.
