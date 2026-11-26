# Job card revamp: progress

Plan: `doc/plans/jobcard-revamp-implementation.md`. Design spec: `doc/plans/jobcard-ux-revamp-prompts.md`.

## Phase 0: Foundations

Branch `feature/jobcard-revamp-p0-foundations`.

### Status

- [x] Migration `20261125195032_jobcard_stage_model` (stage, owner, entered-at, JobStageEvent, status normalisation). Verified on a local database with every legacy spelling.
- [x] Pure stage logic `server/src/modules/service/job-stage.logic.ts` with unit tests.
- [x] Stage writer `job-stage.writer.ts` wired into every status path (list below).
- [x] Stage service and API: `GET /service/job-cards/:id/workspace`, `POST /service/job-cards/:id/stage`.
- [x] Integration tests against a local database (`job-stage.integration.test.ts`, 8 tests) and route tests.
- [x] Client building blocks: `client/lib/format.ts`, `features/job-cards/lib/job-stage.logic.ts`, types, `useJobWorkspace` and `useJobStageAction` (used from phase 1), and a **Step** column on the job list.
- [x] Demo seed: JC-S01 to JC-S10, one job at every step. The seed was already failing on the check-in signature, advance and request-parts gates; fixed in this phase.
- [x] Docs (`doc/job-cards.md`, `doc/demo-data.md`) and `doc/testing/jobcard-revamp/phase-0-manual-test.md`.
- [ ] Apply the migration and run the demo seed on the server database: not done, PostgreSQL on the server host refused connections on 25 Nov 2026.
- [ ] Visual check in a browser: not done in this session.

### Test results (25 Nov 2026)

- Stage logic, routes and integration: 93 passed.
- Touched server modules (service, workshop, finance, requisition, pdi, notification, inventory): 922 passed, 67 failed, 8 skipped. The 67 failures are identical on the base commit (old fixtures miss the vehicle model check, the check-in signature, or reach the remote database).
- Client: 10 new logic tests pass; typecheck, lint (0 errors) and build pass. `test/issue117-components.test.mjs` fails on a missing `BillHeads` module, unrelated.

### Every place that changes JobCard.status, and how it keeps the stage in step

| Call site | What it does | Stage handling |
|---|---|---|
| `JobCardWorkflowService.open` | New job, status OPEN | Creates the job at CHECK_IN with the advisor as owner and an `OPENED` stage event |
| `JobCardWorkflowService.update` / `updateInTx` (PUT `/service/job-cards/:id`, workshop progress, demo seed) | Every lifecycle move, including cancel and deliver | `syncStage` after the status write, same transaction |
| `JobStageService.act` (POST `/service/job-cards/:id/stage`) | Stage actions | Status-changing actions call `updateInTx`; stage-only moves call `moveStage` |
| `ServiceService.addEstimate` (estimate revision) | READY back to QC, fresh QC | `syncStage` |
| `applyJobWorkChange` (requisition create and issue, labour slip create and edit, return slip create and cancel) | READY back to IN_PROGRESS, fresh QC | `syncStage` inside the helper |
| `LabourService` add, edit, remove line | Fresh QC | `resetQualityCheck` (QC reset plus `syncStage`) |
| `InventoryService.createPartIssuance` | Fresh QC | `resetQualityCheck` |
| `WorkshopService.updateQC` | QC passed or failed | `syncStage` |
| `WorkshopService.assignTechnician` | Technician or inspector changes | `syncStage` (owner follows the assignment) |
| `JobBillingService.createJobBill` | READY to BILLED (or keeps DELIVERED) | `syncStage` per billed job |
| `JobBillingService.cancelJobBill` | BILLED back to READY | `syncStage` per job |
| `PdiService` work done, vehicle ready, cancel | QC, READY, CANCELLED | `syncStage` (PDI keeps its own screens) |
| `PdiBillService` | READY to BILLED | `syncStage` |
| Removed: `WorkshopRepository.assignTechnician/updateProgress/updateQC`, `ServiceRepository.createJobCard/updateJobCard` | Unused methods that could write status directly | Deleted |

Demo seed modules that create job cards directly (`repeat`, `csc`, `mis`, `psf`, `late`) set the stage from the status with `stageForLegacyStatus`.

### Decisions

