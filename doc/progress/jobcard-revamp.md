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
- [x] Server database: demo seed run on 26 Nov 2026 with `--second-branch="Abuja Branch"` (Dana Motors Demo has no advisor or technician there). All phase 2 data is in: JC-S01 2026000033 (KJA-482TX) to JC-S12 2026000044, and the KJA-523ST booking. The run then stopped at the PDI demo: no active Engineer at Main Branch on the server (not a phase 2 problem).
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

## Browser tests for phases 0 to 2 (26 Nov 2026)

Playwright (`@playwright/test` 1.65.0, Chromium) now drives the real screens: `client/e2e/`, see `client/e2e/README.md`. 36 tests: the job card list (phase 0); the frame at every step, finished steps, Job file, cancel dialog, page states, other roles and 4 widths (phase 1); and check-in following the phase 2 guide (booking to job, Details errors, walk-around with marks, checklist, photo and reload, consent errors, signing, signed copy, handoff and notification, read-only and blocked views, offline signature and autosave, phone layout, keyboard). All 36 pass from a fresh database.

Defects the browser tests found and fixed:
- Walk-around changes were lost when the page was reloaded within the 1.2-second autosave delay; a save also waited on the page refresh. Pending changes are now sent with a keep-alive request when the page is left, and saves never wait on refreshes.
- Signing showed no success message (the form unmounts before its callback). Offline, signing and check-in saves spun forever instead of failing with a message (paused mutations); they now fail at once and keep the input.
- "Add at least one customer request" never appeared (array error on `.root`), in Details and in the opening form.
- Badges read "Check-In" and "Non-Warranty" (CSS capitalisation); the list's Status column showed raw codes ("OPEN"). One sentence-case status mapping now.
- At 1024 px the job header took half the screen; the promised date moves under the owner line below 1280 px. On phones the header scrolls away, the bar's small buttons are icon-only and the main button has its own row, and only the current check-in part shows its name.
- Checklist chips broke words in the middle at tablet width; the damage card's keyboard button overflowed.
- Shared fixes: menu items now have `role="menuitem"`; pagination read "Showing 1–10"; the sidebar and dashboard showed raw role codes, an emoji and a middle dot; the warranty panel used a middle dot and a non-standard date.
- The booking consent window needs a scroll to the end of the terms; guide step A4 now says so.

## Phase 3: Diagnosis (26 Nov 2026)

