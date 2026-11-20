# JobCard database and workflow

### Customer categories (issue 142)

The customer profile, customer directory and job-card header use Individual, Corporate, Government, In-House and Others. The directory category filter combines with the existing search and branch scope. Vendor is a party status. Vendor receipts and debtor reports continue to recognize legacy Vendor records during cutover.

Legacy C maps to Corporate, I to Individual, G to Government and F (Fleet) to Corporate. Existing company-owned customer records map to In-House. The migration retains the previous values of changed rows and moves legacy vendors to Vendor status while preserving IDs and related transactions. Review unusual category codes, Vendor records flagged as company-owned, and company-owned customers with conflicting categories before applying the migration. Unknown codes are preserved for review. The customer directory can still open those records.

In-House is the ownership source of truth. The database maintains the compatibility `ownCompanyVehicle` field from category and vendor status. A caller cannot edit that flag independently. Category or party status edits are audited by record ID and old and new values. Branch-scoped staff can edit profiles in their own branch.

Pause customer writes during deployment and verify migrated categories, vendor selection and debtor exclusions before resuming. The migration rollback restores the pre-migration values and is intended for a cutover rollback before writes resume. After writes resume, review and reconcile intervening category or party status changes before any data rollback.

### Reliable parts, QC and promised-date notifications (issue #140)

Request part, formal requisition request/issue/availability, and signed collection now
enqueue events with their business transactions. The existing in-app outbox worker
delivers after commit, retries failures and preserves recipient dedupe keys. QC review
continues through its existing durable job-change event; it does not automatically set
READY. Only the service advisor may do that after passed QC.

The button request remains branch-store-manager only, excluding the actor. Formal
requisition requests preserve existing General Store Manager routing; issued/received
parts go to the advisor/technician, and unavailable parts go to the advisor. The button
response means queued for delivery. Queue persistence failure rolls back the request,
while later delivery failure never reverses stock, collection evidence or job progress.

Optional 24/12-hour reminders retain their global opt-in flag and existing working-hour
policy. They follow the current action owner and dedupe per promised date/window,
independently of status changes. Downtime recovery sends only the currently urgent
window; changed/expired dates and finished work are suppressed. Email and additional
customer reminders remain outside this slice. See jobcard-notification-router.md for
batching, retries, work-hour settings, UTC/Lagos handling and failure replay.

No schema or permission migration is added here. Deploy with the existing notification
router tables already applied. A rollback to older code cannot consume pending workshop
event envelopes correctly: drain them with the compatible worker before rollback and do
not start an older worker while new pending envelopes remain. Retain those rows for
replay only with compatible code. No business records or notification history should
be deleted for rollback. Duplicate recipient keys make replay safe.

### Signed job-opening approval (issue #140)

Opening the administrative job record and authorizing repair costs remain separate steps.
The existing booking checkbox still acknowledges opening terms before conversion. After
the job is saved, the advisor reviews **Job-opening approval** with the customer, captures
their signature and saves the signed revision. This covers both booking conversion and
direct job opening. It never creates or approves an estimate.

The signed document captures the saved job number, customer/vehicle/branch identity,
mileage, service, opening description, customer requests, promised date, statement and
exact JOB_CARD terms/footer. Signer name, representative authority when applicable,
capturing staff ID and server timestamp are recorded separately. The stored termsVersion
is a canonical content hash of the accepted statement, terms and footer. Print and screen use
the shared Africa/Lagos date formatter. Configure official company/branch JOB_CARD
terms through the existing terms settings; the baseline statement authorizes the job
record only and expressly leaves repair-cost approval to the estimate workflow.

**Decision: separate immutable evidence.** JobOpeningSignature holds the signature PNG
and saved JSON document, rather than putting sensitive images into ordinary job-card
responses or reusing EstimateSignature. Canonical hashes bind the document, job scope,
image, signer, capturing staff and timestamp. JSON object key order does not affect
verification. There is no signature update/delete endpoint. The application detects
changed/corrupted evidence; these hashes are not a cryptographic identity certificate
or protection against a database administrator who can rewrite all evidence and audits.

Material opening changes invalidate the current approval and require a new signed
revision. Assignment, progress, findings/work-done text and estimate pricing are outside
the opening scope. Later configuration changes do not retroactively invalidate the
already signed terms. New signatures always use the latest reviewed terms. Previous
revisions remain addressable and print their original snapshot, with a notice when it
differs from the current job. A fresh document hash remounts the capture form so old ink
and acceptance cannot carry over silently to new job details or terms.

