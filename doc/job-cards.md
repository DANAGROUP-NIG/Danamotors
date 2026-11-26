# JobCard database and workflow

## Staged job card (job card revamp, phase 0)

The job card is being rebuilt as "one job, one step, one owner" (`doc/plans/jobcard-ux-revamp-prompts.md`). Phase 0 added the model underneath. Phase 1 replaced the job card page with the staged frame described below.

### Stage model

`JobCard.stage` (enum `JobStage`) is where the job is: `CHECK_IN`, `DIAGNOSIS`, `WARRANTY`, `ESTIMATE`, `REPAIR`, `QUALITY_CHECK`, `BILLING`, `DELIVERY`, then `CLOSED`, or `CANCELLED`. The 8 working steps run in that order. The warranty step is used only when the vehicle is in warranty, has an open campaign or a warranty case; otherwise diagnosis hands straight to the estimate and the warranty step shows as skipped. A failed quality check returns the job to repair. A supplementary estimate during repair does not change the step.

`stageOwnerId` and `stageOwnerRole` say who holds the job, and `stageEnteredAt` since when. Owners follow "Default business decisions" in `doc/plans/jobcard-revamp-implementation.md` (`TODO(confirm)`):

| Step | Owner |
|---|---|
| Check-in, estimate | The job's service advisor |
| Diagnosis, repair | The assigned technician; the workshop supervisor (WorkshopManager role) until one is assigned |
| Warranty | Warranty officers |
| Quality check | The quality inspector if set, else the workshop supervisor |
| Billing | The service advisor until the job is marked ready, then billing officers |
| Delivery | The delivery advisor, else the service advisor |

`JobStageEvent` records every step move or owner change: from and to step, action, actor, new owner, note and the client request ID (unique per job). Each one also writes a `JOB_STAGE_CHANGED` audit entry.

### Stage and status

`JobCard.status` stays, because reports, billing, late deliveries, PSF, MIS and repeat jobs read it. The stage and status always agree:

| Step | Status |
|---|---|
| Check-in, diagnosis, warranty, estimate | OPEN |
| Repair | IN_PROGRESS, or WAITING_PARTS when paused for parts |
| Quality check | QC |
| Billing | QC until the advisor marks the job ready, then READY |
| Delivery | BILLED, or READY on approved credit |
| Closed | DELIVERED |
| Cancelled | CANCELLED |

Migration `20261125195032_jobcard_stage_model` normalised the old status spellings (Open, Pending, In Progress, On Hold, Quality Check, Ready, Completed, Billed, Closed, Delivered, Cancelled, Canceled) to the values above and set each existing job's step from its status: OPEN to Estimate, IN_PROGRESS and WAITING_PARTS to Repair, QC to Quality check, READY to Billing, BILLED to Delivery, DELIVERED to Closed. Existing jobs have no step history, so their finished steps show "Not provided". The status alias code (`canonicalJobStatus`, `jobStatusFilter`, report SQL aliases) is kept for now (`TODO(confirm)`: remove in phase 12).

### One path for status changes

Only `server/src/modules/service/job-stage.writer.ts` writes the stage columns. Every path that changes the status or the QC result calls `syncStage` in the same transaction, under the same job row lock: the lifecycle update (`PUT /service/job-cards/:id`), billing and bill cancellation, QC recording, technician assignment, estimate revision, requisitions, labour and return slips, labour line edits, part issues and PDI. `doc/progress/jobcard-revamp.md` lists every call site. A billed job moves to Delivery; a cancelled bill returns it to Billing unless credit was approved and it had already been sent to Delivery.

### API

| Endpoint | Permission | Purpose |
|---|---|---|
| `GET /service/job-cards/:id/workspace` | `jobcard:read`, job branch | Step, owner and since when, current sub-step, the actions this user can take (each enabled or with plain-English reasons), up to 3 alerts, one line per finished step, read-only flag, cancellation details |
| `POST /service/job-cards/:id/stage` | `jobcard:update`, job branch | `{ action, note?, requestId }`. Runs one action under the job lock |

