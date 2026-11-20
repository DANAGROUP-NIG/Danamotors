# CSC: service due reminders and follow-up

Legacy **Service → CSC**. It reminds customers that their Kia is due for its next service, records the reminder
calls, books the vehicle in, and reports on the vehicles that never came back. It is a workshop-branch feature:
Abuja still uses it, and Lagos used it until 2022.

Plan, decisions and status: `doc/plans/csc-plan.md`. Manual test steps: `doc/csc-testing-guide.md`.

## Screens

| Screen | Route | Permission | Legacy screen |
|---|---|---|---|
| 1st follow-up | `/csc/follow-up/first` | `csc:case:read` (save: `csc:followup:update`) | CSC follow-up entry (1st followup) |
| 2nd follow-up | `/csc/follow-up/second` | same | Service due follow-up entry (2nd followup) |
| Not visited after due date | `/csc/not-visited` | same | Follow-up entry for vehicles not visited after due date |
| Generate cases | `/csc/generate` | `csc:case:generate` | CSC cases generation |
| CSC master | `/csc/schedule` | `csc:master:read` (save: `csc:master:update`) | CSC master |
| Closure reasons | `/csc/close-reasons` | same | Causes for CSC follow-up closure |

They sit under **Workshop → CSC Follow-up** in the side menu, with tabs between them. Branch-scoped users
see only their own branch's cases; `branch:all` users (CCU manager, service manager) see every branch. Opening
another branch's case by URL or API returns 403.

### Follow-up screens

These are the three legacy entry screens in one layout:

- **Filters:** Due / Done / Both (with counts), date range on the stage's date (1st call date, 2nd call date, or
  due date), model (or All), and a search on registration, VIN, customer name or phone. The 2nd follow-up has
  **Include 1st follow-up not done**. Not visited has **Days overdue ≥** and **Only followed up**.
- **List (left):** a card for each case: service code, registration, customer, model, phone, call/due date,
  how far off the due date is, and badges for calls made, booked, visited or closed.
- **Case (right):** due date and mileage, call dates and visit window; the customer with tap-to-call phone
  numbers and contact preferences; the previous visit; earlier calls from the other stages; then the form:
  - three call lines (date, person spoken to, remarks, done by)
  - **Book the vehicle in** (date and time, note): creates a service booking with source `CSC` and a customer
    request "<service> service due <date> (CSC follow-up)", or links the vehicle's open booking
  - **Close with a reason**: a *follow-up closure* (PARTIAL) closes this call only, and the case moves on to
    the next follow-up. A *final closure* (FINAL) closes the case and counts it as a no-show.
  - **Save** and **Save and next**.
  Visited and closed cases are read-only.

### Generate cases

Pick the due period (presets: next month, next 30 days, this month), models and services (each **All** by
default, which disables the dropdown, as on the legacy screen), and **Generate**, **Print** or **Both**. The
result shows the cases due, new, already generated and already visited, a count per service, and how many
vehicles were left out and why. **Call sheet** opens the `csc-call-sheet` report for the same selection (screen,
print, Excel).

### CSC master

There's a model list on the left. On the right, each model has its **schedule versions** (effective dates)
and an editable grid: one row per service with due days and km, 1st and 2nd call days, rotation days and km,
grace (variation) days and km, plus a small timeline of the cycle. Version-wide fields are **Not visited for
last** (months, default 48) and the visit window, **Job counts from** and **On time until** (10 and 10 days
before and after the due date). **New version** starts a version with a later effective date, and the
earlier ones are kept. **Apply to other models** saves the same version on several models at once.

## Rules

Pure functions in `server/src/modules/csc/csc.logic.ts` (unit tested).

- **Version:** a vehicle uses the latest version whose effective date is on or before its **sale date** (else
  the earliest). This replaces the legacy "before date / after date" pair. `TODO(confirm)`.
- **Start date:** sale date, else sale invoice date, else PDI date, else the first visit.
- **Next service due:** services are ordered by due days, and the last (RG) is the periodic one. After the
  highest scheduled service already done, each later free service is due on start + due days, at its due
  km. It lapses when due + grace days falls before the later of the last visit and the generation start; the
  next service is then tried. After the free services, RG is due on its last RG visit + rotation days (km:
  that reading + rotation km), else start + RG due days, rolled forward by rotation until it has not lapsed.
  `TODO(confirm)` (legacy open question 2).