New jobs require a current verified signature for transitions to IN_PROGRESS, QC and
READY, including automatic reopening from READY after parts/return/labour edits.
The existing estimate approval, positive eligible advance, role, assigned-technician,
QC and campaign checks still apply independently. UI progress options are disabled
when opening consent is missing; the server is authoritative. The migration exempts
historical jobs to preserve existing workflows. Signing a historical job opts it into
current-signature enforcement; no historical signature or acceptance timestamp is invented.

| Endpoint                                                          | Required permissions            | Behavior                                                                     |
| ----------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| GET /api/service/job-cards/:id/opening-consent                    | jobcard:read                    | Current review document/hash, state and latest image-free signature metadata |
| POST /api/service/job-cards/:id/opening-consent                   | jobcard:read and estimate:sign  | Capture an independent job-opening signature                                 |
| GET /api/service/job-cards/:id/opening-consent/:signatureId/print | jobcard:read and estimate:print | Verified saved revision, signature and original terms                        |

All endpoints enforce job branch access. The existing customer-signature capture/print
permissions are reused without adding seed grants; the permission name does not join
opening approval to an estimate. POST requires accepted=true, expectedHash, UUID
idempotencyKey, signerName and signatureImage, plus relationship/authority for a
representative. PNG limits reuse estimate validation: 64 KiB decoded, 2048 by 1024
pixels, with an 88,000-character request bound. Caller timestamps, actors and snapshots
are rejected. Identical retries return the original revision; reuse with other details
returns 409. Scope/terms conflicts return 409, authorization failures 403, missing
records 404 and input errors 400 with field/message/code. Missing work approval uses
JOB_OPENING_SIGNATURE_REQUIRED. No image or signer name is written into audit details.

**Migration and performance.** Apply 20261117110000_job_opening_signatures after the
parts-collection migration and regenerate Prisma before restarting. The additive
JobCard.openingSignatureRequired column is false for existing rows and defaults to
true for new jobs. JobOpeningSignature uses a unique retry key and unique job/revision
index, which also supports latest-revision reads. Signature creation takes the existing
job row lock and commits evidence, enforcement flag and audit together. Reads use
constant query counts, not per-request-line queries, and do not send images unless
the print permission is present. There are no network side effects in the transaction.

Rollback application code first. Export/retain signature evidence before executing the
provided rollback SQL; dropping the new table destroys evidence. Signed job deletion
is restricted by its foreign key. The migration has not been applied in this session.
Local-only integration coverage is included for JSONB persistence, retries, re-signing,
old-revision printing, historical defaults and schema rollback; execution requires an
explicit disposable localhost TEST_DATABASE_URL. No non-local database may be used.

### Suggested advances (issue #140, approved payment policy)

Each estimate retains its suggested upfront percentage, default 60%, with 20%, 30%,
60% presets and custom values from 0 through 100 with up to two decimal places.
The estimate card and its standalone print show the saved percentage and calculated
amount. Draft editor changes are calculated when the estimate is saved, using the
server's catalogue/model rates rather than an approximate client total.

The pure `estimate-advance.ts` helper calculates the recommendation with Prisma Decimal
and the existing money helper, rounding half up to two decimal places. For example,
60% of NGN 100.01 is NGN 60.01. The existing `job-deposit.service.ts` export remains
compatible. Both screen and print use the shared en-NG currency formatter.

The recommendation is not a minimum or an exact-payment requirement. An eligible
advance of NGN 0.01, below-target, exact-target or above-target is accepted. A zero
recommended percentage does not remove the positive-payment requirement. Work starts
and automatic rework still require an active, positive, non-cheque, appropriately dated
service advance reserved for the job; approval and role/status checks apply separately.
Existing customer/branch ownership, receipt idempotency, reservation, reversal and
final-invoice allocation rules remain unchanged. No new payment override is introduced.

GET job-card estimate data already includes `upfrontPaymentPercent` and `upfrontAmount`.
The standalone estimate-print response now includes these same additive fields, derived
from that saved revision. Historical signatures are not rewritten by this display change.
There is no migration, backfill, permission change or new dependency for this slice.

### Technician workflow review (issue #140)

Assign technicians through **Workshop actions**, using `assignment:create`. The creation
form currently records a group; its technician picker was intentionally hidden in the
existing UI. The assignment picker previously included inactive accounts that the API
correctly rejected. It now requests `GET /api/workshop/technicians?activeOnly=true`;
the normal directory still includes inactive technicians. Assignment remains branch-scoped,
rechecks closed/billed state under the job lock, and audits previous/new technician IDs.