Actions: `SEND_TO_SUPERVISOR` (check-in to diagnosis, advisor; needs Details, Walk-around and Customer consent complete, see "Check-in (phase 2)"), `SEND_TO_ENGINEER` (technician or supervisor; a finding for every request, see "Diagnosis (phase 3)"), `RETURN_TO_TECHNICIAN` (service engineer; note required), `SEND_TO_WARRANTY` or `SEND_TO_ADVISOR` (the service engineer confirms the diagnosis; offered by routing, after the findings are sent), `WARRANTY_TO_ADVISOR` (warranty officer), `RELEASE_TO_REPAIR` (advisor or supervisor; needs the technician, the check-in signature, an approved estimate and a positive advance), `PAUSE_FOR_PARTS`, `RESUME_REPAIR`, `SEND_TO_QC` (workshop roles, the assigned technician only), `QC_PASSED_TO_ADVISOR` (supervisor; QC passed), `RETURN_TO_REPAIR` (supervisor; QC failed), `MARK_READY` (service advisor only; QC passed and campaign answers recorded), `SEND_TO_DELIVERY` (advisor; billed or credit approved), `CANCEL` (the roles that could cancel before, before billing, with a reason).

Actions that change the status run through `JobCardWorkflowService.updateInTx`, so the estimate approval and advance gates, QC checks, billing readiness, status history and status notifications all still apply. A blocked move returns 409 `STAGE_ACTION_BLOCKED` with `details.reasons`; the wrong role or another technician gets 403 `STAGE_ACTION_FORBIDDEN`; a missing job 404; invalid input 400 naming the field. Repeating a request ID returns the current workspace without acting again; reusing it for another action returns 409 `STAGE_REQUEST_REUSED`. PDI jobs keep their own screens and refuse stage actions.

### Notifications

Moves that change the status are announced by the existing status notification router. Step-only handoffs (check-in to diagnosis, diagnosis to warranty or estimate, warranty to estimate, QC passed to billing, billing to delivery) queue a `STAGE_HANDOFF` in-app notice ("Job sent to you ... Step: Warranty check") to the new owner through the durable workshop outbox. A notice is dropped if the job has moved on before delivery.

### Client building blocks

`client/lib/format.ts` (`formatMoney`, `formatDate`, `formatDateTime`, `formatRelative`, `NOT_PROVIDED`) and `client/features/job-cards/lib/job-stage.logic.ts` (step labels, badges, phone label "Step N of 8: Label", action and owner wording) are the single mappings for new code. The job card list shows a **Step** column.


### The job card page (phase 1)

`/job-cards/[id]` renders `JobWorkspace` (`client/features/job-cards/components/workspace/`). The old long page, its duplicated status list, the Job specs, Opening details, Workshop record, Technician and Quality inspector cards and the separate repair workspace are gone. Every job, at any step, uses this frame:

- **Header**, sticky at the top: job number, plate, vehicle ("Kia Sportage 2023, white"), customer and mobile, the step badge, a Warranty or Non-warranty tag, the repeat tag, "With: name (role) since date", and the promised delivery with a countdown (amber under 4 hours, red "Overdue by ..." once passed). **Job file** and **Print** buttons on the right. Phones show the plate, model, badge and owner line only.
- **Stepper**: the 8 steps, completed (tick, who and when), current, upcoming and skipped ("Skipped"). Completed steps are buttons that open their read-only summary. Phones show "Step N of 8: Label" with a progress bar that opens the list. A cancelled job's stepper is greyed.
- **Alerts**: up to 3 from the server, each with an icon, a sentence and, where the person can act, a link (assign a technician, view parts, open campaigns).
- **Finished steps**: one line each ("Check-in completed by Chidi Eze, 25 Nov 2026, 09:40."). A line opens the step's recorded facts, read only. Anything a job never recorded, such as on jobs from before phase 0, reads "Not provided".
- **Waiting banner**: shown to anyone who can see the step but does not own it, for example "Waiting for Musa Abdullahi (Technician). You can view this step but only the technician can update it."
- **Current step**: the heading "Step N of 8: Label", the sub-step sentence, and the step's content. Steps not rebuilt yet show the existing sections that serve them (each marked `TODO(phase N)` in `StageContent.tsx`):