- The status alias handling (`canonicalJobStatus`, `jobStatusFilter`, report SQL aliases) is kept. The migration normalises the data, but reports, late deliveries, PSF, MIS and PDI all read through the aliases. `TODO(confirm)`: remove the aliases in Phase 12 once every reader is covered by tests.
- Moves that change the status are announced by the existing status notification router. Stage-only handoffs (check-in to diagnosis, diagnosis to warranty or estimate, warranty to estimate, QC passed to billing, billing to delivery) send a `STAGE_HANDOFF` in-app notice through the durable workshop outbox.
- A billed job is at Delivery. A cancelled bill returns it to Billing, unless credit was approved and it was already sent to Delivery.

## Phase 1: Job card frame

Branch `feature/jobcard-revamp-p1-shell`, from the phase 0 branch.

### Status

- [x] Server: the workspace response adds `warrantyJob`, `activity` (step changes) and `previousVisits` (last two visits). It now honours `jobcard:update`: without it there are no actions and the step is read-only (the service manager was offered Cancel job, which `POST /stage` refused with 403).
- [x] Client logic `features/job-cards/lib/job-frame.logic.ts` (countdown tone, stepper view, step details with "Not provided", alert links, waiting sentence, load problem, activity wording, toasts, invoice badge) and schemas for cancel, findings, delivery, credit approval and QC notes.
- [x] Components in `features/job-cards/components/workspace/`: JobWorkspace, JobHeader, JobStepper, StageSummaryList, AlertStrip, StageActionBar, CancelJobDialog, WaitingBanner, JobFileDrawer and tabs, StageContent, WorkshopSections, InvoicesTable, JobPageStates, JobGatePassPrint, StageCard. Shared `useFocusTrap` extracted from ModalFame.
- [x] Route file is 8 lines; loading file uses the frame skeleton.
- [x] Old code deleted: the 1,055-line page body, RepairWorkspacePage, JobCardEditForm (split into step sections), WorkspaceHeader, JobProgressStepper, getStepperState, the "workspace" skeleton variant and 14 unused copy keys.
- [x] Fixed in passing, in files the frame shows: em and en dashes, middle dots, "?" and "—" fallbacks, hard-coded slate classes and local date, money and km formatting (JobCardWarrantyCards, JobCardLinesCard, JobAdvanceSection, JobCardRepeatPanel, JobCardLatePanel, late-ui, repeat-ui, ServiceTransactions, RemarksPanel, RequisitionStockPreview).
- [x] Docs: `doc/job-cards.md` ("The job card page (phase 1)") and `doc/testing/jobcard-revamp/phase-1-manual-test.md`.
- [ ] Server database: no new migration in this phase. The phase 0 migration and demo seed are still not applied there: PostgreSQL on the server host refused connections again on 25 Nov 2026.
- [ ] Browser screenshots: not taken. Launching a browser was refused by the session's permission rules. See "Verification" below.

### Tests (25 Nov 2026)

- Server: stage logic, routes and integration 96 passed. Service module 372 passed, 58 failed; all 58 are in the five old integration suites that fail on the base commit (vehicle fixtures without a model). Typecheck clean.
- Client: 110 of 111 passed. The one failure is `issue117-components` (missing `BillHeads` module), failing before phase 0. New `test/job-frame.test.mjs`: 13 tests, including a component test that the blocked handoff's reason renders beside the button. Typecheck clean, lint 0 errors (74 old warnings), production build passes.

### Verification

- Live API on a local copy of the demo data: every demo job returns the right step, owner, actions and reasons for advisor, technician, workshop manager and service manager; another branch's job returns 403 and a missing job 404. Assign technician, send to service advisor and cancel with a reason were run end to end.
- The full frame and all five Job file tabs were rendered with that live data for 11 demo jobs and 3 roles (33 renders) and scanned: no "undefined", "null", "NaN", raw codes, dashes, middle dots, ellipses or replacement characters.
- The dev server compiles and serves the page.
- Not verified on screen: layout at 1440, 1024, 768 and 390 px, the sticky header and bar while scrolling, focus rings, the drawer animation and focus trap in a real browser, and printing the gate pass.

## Phase 2: Check-in

Branch `feature/jobcard-revamp-p2-checkin`, from the phase 1 branch.

### Plan