The technician's **Job done: send for QC** action moves an assigned job to QC. The server
returns no progress actions to an unassigned technician and remains authoritative for
assignment ownership. The existing estimate approval and positive-advance gates remain.
60% is a recommendation; this slice does not introduce a percentage threshold.

| Role                | From          | To                  | Additional rule                                |
| ------------------- | ------------- | ------------------- | ---------------------------------------------- |
| Assigned technician | OPEN          | IN_PROGRESS         | Approved scope and positive eligible advance   |
| Assigned technician | IN_PROGRESS   | QC or WAITING_PARTS | Approved scope required for QC                 |
| Assigned technician | WAITING_PARTS | IN_PROGRESS or QC   | Existing deposit/scope gates apply             |
| Assigned technician | QC            | IN_PROGRESS         | QC failed and positive eligible advance        |
| Service advisor     | QC            | READY               | Passed QC, recorded scope and campaign answers |

The full role policy remains `JOB_TRANSITION_ROLES`; this table describes the technician
handoff and advisor-ready subset. A QC reviewer does not automatically mark a job READY.

**Parts collection:** new calls to `POST /api/workshop/parts/:id/receive` send
`{ confirmed: true, signatureImage: "data:image/png;base64,..." }`. This tightens the
former confirmation-only contract; deploy the matching client and server together.
Only the active, same-branch assigned technician may sign. PNG validation reuses the
estimate signature limits: 64 KiB decoded and at most 2048 by 1024 pixels. A shared
canvas also serves estimate approval. Signature image, identity and server timestamp
are stored in a separate `PartCollectionSignature` row so ordinary job-card responses
and audit entries never include the image. The hash binds the original issuance scope,
signer, timestamp and image. Application code never updates signed evidence; retries
cannot overwrite it. Historical unsigned confirmations are preserved without inventing
a signature. New collection on ready, billed, delivered, cancelled or cancelled-requisition
work is rejected. Job-then-issuance locks serialize signing with reassignment and billing.

Technician open/closed counts use one grouped query for the requested technician page,
with branch filtering, then one in-memory accumulation. BILLED, DELIVERED and CANCELLED
(including normalized legacy forms) count as closed. Empty pages skip the aggregate;
no cache or new count index is introduced without a measured local query plan.

After a collection commits, the notification worker sends **Parts collection confirmed** to the technician who signed and the named service advisor, when eligible in the job branch. Delivery uses the recorded signer even if the job is reassigned while the event is pending. Retrying collection uses the original receipt and notification occurrence.

Deployment: apply `20261117100000_part_collection_signatures` and regenerate Prisma
before restarting. The additive table uses its issuance primary key for lookup/idempotency;
existing rows need no backfill. Roll back application behavior first; export and retain
signature evidence before using the provided rollback SQL. This migration has not been
applied during development. No permission grants or dependencies changed.

### Decision on issuing parts against an estimate

Direct parts issues and requisitions that move stock require approved estimate scope for the actual parts. A blocked issue leaves stock unchanged and reports the approval problem. Ask the service advisor to prepare or revise the estimate, record customer approval, and retry the issue. No draft is started by the issue request. The existing upfront payment and deposit checks remain in their respective workflow steps.

### QC review notifications

A recorded QC pass or failure queues a background in-app notification for the technician assigned when the review was recorded. The technician must still have an active account in the job branch when delivery occurs. Jobs with a team only or no assignment retain their advisor and workshop-manager handoffs where applicable. The notification links to the job card for QC notes. An identical retry or return to work after a failure does not send another review message. A later review can send a new message.

### Opening without a technician

A job card can open without a technician or workshop team. The job-card list and detail show **Not assigned** for a missing technician. Select **Unassigned technician** in the job-card list to find these jobs, including team-only jobs. The branch-scoped list API accepts `unassignedTechnician=true`.

Open the job card and use **Assign technician** to select an active technician from the same branch. The assignment endpoint requires `assignment:create` and records the change in the audit log. Technician collection and technician-owned progress use the individual assignment.

The opening API input remains compatible with existing clients that send technician or team IDs. Both database fields already allow null, so there is no migration or backfill. A rollback can restore validation for new requests while preserving already opened jobs.

### Job-opening validation errors

Validation failures retain the existing HTTP 400 response and add an issue code:
`{ "status": "error", "statusCode": 400, "message": "Validation failed", "code": "FIELD_VALIDATION", "errors": [{ "field": "body.complaints.0.description", "message": "Required", "code": "too_small" }] }`.
The creation form removes the request `body.` prefix, preserves nested request-row paths,
and maps `promisedAt` to the promised-date control before selecting the affected tab.
Duplicate-field failures retain HTTP 409 and include the per-field code `duplicate`.

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
Billed cards allow delivery only through lifecycle writes; delivered and cancelled cards remain closed. The audited remarks-only exception below remains available.

