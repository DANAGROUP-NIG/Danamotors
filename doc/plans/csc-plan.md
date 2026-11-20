# CSC (service due reminders and follow-up): plan and progress

Branch `feature/csc` from `origin/main` (2e5a9a1, includes repeat jobs #176).
Legacy: Service → CSC (master, closure causes, case generation, 1st/2nd follow-up, not visited, 3 reports).

## What already exists and is reused

| Area | Existing | Use |
|---|---|---|
| Models, service types | `WorkshopMaster` MODEL (parent of a vehicle's VARIANT `catalogueId`), SERVICE_TYPE 1F/2F/3F/RG | Rule keys |
| Previous visit | `JobCard` (not cancelled, not PDI: `serviceHistoryWhere`) | Progression, visit matching |
| Customer contact | `Customer.phoneNumber/mobile2/address/contactPerson/preferredFollowup*` | Detail panel |
| Booking | `createBooking()` (service module): numbering, duplicate guard, audit | Book date on a follow-up |
| Reports | framework (`defineReport`, client `ReportConfig`): screen, print, Excel | 3 reports + call sheet |
| Job opening | `job-card-workflow.service.ts` savepoint pattern (repeat detection) | Auto-match a visit |

## Data model (migration `20261121100000_csc`, additive, idempotent)

- `CscRule`: modelId, serviceTypeId, effectiveDate, dueDays, dueKm, rotationDays, rotationKm, followUp1Days, followUp2Days,
  variationDays, variationKm, matchDaysBefore (10), matchDaysAfter (10), notVisitedMonths (48), active. Unique (model, service, effectiveDate).
- `CscCloseReason`: code (unique), description, shortDescription, closureType FINAL | PARTIAL, active.
- `CscCase`: vehicle, customer, branch, serviceType, ruleId, dueDate, dueMileage, followUp1Date, followUp2Date, status OPEN | VISITED | CLOSED,
  lastVisitJobCardId, visitJobCardId, visitedAt, bookingId, bookedAt, closeReasonId, closeRemarks, closedAt, closedById, generatedById.
  Unique (vehicle, serviceType, dueDate) → generation is idempotent.
- `CscContact`: caseId, stage FIRST | SECOND | NOT_VISITED, slot 1–3, contactDate, contactPerson, remarks, doneById. Unique (case, stage, slot).
- `CscStageClosure`: caseId, stage, reasonId, remarks, closedAt, closedById. Unique (case, stage). A PARTIAL reason closes the stage only.
- Seeds (migration for existing DBs + `prisma/seed/csc.ts` for fresh ones, both insert-if-missing): 4 rules per active model, 8 reasons.
- Permissions: `csc:master:read|update`, `csc:case:read|generate`, `csc:followup:update`, `report:csc-followup|csc-not-visited|csc-no-show`.

## Rules (pure, unit tested: `server/src/modules/csc/csc.logic.ts`)

- Schedule = the model's rules, ordered by due days. The last one (RG) is the periodic service.
- Version used for a vehicle = latest `effectiveDate` ≤ the vehicle's sale date (else the earliest).
- Start date = sale date, else sale invoice date, else PDI date, else first visit. No start date and no visit → skipped.
- Next due: after the highest scheduled service done, the next free service is due on start + dueDays (km = dueKm), unless it lapsed
  (due + variationDays before the later of the last visit and the generation start). Then the next one is tried. After the free services,
  RG falls due on its last RG visit + rotationDays (km: that visit's mileage + rotationKm), else start + RG due days, rolled forward by
  rotation until it has not lapsed.
- Case when the due date is in the chosen range. Vehicle dropped when its last visit (or start) is older than notVisitedMonths.
- Follow-up dates: 1st = due − followUp1Days, 2nd = due − followUp2Days.
- Visit: a non-cancelled, non-PDI job of the vehicle on or after due − matchDaysBefore (on or after the case's creation window) → VISITED
  with the job linked; "on time" when ≤ due + matchDaysAfter. Matched when a job opens (savepoint, never blocks the job) and re-checked
  on generation and list loads (also re-opens a case whose linked job was cancelled).
- Not visited: OPEN, today > due + matchDaysAfter.
- Follow-up save: up to 3 contacts per stage; booking creates a `ServiceAppointment` (source CSC) or links the vehicle's active booking;
  closing needs a reason: FINAL closes the case, PARTIAL closes the stage. Every save is audited.

## Decisions taken with a safe default (`TODO(confirm)`)

1. Legacy "before date / after date" → rule versions picked by the vehicle's **sale date** (not by run date).
2. Due-date formula above (open question 2). Due mileage is shown, not used to select vehicles (no usage estimate).
3. Contacts: three lines per stage on screen; the table allows exactly slots 1–3 per stage.
4. Closure reasons are one company-wide list (Lagos and Abuja codes differ); seeded neutral list R0001–R0008.
5. Booking time uses the branch booking horizon check like any booking.
6. Grants: ServiceManager and Admin everything; CCUManager all but master update; CCUOfficer read, follow-up, follow-up report,
   master read; Auditor read + reports (automatic).
7. Service MIS keeps reading `ServiceTypeModelSetting.daysLimit/mileageLimit` (shipped in #151); CSC rules are a separate master.
   Making CSC the single source is a follow-up once agreed.

## Status (2026-11-20)

- [x] Backend: migration (idempotent, re-run checked), schema, logic + tests, module (masters, generate, follow-up,
      matching), job-open hook, 4 framework reports + `cscReason` lookup, OpenAPI, base seed, `ROLE_PERMISSIONS`
- [x] Frontend: CSC master, closure reasons, generation, 1st / 2nd / not-visited workbench, 4 report configs,
      nav + route guards, client logic test
- [x] Demo seed `--csc-only` (CSC-1…CSC-14), docs `doc/csc.md`, `doc/csc-testing-guide.md`, `doc/reports.md`,
      `doc/demo-data.md`
- [x] Checks: server tsc clean; unit suite: only `customer-merge.test.ts` fails (pre-existing); integration on
      `dana_test_csc`: CSC 9/9, repeat, reports, PDI pass; booking and workshop suites fail identically with the
      baseline files; client tsc and eslint (changed files) clean; HTTP smoke on `dana_demo_csc` (permissions, 403
      across branches, generation, follow-up save, all four reports)
- [x] Fixed on the way: every framework report failed over HTTP (`SET TRANSACTION ISOLATION LEVEL` after the
      change-log `set_config`); the isolation level now goes in the transaction options
- [ ] Browser click-through (follow the testing guide)

Local DBs (docker `dana-pdi-pg`, port 55432): `dana_test_csc`, `dana_demo_csc` (cloned from the repeat DBs).
