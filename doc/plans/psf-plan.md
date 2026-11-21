# Post-service follow-up (PSF): plan and progress

Issue #111. Branch `feature/psf` from `origin/main` (64a5e01, includes CSC #180 and late deliveries #184).
Legacy: Service → Follow-up (status entry, post-service follow-up list, analysis, model-wise analysis,
dissatisfied list, closed list, vehicle history, follow-up letter, mailing list).

## What already exists and is reused

| Area | Existing | Use |
|---|---|---|
| Delivery date | `JobCard.deliveredAt` | the delivery date of every PSF screen (Africa/Lagos days) |
| Labour flags | `LabourItem.followUpAnalysis`, `majorLabour` (unused so far) | which lines are followed up; "major labour" basis |
| Job lines | `JobCardLabour` (always has a labour item), job service type | follow-up lines: the service line + labour lines |
| Contacts | `Customer` phones, address, city, preferred follow-up day / time / method | entry header, letters, mailing list |
| Booking | `createBooking(data, tx)` + `assertWithinBookingHorizon` (as CSC) | optional booking from a call |
| Reports framework | `defineReport`, sections, print, Excel, letter template in report settings (FPC) | 7 reports; second letter template |
| Accidental | MIS category `ACCIDENTAL` on the service type (`st.category`), code `AC` | "include accidental vehicles" |
| Branch scope | `canAccessAllBranches`, report scope | reused |

## Data model (migration `20261123100000_psf`, additive, idempotent)

- `enum PsfStatus { SATISFIED, DISSATISFIED, NO_PHONE, NOT_AVAILABLE, CLOSED }` = legacy codes 1–5 (fixed, not a master).
- `PsfFollowUp`: one per job (`jobCardId` unique): branch, customer, vehicle, **current** status / remark /
  last call (`lastCallId`, `lastCalledAt`, `lastCalledById`), `callCount`, `closedAt`, `closedById`.
  Created by the first call; never pre-created for every delivered job.
- `PsfCall`: every attempt (status, remark, called at / by, optional booking: `bookingAt`, `bookingServiceTypeId`, `appointmentId`).
- `PsfCallLine`: per call, one line per followed-up item: `kind` SERVICE | LABOUR, `jobCardLabourId`,
  snapshot `code` + `description`, `status`. The job's current line statuses = the lines of its last call.
- 8 permissions + grants (same as `ROLE_PERMISSIONS`).

## Rules (pure, unit tested: `server/src/modules/psf/psf.logic.ts`)

- A job can be followed up when delivered (`deliveredAt`), not cancelled, not a PDI job, in the user's branch (403 otherwise unless `branch:all`).
- Lines: the job's service type (kind SERVICE) + every labour line whose item has `followUpAnalysis`.
- Contacted = status 1 or 2. Line statuses: when the call status is 3, 4 or 5 every line takes the call status;
  when 1 or 2 each line is 1 or 2, and a "satisfied" call cannot have a dissatisfied line (so the dissatisfied list misses nobody).
- "Submit" (apply to all lines) sets every line to the chosen status. Remark ≤ 500 chars; prefilled "Customer satisfied".
- Every call is a new `PsfCall` (history kept); a closed follow-up (5) cannot get another call.
- "Not contacted" = no follow-up, or current status 3 / 4. Satisfaction % = satisfied ÷ (satisfied + dissatisfied).
- Reports filter on the delivery date (Lagos days) and use each job's **current** status (last call) unless stated.

## Screens

1. Follow-up status entry (`/psf`): worklist by delivery date with tabs To call / Dissatisfied / Followed up / Closed / All,
   find by job no. or registration, job header with every phone (tap to call), status tiles (keys 1–5), apply-to-all,
   line grid, quick remarks, optional booking, update-customer-profile, call history, save & next.
2. Post-service follow-up list `psf-followup-list` (psf:read). 3. Analysis `psf-analysis`. 4. Model-wise `psf-analysis-model`.
5. Dissatisfied `psf-dissatisfied`. 6. Closed `psf-closed`. 7. Vehicle history `psf-history`. 8. Letter `psf-letter` (psf:letter).
9. Mailing list `psf-mailing-list` (psf:letter).

## Decisions taken with a safe default (`TODO(confirm)`)

1. Build the module although PSF was not used since 2018/2020 (open question 1); nothing is imported from the legacy tables.
2. Grants (open question 2): ServiceManager, CCUManager, Admin: everything. CCUOfficer: read, update, letter, dissatisfied
   and history reports. WorkshopManager: read + reports. Auditor: read + reports (automatic).
3. Overall status = the caller's choice; lines follow the rules above; every attempt is kept (open question 3).
4. A booking date on a call creates an appointment (source PSF) or links the vehicle's active booking (open question 4).
5. Mailing list (open question 5): the customer record has one address, so "registration address" lists the same address and
   the screen says so; customers with no usable address are counted and left out.
6. Follow-up list basis: 100% = every delivered job; Major labour = jobs with a major labour line; "only labour marked for
   follow-up analysis" further limits the lines (and the jobs) to flagged labour.
7. Accidental = service type category ACCIDENTAL or code AC, excluded from the list unless ticked.
8. PDI jobs are never followed up.
9. "Customer has no phone" letter group = current status 3, or no follow-up and no phone on the customer record.

## Status

- [x] Backend: migration (idempotent, no drift), schema, logic + tests, entry API (worklist, find, detail, record call,
      service types), audit `PSF_CALL_RECORDED`, permissions + grants, Swagger
- [x] Reports 2–9 (`psf-*`), PSF letter template in report settings, `customerCity` lookup; MIS A6 reads PSF
- [x] Frontend: entry workbench (worklist tabs + counts, find, customer card with tap-to-call and profile dialog,
      status tiles 1–5, line grid, quick remarks, booking, history, save & next), 8 report configs, letters,
      A4 labels, template editor, nav + route guard
- [x] Demo seed `--psf-only` (DM-PSF-1…11, fixed February 2026 dates; idempotent)
- [x] Docs: `doc/psf.md`, `doc/reports.md`, `doc/demo-data.md`, `doc/psf-testing-guide.md`, MIS notes
- [x] Checks: server tsc clean; server unit 1423 pass (only the pre-existing `customer-merge.test.ts` fails);
      integration on local `dana_test_psf`: PSF 8/8, late, CSC, repeat, MIS, reports, PDI pass (FPC integration fails
      in vehicle creation, "Registration number is required": code this branch does not touch); client tsc + lint clean; client `node --test` 5/5;
      seed figures verified against every report on `dana_demo_psf`
- [ ] Browser click-through (follow `doc/psf-testing-guide.md`)