Opening from an appointment copies its saved customer, vehicle and service through the single-conversion endpoint.
The appointment's vehicle and branch must match. Vehicle lookup searches all
vehicles. Direct job opening preserves vehicle selection when changing the bill-to customer; booking conversion uses the saved booking customer, vehicle and branch;
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

Every revision records the actor and full before/after scope in the audit log. Financial estimate scope is never edited in place; the audited remarks-only exception below does not change signed content. The shared job lock prevents concurrent work, decisions and revisions from bypassing the current version.

**Get customer signature** shows the exact version, line quantities, rates, amounts and total before capture. The customer draws with mouse or touch, confirms their name and chooses Approve or Decline. Decline requires a reason. A different signer requires a recorded relationship and is shown as signing for the customer. Capture saves approval and signature atomically with capturing user, device/IP, Lagos timestamp, version, total and SHA-256 content hash. PNG references are private data URLs, limited to 64 KiB and 2048 by 1024 pixels; no new dependency or public asset endpoint is introduced. Existing customer documents use URL references and have no upload provider to reuse.

The API requires `estimate:sign`, `expectedVersion` and `expectedHash` from the displayed estimate. Missing/stale evidence fails. An Admin/SuperAdmin can instead supply a nonempty `overrideReason`; this explicit override is audited. No ordinary unsigned approval is accepted. The existing portal approval call cannot authorize new work without counter signature evidence; remote drawing/typed consent is deferred, with nullable staff capture, channel and consent fields reserved in the model.

New approvals have `signatureRequired=true`. Only pre-migration approvals are marked false, remain valid and display **approved before signatures were introduced**. A signed version/total/hash mismatch displays **invalid** and blocks the work and billing scope gate. A declined revision blocks work until a new revision is signed. All customer-facing dates use Africa/Lagos.

### Standalone print

**Print estimate** opens `/job-cards/:id/estimates/:estimateId/print`. The client and its API data endpoint require `estimate:print`; API branch ownership and job/estimate association are enforced. Browser printing produces an A4 portrait estimate with company/branch, customer/vehicle/job details, complaints, parts, labour, service charge and total, terms, signature or blank signature/date lines, print date and page numbering. A superseded estimate identifies its successor revision. This is labelled **Not a bill**. Internal remarks, QC, assignments, source flags, costs, margins, charge types and other estimates are excluded by an explicit server projection. The job-card print hides the entire estimate section.

This checkout did not contain the issue's referenced `DocumentTerms` model. The same additive migration creates it. Configure `type=JOB_ESTIMATE`, numbered `terms` and `footer` for a branch; that record takes precedence over the company-wide null-branch record. Company header fields come from the company-wide record. No live terms or company settings are written by this task; deployments should populate the applicable records before customer printing.

### Deployment and local checks

Apply `20261020100000_estimate_versions_signatures` through the normal approved deployment workflow, regenerate Prisma and reseed role definitions. The migration backfills historical version order and links without duplicating #79 estimate number/date/standalone fields. Existing approvals retain their validity; future approvals default to requiring signatures. No database migration or seed was run against any database during implementation.

Targeted checks: backend `estimate-revision`, `estimate-signature`, `estimate-approval`, `estimate-decisions`, `estimate-print`, `job-card-visibility`, and `roles.issue117` tests. Frontend: `node --test test/issue117-components.test.mjs` verifies required-field logic and rendered print exclusions/access/signature states.

## Service transactions (issue #113)

The **Service transactions** section on a job card contains Requisition, Returns, Labour and Remarks tabs. Booking creation and conversion remain in **Appointments**. The six reference screens are represented by these existing flows and internal print pages; no second customer, vehicle, appointment, labour or stock model was introduced. Customer and vehicle selectors retain their existing inline creation forms and duplicate warnings.

All API paths below are relative to `/api`. Authentication and the listed permission are required. Staff are restricted to their branch; foreign-branch requests return 403 unless they have `branch:all` or are SuperAdmin. An unassigned legacy standalone estimate needs a branch before remarks/print actions, even for all-branch staff. Client controls do not replace these server checks. Dates use **Africa/Lagos**; send timestamps with an explicit offset or `Z`, and interpret date-only booking filters as Lagos days.

### Booking and conversion