| Step | Content until its phase replaces it |
|---|---|
| Check-in | Replaced in phase 2: Details, Walk-around and Customer consent (see "Check-in (phase 2)") |
| Estimate | Customer consent (only when missing or out of date), estimate, advance |
| Diagnosis | Replaced in phase 3: allocation, technician findings and engineer review (see "Diagnosis (phase 3)") |
| Warranty | Warranty at creation, who pays for each line |
| Repair | Request part, Service transactions, issued parts and collection, recorded labour, technician |
| Quality check | Record QC pass or failure, inspections, findings |
| Billing | Bill (create job bill, bills table), delivery on credit |
| Delivery | Deliver the vehicle (delivery advisor, late reasons), bill, delivery on credit |
| Closed | Delivered panel with gate pass print, bills |

- **Action bar**, sticky at the bottom: one primary handoff from the server's actions, with the blocking reason written beside it when disabled; other enabled actions as outline buttons; a **More** menu with **Cancel job**. Save draft appears only for steps with drafts (none yet). Each click sends a new request ID and blocks double clicks. Success shows a toast naming the job and the new owner ("Job 2026000127 sent to Tunde Bakare").
- **Cancel job** asks for a reason in a dialog that names the job and plate. It closes only on Keep job, the close button or success; Esc and outside clicks do not close it. The cancelled job shows a red Cancelled badge and a panel "Cancelled by name, date. Reason: ..." with View activity.
- **Job file** drawer (480 px, full screen on phones, focus kept inside, Esc closes), tabs: Customer and vehicle (customer, vehicle, this visit's details including the opening estimate, tyres, battery, checklist and internal remarks), Visit history (last two earlier visits at any branch, and the repeat block), Warranty and campaigns (warranty at creation, linked campaigns, who pays), Documents and prints (opening approval, estimate revisions, bills, gate pass, picking list, customer explanation), Activity (late delivery, step changes, status changes).
- **Page states**: a skeleton shaped like the frame while loading; "Could not load job N" with Try again; "Job card not found"; "You cannot open this job card" for another branch's job, saying who can open it.
- **Print menu**: estimate, signed job-opening approval, picking list and gate pass. The printed job card itself comes in phase 11. When printing, only the gate pass prints.

The old "Workshop actions" form was split into the step sections above. Its status dropdown no longer offers Start work, Send for QC, Wait for parts, Mark ready or Cancel, because the action bar does these through the stage service; that stops a job skipping steps. Delivery (status DELIVERED with late reasons) stays in the Deliver the vehicle section until phase 9.

API additions to `GET /service/job-cards/:id/workspace`: `warrantyJob` (vehicle covered when the job opened, or a warranty case exists; `TODO(confirm)` goodwill-only jobs), `activity` (step changes, newest first, with actor, new owner and note) and `previousVisits` (the vehicle's last two earlier service jobs at any branch, not cancelled and not PDI). A user without `jobcard:update` gets no actions and a read-only step, matching the check on `POST /stage`.

### Check-in (phase 2)

A new job starts at **Check-in**, owned by its service advisor. Check-in has three parts, shown as tabs with a tick when each is complete. The bar at the bottom moves between them and, at the end, sends the job to the workshop supervisor.

**Opening a job** now asks only for what is needed to create it: vehicle and mileage (with the audited odometer replacement), customer, service type, warranty and campaign acknowledgement, repeat check, customer requests (no amounts), promised date and time, and the advisor receiving the vehicle. Bay and technician are no longer needed; the workshop supervisor sets them in Diagnosis. The old opening estimate fields, service charge override, engineer, bay, A/C type, in-house flag, remarks, tyres, battery, custom field, "Find" and "Load estimate" are gone from the form. The server still accepts tyres, battery and A/C type for PDI jobs, which open through the same service.

| Part | What the advisor records | Complete when |
|---|---|---|
| Details | Bill to, mileage (not below the reading before this visit unless the odometer was replaced, with a reason), service type, promised delivery (Lagos time, in the future), customer requests with optional complaint codes, instructions to the technician | Mileage, service type, a future promised delivery and at least one request are saved |
| Walk-around | Fuel level (5 large buttons), damage marks on a top-down car drawing (Crack, Dent or Scratch, optional note and photo; tap to place, or "Add a mark with the keyboard" and arrow keys), the 25 paper-card checklist items (tap cycles Present, Missing, Not working; P, M or N on the keyboard; "Mark the rest present"), checklist notes, service book seen and stamps (0 to 12), no valuables and items left, 5 photos (Front, Rear, Left, Right, Odometer) | Fuel level recorded and all 25 items checked |
| Customer consent | Customer-facing: vehicle, mileage, fuel, damage in plain words ("Scratch on rear bumper, dent on front right door"), missing and not-working items, requests, promised date, the JOB_CARD terms as numbered clauses in a scroll box, an acceptance tick, Owner or Representative (name, phone and relationship), and the signature pad. No prices, codes or staff notes. | The customer has signed the current details |

The walk-around saves itself about a second after each change and shows "Saved 10:42". If a save fails, the changes stay on screen with "Not saved" and **Retry**; nothing is lost. If another screen saved a newer version, the save is refused and **Load the latest** replaces this screen's changes with the newer ones.

**Gates.** `SEND_TO_SUPERVISOR` lists every missing item as a reason, naming the part that fixes it, for example "Record the fuel level on Walk-around." or "Get the customer's signature on Customer consent.". The workspace sub-step is DETAILS, WALK_AROUND, CUSTOMER_CONSENT or SEND_TO_WORKSHOP. Handing off moves the job to Diagnosis, owned by the workshop supervisor role (WorkshopManager, `TODO(confirm)`), records who completed check-in and when, and sends the `STAGE_HANDOFF` notice. After that, check-in is read-only.

**Who can change it.** Only the check-in roles (service advisor, service manager, admin) with `jobcard:update`, while the job is at Check-in. Everyone else sees it read-only with the waiting banner. Collecting the signature also needs `estimate:sign`, and viewing or printing the signed copy needs `estimate:print`.

**Signed document, version 2.** The customer signs the existing job-opening signature (`JobOpeningSignature`), now version 2: its scope adds the walk-around (fuel, checklist states with labels, notes, service book, belongings, damage marks with rounded coordinates, and each photo's SHA-256), so the evidence hash covers it. A representative's phone is stored in `signerPhone` and joins the evidence hash only when present. Version 1 signatures are compared with the version 1 scope, so they still verify and stay current. Changing Details or the walk-around after signing makes the signature out of date ("Details changed after the customer signed. Ask the customer to sign again on Customer consent."). At check-in the server refuses a signature until Details and Walk-around are complete (409 `CHECK_IN_INCOMPLETE`). The signed copy (**View signed copy**, **Print**) shows the vehicle condition at check-in. A job past check-in whose consent is missing or out of date shows the same consent step under "Customer consent needed".

**Terms.** The clauses come from **Settings > Terms & Conditions**, document **Job card**. They are not built into the app. If none are set, the consent step says so and **Sign and accept** stays disabled. `TODO(confirm)`: the server still accepts a signature with no terms, as before.

**Photos.** There was no upload or file storage in the app. Photos are stored in the database (`JobPhoto`: bytes, content type, size, width, height, SHA-256), like signatures, so there is no new service or dependency. The browser resizes a photo to 1600 pixels on its longest side and sends a JPEG data URL. The server accepts JPEG, PNG or WebP, at most 2 MB and 4096 pixels a side, reads the size from the file header, and refuses anything else with a message on the field. Photo bytes are never in job or check-in responses; each photo is fetched from its own endpoint with the sign-in header, branch-checked, `Cache-Control: private` and `nosniff`. A check-in slot holds one photo and a new one replaces it. Later phases add categories (`JobPhotoCategory`) for findings and service book stamps.

| Endpoint | Permission | Purpose |
|---|---|---|
| `GET /service/job-cards/:id/check-in` | `jobcard:read`, job branch | Record, marks, photo list, 25 items, reading before this visit, gate reasons, consent state, editable flag |
| `PUT /service/job-cards/:id/check-in/details` | `jobcard:update`, check-in role, job at check-in | Save Details. Audited `JOB_CHECK_IN_DETAILS_SAVED` (fields changed; mileage from and to, odometer reason) |
| `PUT /service/job-cards/:id/check-in/walk-around` | same | Autosave with `expectedVersion`; 409 `CHECK_IN_VERSION` on a newer save. Audited `JOB_WALK_AROUND_SAVED` |
| `POST /service/job-cards/:id/check-in/damage-marks` | same | `requestId` (repeat returns the same mark), type, x and y 0 to 100, note, damage `photoId`. Audited |
| `DELETE /service/job-cards/:id/check-in/damage-marks/:markId` | same | Removes the mark and its photo. Audited |
| `POST /service/job-cards/:id/photos` | same | `requestId`, category, slot, image. Audited with size and hash, never the image |
| `GET /service/job-cards/:id/photos/:photoId` | `jobcard:read`, job branch | The image |
| `DELETE /service/job-cards/:id/photos/:photoId` | same as POST | Removes a photo. Audited |

Every write takes the job row lock first, like the workflow. A check-in write on a job past check-in returns 409 `CHECK_IN_LOCKED`; the wrong role 403 `CHECK_IN_LOCKED`.

**Data.** Migration `20261126054810_jobcard_check_in` adds `JobCheckIn` (one per job), `JobDamageMark` (x and y `Decimal(5,2)` with 0 to 100 checks), `JobPhoto` and the enums `FuelLevel`, `DamageType` and `JobPhotoCategory`; adds `JobOpeningSignature.signerPhone`; moves any free text in `JobCard.checklist` to `JobCheckIn.checklistNote` and drops `JobCard.checklist`. The internal picking list reads the checklist note instead. Customer requests are now created with ascending ids, so they keep the order they were entered in. The job card response includes the check-in record (without photos) and the damage marks, for the finished step summary and later phases.

### Diagnosis (phase 3)

After check-in the job is at **Diagnosis**. It has three parts, each owned by one person. The workspace sub-step is `ASSIGN_TECHNICIAN`, `FINDINGS` or `ENGINEER_REVIEW`, and only that part's owner works it; everyone else sees it read-only with the waiting banner.

| Part | Owner | What they do | Hands over with |
|---|---|---|---|
| Allocation | Workshop supervisor (WorkshopManager, `TODO(confirm)`; also General workshop manager, service manager, admins) | Choose an active technician of the job's branch (with their team tag, jobs in hand and Available or Busy), a bay (each marked free or "occupied by job N") and an optional note | **Assign and send to (name)** |
| Findings | The assigned technician (the supervisor may record them for a technician without a device) | One card per customer request: "What did you find?" (typed, or spoken where the browser has speech input), up to 6 photos, work needed (the vehicle model's labour operations; all operations when the model has none), parts needed with quantities, and **Possible warranty**. Plus findings the customer did not mention. No prices. Saves itself about a second after each change | **Send to service engineer** |
| Engineer review | Service engineer (Engineer role, or an admin, `TODO(confirm)` whether a workshop manager may stand in) | Findings table grouped by request, an edit button per finding, and the routing card | **Confirm and send to warranty officer** or **Confirm and send to service advisor**, or **Return to technician** with a note |

**Rules.**
- Allocation needs a bay. The supervisor can change the technician or bay until the findings are sent (409 `ALLOCATION_LOCKED` afterwards); anyone else gets 403. The job's team follows the technician's employee team, so the reports that group by team keep working. A repeated request ID assigns once.
- "Jobs in hand" counts the technician's jobs at Diagnosis, Warranty, Estimate, Repair or Quality check, from the same single grouped query that gives the open and closed totals. 3 or more is **Busy** (`TODO(confirm)`). There is no leave data, so On leave is not shown, and skills are a later addition (the team is shown instead).
- A bay is occupied when another job of the branch at those steps has it.
- **Send to service engineer** needs a written finding for every customer request, and words on (or removal of) every finding the customer did not mention. The disabled button names what is missing, for example "Write what you found for every customer request (1 of 2 still empty)."
- While the engineer reviews, the job is held by the Engineer role (header "With: Service engineer") and the technician cannot change the findings (409 `DIAGNOSIS_LOCKED`).
- **Return to technician** needs a note ("Write a note for the technician saying what to check again."). The technician gets an in-app notice "Job returned to you ... Note: ..." and an amber banner "Returned by (name), (date)." with the note until they send the findings again.
- **Routing** is the pure function `diagnosisRoute` (`server/src/modules/service/job-diagnosis.logic.ts`): Warranty when coverage was active at opening, an open campaign is linked, a warranty case exists, or any finding is flagged Possible warranty; otherwise Estimate. On Estimate the warranty step is recorded as skipped with the reason "Not under warranty" (the stage event's note) and the stepper and summary say "Warranty skipped. Not under warranty."
- Confirming records who confirmed and the route, writes `JOB_DIAGNOSIS_CONFIRMED`, and sets the job's engineer to the confirming Engineer (MIS reports read it).
- The job's status stays OPEN through diagnosis, as before; the existing technician transition table is unchanged.

**Autosave.** Each finding saves itself with its own version. The client chooses the finding's id, so a retried save never creates a second one. A failed save keeps everything on screen with "Not saved" and **Retry**; a save made against an older version shows "This finding was changed on another screen" with **Load the latest**. Pending changes are sent with a keep-alive request when the page is left. Before **Send to service engineer**, every finding on screen is saved first.

**Data.** Migration `20261126125423_jobcard_diagnosis`:
- adds `JobDiagnosis` (one per job: allocation note and who and when, submitted, returned with note, confirmed, route), `JobFinding` (job, request or none, cause and defect, possible warranty, version, author) and `JobFindingItem` (kind `LABOUR`, `PART` or `OIL`, the labour item or spare part, its description, `quantity Decimal(12,2)` above 0, order). Parts count as `OIL` when their tax category is oil (`categoryOf`), decided by the server;
- adds `JobPhoto.findingId` and the `FINDING` photo category (bytes in the database, as at check-in);
- moves each job's free-text `JobCard.observations` into a finding the customer did not mention, authored by the job's technician, engineer, advisor or creator, and drops the column; moves any `JobCard.assignedTo` text into the internal remarks ("Assigned to (old record): ...") and drops the column;
- grants `jobcard:update` to the Engineer role (also in `ROLE_PERMISSIONS`), because the engineer acts through `POST /stage`.

The old **Findings** box (free text) is gone. The quality check step shows a **Work done** box (work done, engineer and service charge). The repeat-job review shows the previous job's findings. The finished Diagnosis summary lists the technician, bay, findings, possible warranty count and who confirmed.

| Endpoint | Permission | Purpose |
|---|---|---|
| `GET /service/job-cards/:id/diagnosis` | `jobcard:read`, job branch | Sub-step, technician, bay, allocation note, advisor instructions, requests, findings (items without prices, photo ids), return note, submitted, confirmed, routing facts and route, gate reasons, branch engineers, `editable`, `canAllocate` |
| `GET /service/job-cards/:id/diagnosis/bays` | same | Active bays, free or occupied |
| `GET /service/job-cards/:id/diagnosis/labour-options?q=` | same | Up to 20 labour operations of the vehicle model (or all), no prices |
| `GET /service/job-cards/:id/diagnosis/part-options?q=` | same | Up to 20 active parts with PART or OIL, no prices or stock |
| `PUT /service/job-cards/:id/diagnosis/findings/:findingId` | `jobcard:update`, owner of the current part | Save one finding (`expectedVersion` 0 creates it). 409 `FINDING_VERSION` on an older version. Audited `JOB_FINDING_SAVED` |
| `DELETE /service/job-cards/:id/diagnosis/findings/:findingId` | same | Remove a finding the customer did not mention (409 `FINDING_REQUIRED` for a request's own). Audited |
| `POST`, `DELETE /service/job-cards/:id/diagnosis/findings/:findingId/photos[/:photoId]` | same | Finding photos, at most 6, idempotent by request ID. Audited without the image |
| `POST /workshop/assign/:id` | `assignment:create` | Now also takes `bayId` (required at Diagnosis), `note` and `requestId` |

Stage actions added: `SEND_TO_ENGINEER` (technician or supervisor; the findings gate) and `RETURN_TO_TECHNICIAN` (engineer; note required). `SEND_TO_WARRANTY` and `SEND_TO_ADVISOR` are now the engineer's confirmation, offered only after the findings are sent.

### Vehicles with multiple job cards (issue 142)

Open **Vehicles with multiple jobs** from Job cards. The default view groups vehicles with at least two visible, open and unbilled jobs. A closed date range adds delivered jobs based on their recorded delivery date in Africa/Lagos. The range can span up to 366 days. Cancelled jobs and historical jobs without a delivery date do not enter the closed results.

The view requires job-card read and `jobcard:multi-vehicle:read`. The latter is granted to Service Manager, Billing Officer and Workshop Manager through the role seed. Branch permissions apply before counting and loading jobs. The API pages by vehicle ID and returns each job-card ID so the existing detail and consolidation flows can be used.

Payer comes from the job's recorded charge lines and service billing rule. A job may have several payers. If neither source records a payer, the view shows Not recorded. The current job model has no insurance payer field.

### Gate-pass verification (issue 142)

On a migrated disposable PostgreSQL database, fully paid and approved-credit jobs moved to Delivered and received consecutive gate-pass numbers. An unpaid job without credit approval stayed Billed and had no gate pass. Chrome printed the existing gate-pass markup and print rules from a synthetic fixture to one PDF page. Visual review confirmed the gate-pass number, job card, customer, vehicle, registration and Africa/Lagos delivery date, with the surrounding fixture content hidden. Printing from the authenticated screen and physical printer output remain pending. The wider workshop integration test stopped before delivery because the estimate approval fixture omitted the expected version and content hash.

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
it does not change ownership. The repeat check compares the visit with the vehicle's last billed job against the
branch window and flags repeats automatically; a repeat needs a previous job, the reason is recorded at review
(see `workshop.md`, *Repeat jobs*). Saving opens the new card's detail page.

Delivery requires a bill or admin credit approval, a delivery advisor and, after
the promised time, one to six late-delivery reasons. Delivery generates a gate
pass with a separate print action. Jobs delivered on approved credit remain
billable; subsequent billing preserves their delivered status and gate pass.
The service catalog and service-type behavior remain unchanged.

## Late deliveries: promise date / time details entry

Legacy Service → *Promised date details entry* and *Promised time details entry*. The job card keeps one promised
date-time (`promisedAt`) and one delivery date-time (`deliveredAt`); days are Lagos calendar days.

- **Late by date**: delivered on a later day than promised (days late = calendar days between).
- **Late by time**: delivered on the promised day, after the promised time (minutes late, rounded up).
- A job is one or the other, never both; on or before the promise it is on time. Only delivered, not cancelled
  jobs count. Rules: `server/src/modules/late-delivery/late-delivery.logic.ts` (SQL twin in `late-delivery.sql.ts`).

Delivery after the promise still requires one to six distinct `LATE_REASON` ids, and now also takes an optional
delay remark (`lateRemarks`, internal, not the customer-facing `remarks`). The six legacy reasons are seeded as
codes 1–6: Engineer absent, Spare unavailable, On diagnosis, Customer's decision awaited, Wrong estimation, Open
time. The older "Awaiting parts" / "Awaiting customer approval" are made inactive (TODO(confirm)); jobs that used
them keep them. Masters are never deleted, only made inactive.

**Entry screens** (Workshop → Late Deliveries → Promise Date Entry / Promise Time Entry, `/late-deliveries/date`
and `/late-deliveries/time`, permission `jobcard:late-reason:update`): a worklist of jobs late of that kind
(promised-date range, filter by job no / registration, *No reason* / *Recorded* tabs with counts) beside the
selected job: promised → delivered → late by, service type, advisors, gate pass, six numbered reason tiles (keys
1–6 toggle them, as the legacy screen took reason numbers), remarks, Save / Save & next, and the change history.
*Find* takes a job number or a registration (the vehicle's latest job late of that kind). A job that is not late,
not delivered, or late of the other kind is refused with a message (code `NOT_LATE`) and a link to the right
screen. `?job=<id>` and `?find=<text>` deep-link. The job card page shows a *Delivered late* panel with the
reasons and a link to the right screen.

Saving needs 1–6 distinct reasons (a retired reason may stay only where the job already has it) and a remark of
at most 1000 characters. Both screens edit the same reasons and remark on the job (TODO(confirm)). Each change
writes an audit entry `LATE_DELIVERY_REASONS_UPDATED` with the previous and new reasons and remark. Users see only
their branch (403 otherwise) unless they have `branch:all`.

API (`/api/late-deliveries`, Swagger tag *Late Deliveries*): `GET /reasons`, `GET /` (worklist), `GET /find`,
`GET /{jobCardId}?kind=`, `PUT /{jobCardId}`. Migration `20261122100000_late_deliveries` (additive, idempotent).
Reports: `doc/reports.md`, *Service · Late deliveries*. Manual steps: `doc/late-deliveries-testing-guide.md`.

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