- **Left out:** vehicles not seen (last visit, else start) for longer than the version's months, and
  vehicles with no start date.
- **Branch:** the branch of the vehicle's last visit, else its customer's branch.
- **Call dates:** 1st = due − 1st call days, 2nd = due − 2nd call days.
- **Visit:** a job card for the vehicle (not cancelled, not PDI) opened on or after due − *job counts from*
  days is the visit. Late visits count too. The case becomes **Visited** with the job linked, and is shown as
  early, on time (up to *on time until* days after due) or late. The match runs when a job card opens (in a
  savepoint, so it never blocks the job), at generation, and when a follow-up list loads. A list load also
  re-opens a case whose visit job was cancelled.
- **Not visited:** open, and today is past due + *on time until* days.
- **Idempotent:** one case per vehicle, service and due date. A re-run creates nothing new, and the window
  values are copied onto the case so later master edits don't move it.

## Data

Migration `20261121100000_csc` (additive, idempotent) adds `CscRule`, `CscCloseReason`, `CscCase`,
`CscContact` (stage + slot 1–3) and `CscStageClosure`. It also seeds the legacy rule values for every active
model (effective 2010-09-13), closure reasons R0001–R0008, and the permissions with their role grants.
`prisma/seed/csc.ts` does the same for fresh databases. Both only insert what is missing, so a re-run never
changes or deletes a rule, reason or case.

| Service | Due days / km | Rotation days / km | 1st / 2nd call | Grace days / km |
|---|---|---|---|---|
| 1F | 30 / 1,000 | 30 / 1,000 | 15 / 5 | 15 / 500 |
| 2F | 90 / 5,000 | 90 / 5,000 | 15 / 5 | 45 / 2,500 |
| 3F | 180 / 10,000 | 180 / 10,000 | 15 / 5 | 90 / 5,000 |
| RG | 270 / 15,000 | 90 / 5,000 | 15 / 5 | 45 / 2,500 |

Every write is audited: `CSC_RULES_SAVED`, `CSC_REASON_CREATED|UPDATED|DELETED`, `CSC_CASES_GENERATED`,
`CSC_FOLLOWUP_SAVED`, and `CSC_MATCH_FAILED` if matching fails at job opening.

## API

Mounted at `/api/csc` (Swagger tag **CSC**, examples in `csc.openapi.ts`):

| Method | Path | Permission |
|---|---|---|
| GET | `/rules/models`, `/rules?modelId=`, `/service-types` | `csc:master:read` |
| PUT | `/rules` | `csc:master:update` |
| GET | `/close-reasons` | `csc:master:read` or `csc:case:read` |
| POST / PUT / DELETE | `/close-reasons[/:id]` | `csc:master:update` (delete refused once used) |
| POST | `/cases/generate` | `csc:case:generate` |
| GET | `/cases`, `/cases/:id`, `/summary`, `/staff` | `csc:case:read` |
| PUT | `/cases/:id/follow-up` | `csc:followup:update` |

## Reports (framework, category "Service · CSC")

| Slug | Title | Permission | Filters |
|---|---|---|---|
| `csc-call-sheet` | CSC call sheet | `csc:case:read` | due from/to, model, service, open or all |
| `csc-followup` | CSC follow-up report | `report:csc-followup` | month, print previous month data, model |
| `csc-not-visited` | Vehicles not visited after due date | `report:csc-not-visited` | due from/to, model, days not visited, only followed up |
| `csc-no-show` | No-show analysis | `report:csc-no-show` | due from/to, model, service, reason; detail / summary / both; service-wise or model-wise |

Each one runs on screen, prints (132 columns) and exports to Excel through the report framework.

## Grants (`ROLE_PERMISSIONS`, `TODO(confirm)`)

| Role | Grants |
|---|---|
| SuperAdmin, Admin, ServiceManager | everything |
| CCUManager | everything except `csc:master:update` |
| CCUOfficer | `csc:master:read`, `csc:case:read`, `csc:followup:update`, `report:csc-followup` |
| Auditor | the read permissions and the three reports (automatic) |

## Open points (`TODO(confirm)` in the code)

1. Versions by sale date (legacy before/after date).
2. The due-date formula above, and due mileage shown but not used to pick vehicles.
3. One company-wide closure reason list (Lagos and Abuja codes differ).
4. Role grants above.
5. Service MIS still reads `ServiceTypeModelSetting.daysLimit` / `mileageLimit` (#151). Making the CSC master
   the single source for due limits needs agreement first.