| Method and path                          | Permission                                    | Behavior                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /service/appointments`             | `appointment:create`                          | Create from existing customer/vehicle IDs, branchName and scheduledAt; optional serviceTypeId, serviceId, requests, mileage, AC and follow-up job. |
| `GET /service/appointments`              | `appointment:read`                            | Paginated list; search includes number, status accepts canonical booking or legacy lifecycle values.                                               |
| `GET /service/appointments/:id`          | `appointment:read`                            | Booking, linked vehicle/customer, requests, totals and linked jobs.                                                                                |
| `PUT /service/appointments/:id`          | `appointment:update`                          | Edit/reschedule a booked, unlinked booking; cancel with a reason or record no-show.                                                                |
| `POST /service/appointments/:id/convert` | `appointment:update` **and** `jobcard:create` | Run normal opening checks and create exactly one linked job atomically.                                                                            |
| `DELETE /service/appointments/:id`       | `appointment:delete`                          | Only legacy unnumbered, unlinked eligible rows; numbered/converted/linked bookings return 409.                                                     |

`bookingNumber` and `createdAt` are automatic; `scheduledAt` is booked-for. Numbers use the branch sequence and Lagos year, stored as `<branch UUID>/<YYYY + six-digit sequence>` to satisfy global uniqueness. TODO(confirm): replace the display prefix only when a stable business branch code is agreed; historical numbers are not rewritten. Canonical `bookingStatus` is `BOOKED`, `CONVERTED`, `CANCELLED` or `NO_SHOW`; legacy `status` remains a separate appointment/workshop lifecycle field.

Booking creation requires a nonempty customer request, retaining #140's simple text flow. The optional **Add request details** action reuses the job-card request editor for 1-100 rows with description, active complaint/defect codes, parts, oil and labour estimates. The same requests field accepts either text (1-2000 characters) or structured rows; both persist to the existing AppointmentRequest model. Header totals remain server-derived. Detailed existing bookings open with all codes and amounts intact; unchanged request data is omitted on save so rescheduling does not rewrite request IDs. Row descriptions/codes and amounts carry into job complaints during conversion. There is no second customer, vehicle or request model. Customer completeness from #144 remains separate. `serviceTypeId` names a workshop SERVICE_TYPE; `serviceId` is the separate optional appointment catalogue service. An optional followUpJobId must be an earlier same-vehicle, same-branch, non-cancelled job; it does not silently mark a repeat job.

Booking picker minimums use Africa/Lagos, independently of the browser timezone. Optional duration is positive whole minutes within the database integer range. Legacy terminal spellings (case, whitespace, canceled/cancelled and no-show separators) remain closed to editing and conversion; cancellation aliases still require a reason.

Cancellation requires `cancelReason`, including through legacy `status: Cancelled`. Cancellation/no-show releases the active-booking restriction. Terminal/converted/linked bookings cannot be reopened or have their booking fields/requests replaced. A stale conversion is rejected rather than copying an outdated booking.

Conversion carries saved customer, vehicle, service, AC and requests. Supply the normal bay, adviser, technician and/or team and promisedAt; supply workshop service type/mileage if absent from the booking. Empty booking requests remain allowed, but opening needs at least one caller complaint. Mileage cannot move backwards without the existing audited replacement flow. Warranty coverage and every open campaign must be acknowledged; `409 WARRANTY_ACK_REQUIRED` includes the current check. Existing bill-to rules, coupon/model service rules, stock approval gates and staff assignment checks still apply. Booking mileage is a proposed reading and does not update actual vehicle mileage until check-in or opening. The job's normal model service charge is added to its estimates; booking request totals exclude that charge.

Vehicle then booking locks serialize edits and conversions. Job creation, job numbering, appointmentId link, CONVERTED status, actual mileage and audit commit together. The legacy job-opening API applies the same copying/single-conversion rule. Cancelling the generated job does not permit a second conversion.

### Parts requisitions and returns

Requisition lines enforce `quantityIssued <= quantityRequired` on the server as
well as in the form. Zero issued quantity remains valid for request-only lines.
The entry form reuses inventory lookups to preview the part flag, UOM, normal and
warranty rates, and the job branch's on-hand/available stock, location and bin card.
These previews require the existing part/stock read permissions and never replace
the transactional stock check. Saves lock stock in stable part order, then read
the required stock fields once for all lines and reuse those snapshots.

| Method and path                                   | Permission           | Result in `data`                                   |
| ------------------------------------------------- | -------------------- | -------------------------------------------------- |
| `GET /inventory/requisitions`                     | `requisition:read`   | `requisitions` list                                |
| `POST /inventory/requisitions`                    | `requisition:create` | `requisition`, lines and totals                    |
| `GET /inventory/requisitions/:id` or `/:id/print` | `requisition:read`   | Internal requisition detail/print projection       |
| `POST /inventory/requisitions/:id/cancel`         | `requisition:cancel` | Cancelled requisition after stock/charge reversal  |
| `GET /inventory/return-slips`                     | `requisition:read`   | `returnSlips` list                                 |
| `POST /inventory/return-slips`                    | `requisition:create` | `returnSlip`, lines and totals                     |
| `GET /inventory/return-slips/:id` or `/:id/print` | `requisition:read`   | Internal return detail/print projection            |
| `POST /inventory/return-slips/:id/cancel`         | `requisition:cancel` | Cancelled return after reversing the return effect |

Lists accept branchId/jobCardId, page (1), limit (25, maximum 100) and chargeType; returns additionally accept requisitionId. Requisition input contains branchId, jobCardId, chargeType, optional group/engineer/campaign/goodwillReason and 1-100 distinct part lines (sparePartId, quantityRequired, quantityIssued). Quantities are whole numbers; issued cannot exceed branch available stock after reservations. Scope must remain within the approved estimate. The part number is read from the linked part master; descriptions, source flag, UOM, bin/location, rates and financial shares use their saved document data where present. Decimal rate/amount snapshots serialize as strings; footer totals are numbers.

Payer rules: CUSTOMER is non-warranty; WARRANTY is 100/0 and needs eligible coverage/case and a warranty-applicable part; FREE needs a linked campaign; GOODWILL additionally requires `requisition:goodwill`, a reason and approval/customer percentages totaling 100. A partial approval creates separate approved and customer JobCardLines whose amounts reconcile to the document amount. Rates are resolved and snapshotted server-side, never typed into these requests. Catalogue changes do not reprice saved documents. Source flags are internal and excluded from customer estimate/billing print projections.

A return selects one requisition and distinct requisitionLineIds with positive quantities, bounded by issued minus active previous returns. It restores branch stock and proportionally reduces both payer shares at saved rates. Cancelling a return reissues that quantity and restores those charges. Cancelling a requisition reverses its original issue; cancel active return slips first. Cancellation requires a nonempty reason and audits prior values; bill/claim references protect history.

Return detail and print rows expose the saved requisition's required/issued
quantities, location, bin card and warranty rate alongside the return quantity
and saved return rate/amount. These are historical snapshots, not current stock.
Print grids keep required, issued and returned quantities in separate columns.
Cancellation locks stock in stable part order and reads availability in one batch;
reserved stock cannot be reissued. Successive partial returns recalculate remaining
payer shares from the original saved rate and percentages, so full return and
out-of-order cancellation restore the original charges without rounding drift.

No create, return or cancellation is allowed on billed/delivered/cancelled jobs or jobs with an active bill. Requisition/return changes to ready work reopen it for QC. Concurrent stock/return writes and audit failures cannot leave partial stock or charge changes.

### Labour slips and vehicle ready

Editing a saved labour line retains its campaign, goodwill reason, assignment and
group. For an employee who also has a login, the edit submits only `mechanicId`;
the server resolves the associated login rather than accepting two assignees.
Hours-only edits keep saved standard hours, rate and TIME/FIXED pricing. The staff
grid and internal print show the line's group alongside its mechanic/technician.

| Method and path                                 | Permission              | Behavior                                                                       |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `GET /service/labour-slips`                     | `jobcard:read`          | Paginated branch/job list, same page/limit defaults as parts documents.        |
| `POST /service/labour-slips`                    | `jobcard:labour:update` | Create a slip with branch/job, optional header group/engineer and 1-100 lines. |
| `GET /service/labour-slips/:id` or `/:id/print` | `jobcard:read`          | Internal saved hours, rates, mechanic, payer and totals.                       |
| `POST /service/labour-slips/:id/lines`          | `jobcard:labour:update` | Add one line; returns 200 with `data.labourSlip`.                              |
| `PUT /service/labour-slips/:id/lines/:lineId`   | `jobcard:labour:update` | Replace one saved line while preserving applicable snapshots.                  |
| `PUT /service/job-cards/:id`                    | `jobcard:update`        | Existing workDone and lifecycle endpoint; READY still requires passed QC.      |

Each line selects exactly one technicianId login **or** mechanicId employee (including employees without logins), an operation, chargeType, optional chargedHours/group/campaign/reason. Standard hours, rate and pricing mode come from the vehicle model schedule. chargedHours defaults to standardHours; TIME uses charged hours times saved rate, while FIXED keeps the saved model amount. Existing `JobCardLabour.hours` remains the charged-hours column and the API also exposes chargedHours. Editing the same operation preserves rate/standard-hour/pricing snapshots; another operation resolves its model schedule.

Labour GOODWILL requires `warranty:update` and a reason (distinct from parts goodwill permission); WARRANTY/FREE retain eligibility/linkage rules. Footer warrantyAmount, nonWarrantyAmount, freeAmount and separate goodwillAmount reconcile to totalAmount. Closed jobs/active bills and protected claim/bill references reject edits. Changes reopen ready work for QC. **Work done** persists only in workDone. **Vehicle ready** uses the existing QC -> passed inspection -> READY transition; it does not bypass approval, recorded-scope or QC gates.

### Remarks and internal picking print

| Method and path                                 | Permission                   | Behavior                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /service/job-cards/:id/remarks`            | `jobcard:read`               | `data.document` with id, branchId and remarks.                                                                                                                     |
| `GET /service/estimates/:id/remarks`            | `estimate:read`              | Same, including standalone estimates with an assigned branch.                                                                                                      |
| `PUT` either remarks path                       | `jobcard:remarks:update`     | Strict body with required `remarks` (text/null) and optional `customerRemarks` (text/null); each is at most 5000 characters. Omitted customerRemarks is preserved. |
| `GET /service/job-cards/:id/picking-list/print` | `jobcard:picking-list:print` | Latest estimate's planned parts for the job.                                                                                                                       |
| `GET /service/estimates/:id/picking-list/print` | `jobcard:picking-list:print` | Planned parts for that exact revision.                                                                                                                             |

