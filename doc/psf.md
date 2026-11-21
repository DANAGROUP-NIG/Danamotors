# Post-service follow-up (PSF)

Legacy **Service → Follow-up** (#111). After a job is delivered, the workshop (usually the CCU) phones the customer,
asks whether they are satisfied with the work, and records the answer for the job and for each labour or service line.
Dissatisfied customers go to the service manager, who closes the follow-up once dealt with.

This is not CSC (`doc/csc.md`): CSC calls customers who are *about to need* a service; PSF is about the service they
*just had*.

## Screens

| Screen | Route | Permission |
|---|---|---|
| Follow-up status entry | `/psf` (`?job=<id>` opens a job) | `psf:read` to view, `psf:update` to record calls |
| Post-service follow-up list and the other reports | `/reports/psf-*` | see `doc/reports.md`, *Service · Follow-up (PSF)* |

Navigation: **Workshop → Post-service Follow-up** (entry, follow-up list, dissatisfied customers, letters, mailing
list); every report is also on the reports hub under *Service · Follow-up (PSF)*.

### Follow-up status entry

- **Worklist** of delivered jobs (delivery date range, default the last 30 days), tabs *To call* (never followed up,
  or no phone / not available last time), *Dissatisfied*, *Satisfied*, *Closed*, *All*, with counts. The strip above
  shows delivered, to call, satisfied, open dissatisfied and satisfaction % for the range.
- **Job no.**: open a job by job number or registration (the vehicle's latest delivered job). A job that is not
  delivered, cancelled or PDI cannot be opened (the reason is shown); another branch's job gives 403 unless the user
  has `branch:all`.
- **Header**: job, registration, model, current status, calls so far; delivery date (and days since), follow-up date
  (last call), service, mileage, service advisor, delivered by.
- **Customer card**: every phone as a tap-to-call link with copy, the preferred follow-up day / time / method,
  address, e-mail and **Update customer profile** (needs `customer:update`): the customer form opens in a dialog and a
  corrected number shows on the card as soon as it is saved.
- **Call**: the outcome as five tiles (keys **1–5**, the legacy legend); the **lines** (service type + labour marked
  for follow-up analysis) each *Satisfied* / *Dissatisfied* with *All satisfied* / *All dissatisfied* (the legacy
  *Status update + Submit*); a remark with one-tap phrases (prefilled *Customer satisfied*); an optional **booking**
  (date, time, service, notes). *Save call* or *Save & next*.
- **Call history**: every attempt, newest first, with status, caller, time, remark, dissatisfied lines and booking.

## Rules

Pure functions in `server/src/modules/psf/psf.logic.ts` (unit tested), mirrored on the client in
`client/features/psf/lib/psf.logic.ts`.

| Rule | Detail |
|---|---|
| Who is followed up | Delivered (`deliveredAt`), not cancelled, not PDI (PDI job, pre-delivery or PDI-category service type) jobs. |
| Statuses | Fixed enum `PsfStatus`, legacy codes 1 *Customer satisfied*, 2 *Customer dissatisfied*, 3 *No phone*, 4 *Customer not available*, 5 *Follow-up closed*. |
| Lines | The job's service type (kind SERVICE), then every labour line whose labour item has *Include for follow-up analysis* (kind LABOUR), in job order. Code and description are stored with each call (snapshot). |
| Reached (1, 2) | Every line is given once, satisfied or dissatisfied. A satisfied call cannot carry a dissatisfied line (the screen switches the call to 2 when a line is marked dissatisfied), so the dissatisfied list misses nobody. |
| Not reached / closed (3, 4, 5) | Every line takes the call status. |
| Remarks | Required for 2 (what is wrong) and 5 (why closed); ≤ 500 characters; a blank satisfied call is saved as *Customer satisfied*. |
| Attempts | Every call is a new `PsfCall`; the job's `PsfFollowUp` holds the current status (the last call). A closed follow-up cannot be called again (409 `PSF_CLOSED`). |
| Booking | Only when the customer was reached. Links the vehicle's active booking if there is one, otherwise creates a booking (source `PSF`) through the normal booking code; branch booking horizon applies; not in the past. |
| Not contacted | No follow-up, or current status 3 or 4. |
| Satisfaction % | Satisfied ÷ (satisfied + dissatisfied). |
| Accidental | Service type in the MIS *ACCIDENTAL* category, or code `AC`. Left out of the follow-up list unless ticked. |
| Audit | `PSF_CALL_RECORDED` with job, before / after status, line count and booking. |

## Data

Migration `20261123100000_psf` (additive, idempotent):

- `PsfFollowUp`: one per job (`jobCardId` unique): branch, customer, vehicle, current `status`, `remark`, `lastCallId`,
  `lastCalledAt`, `lastCalledById`, `callCount`, `closedAt`, `closedById`. Created by the first call (no empty rows
  for every delivered job, unlike the legacy).
- `PsfCall`: each attempt: status, remark, called at / by, `bookingAt`, `bookingServiceTypeId`, `appointmentId`.
- `PsfCallLine`: per call: kind, `jobCardLabourId`, code, description, status, position.
- Permissions `psf:read`, `psf:update`, `psf:letter`, `report:psf-analysis`, `report:psf-analysis-model`,
  `report:psf-dissatisfied`, `report:psf-closed`, `report:psf-history`, granted as in `ROLE_PERMISSIONS`.
- Report setting `psf.letterTemplate` (the follow-up letter; default in `server/src/modules/reports/settings.ts`).

Nothing is imported from the legacy `followuphead` / `followupdet` tables (last used 2018 in Lagos, 2020 in Abuja).

## API

Mounted at `/api/psf` (Swagger tag *Post-service Follow-up*):

| Method | Path | Permission | |
|---|---|---|---|
| GET | `/psf/jobs` | `psf:read` | Worklist: `dateFrom`, `dateTo` (delivery), `search`, `state` (`toCall`, `dissatisfied`, `satisfied`, `closed`, `all`), `page`, `limit`, `branchId`; returns `counts` per tab |
| GET | `/psf/find?q=` | `psf:read` | Job number or registration → `{ id }`; 400 `NOT_FOLLOWABLE` with the reason |
| GET | `/psf/jobs/:jobCardId` | `psf:read` | Job, customer (phones, preferences), lines with current status, follow-up, calls, `blockedReason`, `activeBooking` |
| POST | `/psf/jobs/:jobCardId/calls` | `psf:update` | `{ status, remark?, lines?: [{ key, status }], booking?: { scheduledAt, serviceTypeId?, notes? } }`; line key `SERVICE` or the job card labour id |
| GET | `/psf/service-types` | `psf:read` | Active service types for the booking |

Reports: `doc/reports.md`. The Service MIS management report's A6 lines (contacted, satisfied, dissatisfied, not
reachable, satisfaction %) read `PsfFollowUp`.

## Decisions to confirm (`TODO(confirm)`)

1. The module is built although PSF was not used since 2018 / 2020 (question 1).
2. Grants (question 2): see `doc/reports.md`.
3. Overall status = the caller's choice, lines follow the rules above, every attempt is kept (question 3).
4. A booking on a call creates or links an appointment (question 4).
5. Mailing list: one address per customer, so *Registration address* prints the same address (question 5).
6. Follow-up list: *100%* = every job; *Major labour* = jobs with a major labour line (only those lines); the
   follow-up-analysis tick limits labour and jobs to flagged items.
7. *Customer has no phone* letter group = status 3, or never followed up and no phone on the customer record.

Testing: `doc/psf-testing-guide.md`. Plan and progress: `doc/plans/psf-plan.md`.