1. Data: migration `20261126054810_jobcard_check_in` adds `JobCheckIn`, `JobDamageMark`, `JobPhoto` (bytes in the database) and `JobOpeningSignature.signerPhone`; moves the free-text `JobCard.checklist` into `JobCheckIn.checklistNote` and drops the column. Bay is optional at opening.
2. Server: pure rules in `job-check-in.logic.ts` (25 items, schemas, gates, photo checks, signed snapshot); `job-check-in.service.ts` and routes under `/service/job-cards/:id/check-in` and `/photos`, branch-scoped, check-in role and stage checked, audited, idempotent by request ID.
3. Signature: version 2 signed document with the walk-around in its scope; version 1 signatures are compared with version 1 scope, so they stay verifiable and current.
4. Client: `lib/check-in.logic.ts`, hooks, `components/check-in/` (Details, Walk-around, Customer consent), its own action bar; opening form slimmed; `JobOpeningConsentCard` deleted.
5. Demo seed: real walk-around and signature for jobs past check-in; JC-S11 (walk-around done, unsigned), JC-S12 (signed), and a booking to open.

### Status

- [x] Migration `20261126054810_jobcard_check_in`: applied to local databases and, on 26 Nov 2026, to the server database together with the phase 0 migration. The server had no old checklist text to move; the move was checked on a local copy with planted rows.
- [x] Server: `job-check-in.logic.ts`, `job-check-in.service.ts`, `job-check-in.routes.ts`; signature version 2 with `signerPhone`; the check-in gates drive `SEND_TO_SUPERVISOR` and the sub-step; bay optional at opening; picking list reads the checklist note; request rows keep their entry order.
- [x] Client: `components/check-in/` (CheckInStep, DetailsStep, WalkAroundStep, CarDiagram, PhotoSlots, ConsentStep, ConsentCatchUp), `lib/check-in.logic.ts`, `hooks/use-job-check-in.ts`, `schemas/check-in.schema.ts`; the action bar takes Back, Next and a status; the signed copy shows the walk-around; the opening form is one slim page.
- [x] Deleted: `JobOpeningConsentCard`, `OtherDetailsTab`, the opening form's tabs, Find, Load estimate, bay, engineer, opening estimate, service charge, A/C type, in-house, remarks, tyres, battery, custom field and the placeholder delivery card; `openingLabels`; `JobCard.checklist`; the unused `CHECK_IN_SIGNATURE` reason.
- [x] Demo seed: walk-around and signature for jobs past check-in, JC-S11, JC-S12, a booking for KJA-523ST, earlier readings for the check-in vehicles, and the audited odometer reset when testers raised a demo vehicle's reading. Run twice from scratch on local databases.
- [x] Docs: `doc/job-cards.md` ("Check-in (phase 2)"), `doc/workshop.md`, `doc/demo-data.md`, `doc/testing/jobcard-revamp/phase-2-manual-test.md`.
- [ ] Browser screenshots: not taken. See "Verification".

### Tests (26 Nov 2026)

- Server typecheck clean. Touched modules (service, pdi, requisition, workshop, document-terms): 603 passed, 49 failed, 652 total. All 49 failures are in 7 old integration suites, from fixtures that miss the vehicle model, have negative line amounts, a spare part without a source, or no check-in signature, plus one Jest dynamic-import limit. New: check-in logic, routes and integration, signature version 1 and 2 compatibility, updated stage and opening tests.
- Client: 119 of 120 passed (`issue117-components` fails on the base commit too). Typecheck clean, lint clean on touched files, production build passes.

### Verification

- Live API on a fresh local demo database: the full check-in flow through every endpoint, including each validation message, the technician refused (403), the stale-save conflict, photo type refusal, a representative without a phone refused, an idempotent signature retry, the handoff to Diagnosis, the workshop manager's notice, and check-in locked afterwards.
- The real check-in components rendered with that live data for 4 jobs and 2 roles (28 renders) and scanned: no "undefined", "null", "NaN", raw codes, dashes, middle dots, ellipses or replacement characters.
- Not verified on screen: layout at 1440, 1024, 768 and 390 px, the drawing and markers under a real finger or mouse, the signature pad, photo capture on a tablet, the autosave timing, printing, and focus rings.

### Found and fixed in passing

- `booking.integration.test.ts` created its Prisma client from `server/.env` before reading `TEST_DATABASE_URL`, so its fixtures went to the shared database. Fixed. Today's two runs left 4 empty fixture branches ("Booking fixture/other 1795677540341" and "1795677633174") and 2 `@example.test` users there; not deleted, waiting for the owner's go-ahead. Several other integration suites set the database after their imports; they did not write to the server in this session but should be checked.
- Middle dots in the warranty job notification, an em dash in the service type picker, and "..." in loading texts of the reused opening components.