Internal `remarks` stay separate from explicit customer-visible `customerRemarks` on JobCard and Estimate. The remarks editor shows number/date/status, job date, registration, VIN, model/variant, mileage, service and customer name read-only. Staff must enter a customer explanation explicitly; existing internal text is never copied. Job card, estimate and bill customer prints include only that explanation. Combined bills show explanations for their linked jobs. Internal job-card remarks are hidden when printing. Estimate explanations are separately editable metadata and do not change the signed financial content hash, version or approval.

Remarks remain editable in every status, including billed/delivered/cancelled jobs and approved/rejected/superseded estimates. Blank text becomes null; no-op saves do not create false change events. Actual changes atomically audit actor, branch, document ID and old/new values. They do not alter workDone, amounts, signed financial content, version, stock or lifecycle. Customer explanation changes also audit their old/new values; no-op saves do not create events. Remarks writes refresh cached customer print and invoice data.

Picking print returns `data.pickingList` with branch/job/estimate references, version/status/currency, vehicle/service/mileage, PART/INCLUDED_PART rows, part number/flag/UOM, planned quantity, saved price/amount, totals, remarks, printedAt and timeZone. TODO(confirm), safe source: use estimate-planned parts rather than issued payer shares, so split warranty/customer lines do not double physical quantities. Jobs without an estimate return 400; missing legacy catalogue codes remain null. A print audit event is the only write: no stored or numbered service picking list, sequence allocation, stock movement or change to the existing branch-indent/STN PickingList.

