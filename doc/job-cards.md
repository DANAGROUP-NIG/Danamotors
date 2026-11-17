# JobCard database and workflow

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

| Method and path                                 | Permission                   | Behavior                                                              |
| ----------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `GET /service/job-cards/:id/remarks`            | `jobcard:read`               | `data.document` with id, branchId and remarks.                        |
| `GET /service/estimates/:id/remarks`            | `estimate:read`              | Same, including standalone estimates with an assigned branch.         |
| `PUT` either remarks path                       | `jobcard:remarks:update`     | Strict body with required `remarks` (text/null) and optional `customerRemarks` (text/null); each is at most 5000 characters. Omitted customerRemarks is preserved. |
| `GET /service/job-cards/:id/picking-list/print` | `jobcard:picking-list:print` | Latest estimate's planned parts for the job.                          |
| `GET /service/estimates/:id/picking-list/print` | `jobcard:picking-list:print` | Planned parts for that exact revision.                                |

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