Built on Jayking (no phase branch, at the owner's request).

### Plan

1. Data: `JobDiagnosis`, `JobFinding`, `JobFindingItem` (Decimal quantity), finding photos on `JobPhoto`; `observations` and `assignedTo` moved and dropped in a separate migration; Engineer gets `jobcard:update`.
2. Server: pure rules in `job-diagnosis.logic.ts` (routing, findings gate, who works each part, load and bays, schemas); `job-diagnosis.service.ts` and routes; stage actions `SEND_TO_ENGINEER` and `RETURN_TO_TECHNICIAN`; confirm actions routed and engineer-only; owner moves to Engineer once findings are sent; allocation through the existing assignment endpoint with bay, note and request ID.
3. Client: `lib/diagnosis.logic.ts`, `hooks/use-job-diagnosis.ts` (per-finding autosave), `components/diagnosis/` (AllocationStep, FindingsStep, FindingEditor, ItemPicker, DiagnosisParts, DiagnosisStep); Diagnosis owns its action bar.
4. Demo seed: real diagnosis for jobs passing through, JC-S13 to JC-S15, bays A2 to A4, brake and AC labour and parts.
5. Tests: logic, routes, integration, Playwright phase 3.

### Status

- [x] Migrations `20261126125423_jobcard_diagnosis` (additive) and `20261126125424_jobcard_drop_observations` (copies observations into findings, assignment text into remarks, drops both columns; safe to re-run). Both checked on local copies with planted text, in both orders.
- [x] Server, client, demo seed, docs (`doc/job-cards.md` "Diagnosis (phase 3)", `doc/demo-data.md`), manual test guide `doc/testing/jobcard-revamp/phase-3-manual-test.md`.
- [x] Server database: only the additive migration applied (owner's decision, 26 Nov 2026), because other branches deployed there today still read `JobCard.observations`. **Pending:** apply `20261126125424_jobcard_drop_observations` there once those branches stop reading `observations` and `assignedTo` (`npx prisma migrate deploy` from server/).
- [x] Demo seed run on the server: JC-S13 2026000046 (LSR-524ST), JC-S14 2026000047 (LSR-525ST), JC-S15 2026000048 (LSR-526ST). It then stopped at the PDI demo as in phase 2 (no active Engineer at Main Branch). The server has no Engineer accounts at all, so the engineer review is done as Admin there until one is created.

### Tests (26 Nov 2026)

- Server typecheck clean. Touched modules (service, workshop, notification, repeat-job, roles, middleware) on a local test database: 871 passed, 40 failed, 8 skipped (919). All 40 failures are in 5 old integration suites with the known causes (vehicles without a model in booking and labour-slip fixtures, a spare-part source rule, a vendor message, the Jest dynamic-import limit). New: diagnosis logic (27), routes (3), integration (3: assign, findings, return, findings, confirm, routing both ways, permissions), updated stage logic and integration.
- Client: 127 of 128 passed (`issue117-components` fails on a missing `BillHeads` module, as before phase 0). New `test/diagnosis.test.mjs` (8). Typecheck clean, lint 0 errors, production build passes.
- Browser (Playwright): phase 3 suite 15 of 15 (allocation with keyboard, findings on a phone with photo, work and part pickers, reload, read-only for another technician and the advisor, server refusal for another technician, engineer return with note and notification, confirm to warranty, confirm to advisor with the skipped warranty step, offline save and retry, 1024, 768 and 390 px). Full suite: 38 passed, 1 failed on a cold-compile timeout in phase 2 (D), 6 not run after it; phase 2 alone then passed 19 of 19.

### Found and fixed in passing

- The browser overflow check only measured the page, but the app scrolls inside its content area; it now checks the content area too, which caught two phone overflows (a long button label and the bar inside a grid).
- Sign-in in the browser test setup could click before the form was ready on a cold dev server; it now retries.
- Repeat review page: ellipsis, middle dots and "—" fallbacks replaced.

## Phase 4: Warranty check (26 Nov 2026)

Built on Jayking (no phase branch, at the owner's request).

### Plan

1. Data: who pays on `JobFindingItem`, the decision reason on the job, `WarrantySettings` (the service rule) with per-model overrides, `WorkshopMaster.isPeriodicMaintenance`, `ExternalServiceRecord` (soft delete), `SERVICE_BOOK` photos; WarrantyOfficer gets `jobcard:update`.
2. Server: pure `service-history.logic.ts` (gaps, year by quarter grid, verdict, sentence) and `job-warranty.logic.ts` (gates; decisions checked with `assertChargeChange`); `job-warranty.service.ts` and routes; `WARRANTY_TO_ADVISOR` gated and opening the warranty case through `WarrantyCaseService.openForJobCard`; `/warranty/service-rule`.
3. Client: `lib/warranty-check.logic.ts`, `hooks/use-job-warranty.ts`, `components/warranty/` (Coverage, Service history, outside record dialogs, Campaigns, Items to decide), read-only and skipped views, check-in alert, settings.
4. Demo seed: JC-S16 to JC-S18 with service histories; jobs passing the warranty check decide customer pay.
5. Tests: rule logic (most), gates, routes, integration to the warranty case, client logic, Playwright phase 4.

### Status

- [x] Migration `20261126184824_jobcard_warranty_check` (additive, with the periodic maintenance backfill, the settings row and the permission). Generated against a local database; the generated file also carried old schema drift (SparePart columns, constraint renames), which was removed by hand.
- [x] Server, client, demo seed, docs (`doc/job-cards.md` "Warranty check (phase 4)", `doc/demo-data.md`), manual test guide `doc/testing/jobcard-revamp/phase-4-manual-test.md`.
- [x] Server database: only this migration applied (from a copy of the migrations folder without `20261126125424_jobcard_drop_observations`, which stays held back). None of its objects existed there; the foreign migrations deployed by other teams today do not touch them. Demo seed run: JC-S16 2026000049 (KJA-527ST), JC-S17 2026000050 (KJA-528ST), JC-S18 2026000051 (KJA-529ST). It then stopped at the PDI demo as before (no Engineer at Main Branch).

### Tests (26 Nov 2026)

- Server typecheck clean (and the seed folder). New: service history logic 33, warranty decision logic 15, routes 5, integration 3 (evidence, gates through the stage service, outside record with replay and soft delete, handoff opening the warranty case, existing case kept, missing sale date), stage logic +1.
- Touched modules (service, warranty, workshop, job-card-line, campaign, shared) on a local test database: 930 passed, 44 failed, 974 total. All 44 are in 7 old integration suites with known fixture causes: vehicles without a model (booking, labour slip), the advance gate (warranty: 2 tests, also failing on the base commit; its approval and signature fixtures were brought up to date, the advance receipt was not, after 3 attempts), a registration number rule (FPC), the Jest dynamic-import limit and two old rule mismatches (service document, part source, workshop).
- Client: 135 of 136 (`issue117-components`, missing `BillHeads`, as before). New `test/warranty-check.test.mjs` (8). Typecheck clean, lint 0 errors (74 old warnings), production build passes.
- Browser (Playwright): phase 4 suite 11 of 11 (screen and evidence, outside record with errors and removal, decisions with the reason gate and handoff, advisor read-only and technician refused, campaign decision, missing sale date, offline Not saved and Retry, keyboard arrows, skipped step read-only, check-in alert, 1024, 768 and 390 px). Phases 3 and 4 together 18 of 18; phase 2 alone 20 of 20; full suite 50 passed with phase 2 (D) failing on the known cold-compile 404 of the signed copy page in long runs.

### Found and fixed in passing

- The job card list search never filtered: the search box asked to search before the typed text reached state. Fixed in `JobCardsTable`.
- Booking requests came back in random order (same creation time, random ids); they now get ascending ids like job card requests.
- Stepper captions overlapped their neighbours instead of truncating.
- A "—" fallback in Workshop masters; middle dot and ellipsis on the warranty settings page.