Picking headers show the job date separately from the estimate date, the service code/description, and the saved checklist text. A saved text matching a CHECKLIST master code (case-insensitive, ignoring surrounding whitespace) also displays that code and description, including inactive historical masters. Other text remains notes with code shown as not recorded. TODO(confirm): JobCard has no direct checklist-master association; live mileage/model checklist parts are not automatically appended to a historical estimate. Planned checklist parts must already be represented by that estimate's PART/INCLUDED_PART rows. Printing never adds stock obligations or changes approved quantities/rates.

Staff print pages are `/service-transactions/{requisitions|return-slips|labour-slips|job-picking|estimate-picking}/:id/print`. They are separate from the customer-facing estimate print above; internal remarks/source flags do not appear on customer documents; only explicitly entered customerRemarks is published.

### Deployment, examples and verification

The shared `nextSequenceNumber` helper derives its year directly in Africa/Lagos.
Booking, requisition, return and labour callers use the actual allocation timestamp,
without synthetic mid-year dates. Existing branch/type keys and historical numbers
are unchanged. The atomic sequence upsert remains inside the caller's transaction;
this correction requires no migration, backfill or new index. Application rollback
must retain allocated counters and saved document numbers to avoid number reuse.

Apply additive migrations through the normal approved deployment workflow, in order: `20261021100000_service_transaction_documents`, `20261021110000_requisition_permissions`, `20261021120000_labour_pricing_snapshot`, `20261021130000_service_document_permissions`, `20261021140000_appointment_request_defect_code_repair`. The final migration repairs an existing AppointmentRequest table missing the nullable defectCode column, without changing existing data; it is safe when the column already exists. Regenerate Prisma after schema deployment. Role defaults live in ROLE_PERMISSIONS because seeds reset grants; the additive permission migrations update existing installations idempotently. No legacy business data backfill/reset is required. Historical null labour pricing remains unknown rather than being inferred or rewritten.

Swagger's assembled service transaction paths/schemas are maintained in `server/src/modules/service/service-transactions.openapi.ts` and merged by `server/src/config/swagger.ts` in both source and built runtime. Examples use synthetic UUID placeholders: replace them with valid records from the intended local/test branch. They include bookings/cancellation/no-show/conversion, all four parts payers, returns/cancellation, technician/employee labour, remarks/clearing, workDone and READY. Never run illustrative writes against a non-local database during development.

Targeted backend checks: `service-transactions.openapi`, `booking`, `requisition`, `return-slip`, `labour-slip`, `service-document` and existing estimate-print/signature tests. Database suites require TEST_DATABASE_URL and a disposable localhost cluster. Frontend checks are `node --test test/*.mjs`, scoped ESLint, TypeScript and a production build; the older `tests/*.cjs` scripts separately require their external DOM QA runtime. P7 verified rendered/pure/API contracts, not interactive browser or physical print layout. Per-phase results and the complete file lists are in [issue-113-progress.md](progress/issue-113-progress.md).

### Registered requisition alternatives (issue 140)

Store staff can expand **Alternates and other sources** after choosing the requested part. The branch-scoped chooser lists active records in its registered catalogue family, including records without stock. Filter by repaired, original Mobis, used, local purchase or another supported source; available stock excludes reservations. Register missing source records through Part Master first. Selection does not create purchase orders or infer fitment.

Selecting a different supply part resets issued quantity to zero. Enter a substitution reason and explicitly set any quantity to issue. The server checks the actual selected part's stock, warranty eligibility, price and approved estimate scope. An approval for the original part alone cannot authorize issuing its substitute. Request-only lines remain uncharged. Saved internal slips and audit records retain the requested part and reason; historical records remain unknown rather than backfilled.

`GET /inventory/requisitions/part-options` requires `requisition:create`, `sparepart:read` and `stock:read`, with existing branch access. Queries accept `partId`, `branchId`, optional source/search, and bounded page/limit. Apply additive migration `20261117120000_requisition_part_substitutions` and regenerate Prisma before deploying this slice. The supplied rollback removes only the new trace fields and relation; export that evidence before rollback. No migration was applied during development.
### Billing readiness audit (issue 140)

The billable-job selector, preview and bill creation require a ready job with passed QC, or a job delivered on approved credit with passed QC. Existing ready aliases remain supported. A ready/completed status alone does not prove completion: pending, failed and missing QC block billing, including historical jobs without QC evidence. Record a valid passed inspection through the existing QC workflow; do not infer or backfill it from the job status.

Vehicle consolidation includes every open, unbilled vehicle job. Each must pass readiness, QC, branch/customer consistency and approved-scope checks. One unfinished member blocks the whole bill. Preview review subtotals cover all jobs and report a failing member's approval state. Creation repeats checks inside the existing serializable transaction and customer/vehicle/job locks, preserving duplicate-bill checks, atomic links/markers, cancellation and delivered-on-credit behavior. Actual concurrent database behavior remains unverified without a disposable local database.
### Job-card transaction entry cleanup (2026-11-18)

Use Service transactions, Requisition as the job-card entry point for requested and issued parts. Saving a positive issued quantity already creates the issuance; do not issue those units again. Use Service transactions, Labour for new labour and slip-managed edits. The separate direct-issue and direct-labour forms have been removed from the job-card screen. Underlying compatibility APIs and historical data remain intact.

Issued parts and collection now shows all issue history, including closed jobs and cancelled requisitions. Only the assigned technician with jobprogress:update can open the existing signature capture on an eligible open job. Signatures are rendered on demand, one at a time; images are not fetched in job detail. Cancelled requisition issues cannot be collected. Requisition-linked returns use the Returns tab. Older direct issues retain their return action; the return controller derives the actor from the session and the branch from the issuance, and returnedById is optional for backwards-compatible requests.

Recorded labour is a read-only operational summary of both historical and slip-managed entries. It uses the existing authorized job-detail response, including mechanic/technician names; rate and amount visibility still requires estimate:read or invoice:read and existing server-side monetary redaction. Work done, QC, readiness and billing behavior are unchanged. The summaries add no HTTP reads, catalogue lookups or staff lookup calls. Mutations refresh the shared job detail; collection only marks job lists stale rather than refetching every list. No response-time benchmark or live database EXPLAIN was performed.
