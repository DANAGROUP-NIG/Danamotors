# Workshop reports — remaining work, blockers and how to unblock them

Issue: **#75 Workshop daily reports** · PR: **#81** (`feature/workshop-reports`, draft) · Status as of 08/10/2026

This document lists what is still missing for #75 to be complete, what is blocking each item, who can
unblock it, and the exact work that follows once it is unblocked. It is meant for the team lead and
the business owners who have to answer the open questions.

Related documents:
- [reports.md](reports.md): user guide and API
- [reports-ui-testing-walkthrough.md](reports-ui-testing-walkthrough.md): how to test what is built
- [plans/workshop-reports-plan.md](plans/workshop-reports-plan.md): the plan, open questions (section 7)
  and the evidence from the legacy screens (section 8)

---

## 1. Summary

The issue asks for 16 numbered reports. It also attaches an unspecified 17th screen, the repair order
control chart. **14 of the 16 are built**, along with the shared framework, the schema changes and
the screens they need. Three reports are not built, and two cross-cutting filters are hidden until
the business defines them.

| # | Report | State | Blocked by |
|---|---|---|---|
| 1 | Service booking report | ✅ Done | — |
| 2 | Job estimate register | ✅ Done | — |
| 3 | List of job cards open | ✅ Done, no engineer column | Engineer (Q2) |
| 4 | Workshop status report (as on) | ✅ Done, no engineer column | Engineer (Q2) |
| 5 | Workshop progress report | ✅ Done, no engineer column | Engineer (Q2) |
| 6 | Service-wise workshop progress | ✅ Done | — |
| 7 | Vehicles to be ready | ✅ Done, no engineer column | Engineer (Q2) |
| 8 | Daily productivity report | ✅ Done | — |
| 9 | Technician productivity report | ✅ Done | — |
| 10 | Daily labour register | ⚠️ Done; **cash and credit share one group** | Bill type (#65 closed without it) |
| 11 | Workshop bill report | ⚠️ Done; **cash and credit share one group** | Bill type (#65 closed without it) |
| 12 | PDI bill register | ❌ Not built | PDI job card issue **#69** (open) |
| 13 | Free service report | ✅ Done | — |
| 14 | Workshop consumption report | ❌ Not built | Business decision (Q5) + requisition number |
| 15 | Vehicles reported before first service | ✅ Done | — |
| 16 | Vehicles visited, mileage wise | ✅ Done | — |
| — | Repair order control chart | ❌ Not built | Not specified (Q7) |
| all | **Job type** filter | Hidden | Not defined (Q1) |
| all | **Engineer** filter | Hidden | Not defined (Q2) |

Besides the blocked items, PR #81 itself still has to be reviewed, tested, merged and deployed
(section 4). It now **conflicts with PR #82** (section 4.1).

---

## 2. Decisions needed from the business

Nothing below needs more engineering investigation. Each item needs an answer from the right person.
Where a default was used, the reports already work with it. Q1, Q2, Q5 and Q7 block work. The others
confirm defaults that are already built.

| Q | Question | Ask | Default used now | If the answer differs |
|---|---|---|---|---|
| **Q1** | **Job type**: what does it mean? (e.g. in-house / outside, customer / internal, repeat job) | Service manager | Filter hidden | — (blocks 3.2) |
| **Q2** | **Engineer**: a separate role, or the service adviser / workshop manager? | Service manager | Filter and column hidden | — (blocks 3.1) |
| Q3 | **PDI marker**: identify PDI jobs by the service type? | Service manager | Service type with category `PDI` | Switch to PR #82's `preDelivery` flag (3.4) |
| Q4 | Progress reports' **date basis** (legacy uses bill date; unbilled overdue jobs would never show) | Workshop manager | Report 5: job date / bill date choice, job date default. Report 6: bill date | Change one default in the config |
| **Q5** | **Consumption report**: build it or drop it? The business said it is not used today | Service manager | Not built | — (blocks 3.6) |
| Q6 | Bill type before #65 | Accounts | Cash and credit together; zero-value separate | — (see 3.3, now needs a new answer) |
| **Q7** | **Repair order control chart**: in scope? What should it show? | Service manager | Not built | — (blocks 3.7) |
| Q8 | Admin "All branches": one combined report, or grouped per branch? | Management | One combined report | Add a branch group level |
| Q9 | Workshop bill report columns: the issue's parts / labour / VAT split, or the legacy's delivered by, gate pass and total? | Accounts | Legacy columns; the split is an option | — |
| Q10 | **WCT** and external labour in the labour register: what are they, and where are they recorded? | Accounts | Not shown; footnote explains | Add columns once the data exists |
| Q11 | PDI bill register filters: legacy allows only model and variant. Keep that? | Service manager | — (report not built) | — |
| **new** | **Cash vs credit bill**: how should the new app decide it? (3.3) | Accounts | — | — |

> Suggested next step: one 30-minute meeting with the service manager and accounts with this table.
> Answers to Q1, Q2, Q5, Q7 and the cash/credit rule unblock everything except report 12.

---

## 3. Remaining items in detail

Each item gives: what is missing, the blocker, how to resolve it, and the engineering work that
follows, with an estimate. All new reports follow the existing pattern: a `ReportDefinition` on the
server, a `ReportConfig` on the client, a permission, tests and a `doc/reports.md` section. See
"Adding a report" in [reports.md](reports.md).

### 3.1 Engineer (slice 4)

**Missing:** the issue's standard filters include *engineer*. Reports 3, 4, 5 and 7 also list an
engineer column. The new app has no engineer on a job card.

**Blocker:** Q2. Legacy has a separate "Engineer" designation (the floor engineer in charge of a job).
We do not know if that role exists in the new organisation or if it is the service adviser.

**How to resolve:** the service manager answers Q2.
- *If a separate role:* add the Engineer role and assign it to the right users.
- *If it is the service adviser or workshop manager:* reuse those users. No new role.

**Work after the answer** (~1–1.5 days):
1. Migration: `JobCard.engineerId → User` (nullable, relation `JobEngineer`), index on
   `(branchId, engineerId)`; if a role, add `ROLES.ENGINEER` in `server/src/shared/constants/roles.ts`.
2. Server: accept `engineerId` in `service.validation.ts` / job opening and editing; extend
   `/service/staff` to return engineers.
3. Client: an *Engineer* picker on `JobCardCreateForm` and `JobCardEditForm`; show it on the job card.
4. Reports: add `engineer` to `FilterKey` (`reports/core/types.ts`), to `jobFilterSql` and
   `jobColumnsSql` (`reports/core/sql.ts`), and to `lookups.ts`. Add the filter key to each report's
   `filterKeys`. Add the column and filter to the client configs (`configs/shared.ts`, `workshop.ts`).
5. After sign-off, make the engineer **required** on new job openings. Old jobs show "Not set".
6. Tests: filter applied / ignored when "All"; integration test seeds an engineer.

### 3.2 Job type

**Missing:** every legacy filter screen has *Job type*. It is hidden in all reports.

**Blocker:** Q1. Nobody has defined what a job type is, and the new app has no such field. Guessing
would create data that has to be migrated later.

**How to resolve:** the service manager defines the job types (the list of values and who sets it).

**Work after the answer** (~0.5–1 day):
1. Add it as a workshop master kind (`JOB_TYPE`) if the list is maintained by users, or as an enum if
   fixed. Add `JobCard.jobTypeId` (nullable).
2. Job card opening and editing: a *Job type* picker.
3. Reports: `jobType` in `FilterKey`, `jobFilterSql`, `lookups.ts` and the client configs, as for the
   engineer.

### 3.3 Cash / credit / zero bill grouping (reports 10 and 11)

**Missing:** acceptance criterion *"The daily labour register … groups bills by credit, cash and
zero."* Today the reports show two groups: **Cash and credit bills** and **Zero value bills**.

**Blocker:** the plan expected #65 to add a bill type to `Invoice`. **#65 was closed on 07/10/2026
without one.** No branch has a bill type field. So this is no longer "wait for #65". It needs a rule.

**How to resolve:** accounts confirm one of these:

| Option | Rule | Pros / cons |
|---|---|---|
| **A (recommended)** | **Credit** = the job's delivery was released on approved credit (`JobCard.creditApprovedById` is set). **Zero** = bill amount 0. **Cash** = everything else. | Uses data the app already records. No new field. Needs accounts to agree that "credit" means "released on credit". |
| B | Add `Invoice.billType` (`CASH / CREDIT / ZERO`), chosen when the bill is created | Exact. Needs a billing screen change and a back-fill rule for existing bills. Belongs in a billing follow-up to #65. |
| C | Credit = bill not fully paid at delivery (`outstandingAmount > 0` at that time) | No new field, but the history of payments makes it harder to compute and explain. |

**Work after the answer** (~0.5 day for A; ~1.5 days for B):
- A: select `jc."creditApprovedById" IS NOT NULL` in the bill query in `billing.reports.ts`; change
  `billGroupOf(total)` to `billGroupOf(total, onCredit)` and `BILL_GROUPS` to the three groups in
  `reports/core/calc.ts`; update `calc.test.ts` and the integration test. No client change: the groups
  come from the server.
- B: migration plus billing UI first, then the same report change reading `i."billType"`.

### 3.4 PDI marker: switch to PR #82's flag

**Missing:** nothing is blocked. The rule "PDI jobs are excluded from every report" currently uses
service types with **category `PDI`** (our default for Q3).

**New information:** open PR **#82** (`DevPastey`) adds `WorkshopMaster.preDelivery` ("Pre-delivery
service, unsold vehicles only") to service types. That is effectively the PDI marker.

**How to resolve:** confirm with the author of #82 and the service manager that *pre-delivery service
= PDI*. If yes, after #82 merges (~1–2 hours):
1. Change `notPdiSql` in `reports/core/sql.ts` to `NOT COALESCE(st."preDelivery", false)`. Keep the
   category check as well during the transition if existing data uses it.
2. Update `core.test.ts` and the PDI exclusion in `reports.integration.test.ts`.
3. Update the PDI wording in `doc/reports.md`.

Also: once **#69** builds PDI job cards as **separate records** (as #69 says), PDI jobs may not be in
`JobCard` at all. The exclusion then becomes a safety net only.

### 3.5 PDI bill register (report 12)

**Missing:** the report. It is the history of PDI bills, used as legal evidence, so it must be
read-only and show exactly what was billed. 132-column, landscape.

**Blocker:** **#69 PDI job card** (open, not started on any branch). PDI bills, defects and voucher
numbers do not exist yet.

**How to resolve:** deliver #69 first. While building it, make sure it records what this report needs:
- a PDI bill number and date, linked to the PDI job
- the defects per job (#69's defects grid)
- parts and labour amounts per bill, the bill type, and a **voucher no** (or confirm the voucher no
  is dropped)
- a **PDI registration** field on the vehicle or PDI job

Also answer Q11 (filters: legacy allows only model and variant).

**Work after #69** (~1 day):
1. Server: a `pdi-bill-register` definition in `billing.reports.ts` that reads the PDI tables (or
   `JobCard` with the PDI flag, depending on #69's design). Bill date range, model and variant
   filters (plus whatever Q11 adds).
2. Permission `report:pdi-bill-register`: a migration that inserts it, grants for Workshop Manager,
   Billing Officer, Accountant and Admin in `roles.ts`, and the "Reports — Workshop" group in
   `administration/admin.service.ts`.
3. Client: config in `configs/billing.ts` (landscape, columns from the issue), and a note on the page
   that the register is read-only evidence.
4. Tests, Swagger example, `doc/reports.md` section; the design is prompt 12 in
   `plans/workshop-reports-ui-prompts.md`.

### 3.6 Workshop consumption report (report 14)

**Missing:** the report: consumables issued to jobs (e.g. petrol), with issued, returned and net qty,
rate, amount and totals by part category.

**Blockers:**
1. **Q5**: the business said the report is not used today. Build it or drop it?
2. **Requisition no**: `PartIssuance` has no document number, and the report lists one. (The
   *requisition type* is **no longer a blocker**: #64 added `JobCardLine.chargeType`, which is linked
   1:1 to `PartIssuance`. Customer, warranty, goodwill and free map to legacy's non-warranty,
   warranty, goodwill and FOC.)

**How to resolve:** the service manager answers Q5. If the answer is **drop**, close it on the issue
and nothing else is needed. If **build**, agree whether the requisition no is a new number on
`PartIssuance` or whether the report can show the job no and issue date instead.

**Work if built** (~1–1.5 days):
1. Optional migration: `PartIssuance.requisitionNumber` from `nextDocumentNumber()` (new
   `REQUISITION` type in `finance/document-number.ts`), set when parts are issued.
2. Server: `consumption` definition (new `inventory.reports.ts` or in `billing.reports.ts`):
   date = `PartIssuance.issuedAt`; net qty = issued − sum of `PartReturn` (approved ones only);
   requisition type from `JobCardLine.chargeType`; rate from the job card line; group by part category.
   PDI and cancelled jobs excluded.
3. Filters: model, variant, service type, requisition type, technician (+ engineer / job type when
   3.1 / 3.2 land). Permission `report:consumption`, as in 3.5.
4. Client config, tests, docs.

### 3.7 Repair order control chart

**Missing:** the screen was attached to the issue (legacy screenshot 014), but the issue does not
describe it.

**Blocker:** Q7. Is it in scope, and what should it show?

**How to resolve:** the service manager confirms scope and what it shows. The legacy filter screen
suggests a count of repair orders by stage over a date range, grouped by team, received by, engineer
or job card. A draft design (prompt 23 in `plans/workshop-reports-ui-prompts.md`) can be used to get
that answer.

**Work after the answer** (~1–2 days, depends on the spec): a new definition and config. It can reuse
the status logic from the workshop status report (`canonicalStatusSql`, `statusAsOn`). Grouping by
engineer needs 3.1 first.

### 3.8 Confirmations that do not block (Q4, Q8, Q9, Q10)

These are built with a default and only need sign-off. If an answer changes the default, the work is
small (a config default or one extra group level, under half a day each). Q10 (WCT, external labour)
needs a place to record those amounts first. That belongs in billing, not in the reports.

---

## 4. Before PR #81 can merge

These are not blockers from the issue. They are the normal steps to finish the 14 built reports.

### 4.1 Resolve the conflicts with PR #82

A trial merge of `feature/workshop-reports` with `origin/DevPastey` (#82) conflicts in six files:

- `server/prisma/schema.prisma` (both add fields to `WorkshopMaster` and job cards)
- `server/src/modules/service/service.validation.ts`
- `server/src/modules/workshop/workshop-master.validation.ts`
- `client/features/job-cards/components/JobCardCreateForm.tsx`
- `client/features/job-cards/types/job-card.types.ts`
- `client/features/settings/components/workshop-masters-page.tsx`

Both PRs also add a migration with the same timestamp, `20261007100000_…`, but different names. They
are independent and additive, so both apply. Whichever PR merges second should rebase onto main,
keep both sets of fields and run `prisma migrate status` on a local database. Agree the merge order
with the #82 author. Merging #81 first is simpler because #82 changes less of the schema.

### 4.2 Review and test

1. Team code review of PR #81. It is currently **draft**; mark it *Ready for review*.
2. QA following [reports-ui-testing-walkthrough.md](reports-ui-testing-walkthrough.md), including
   printing from a real branch printer (A4 portrait and landscape).
3. Compare the screens with the designs in `doc/plans/report-designs/` (not in git; ask for them).
4. CI on #81 passes (Vercel). The server checks were run locally: `tsc`, build, 457 tests passing with
   a database and 407 without. One existing failure, `service/workshop.integration.test.ts`
   ("Estimate not found"), **also fails on `main`**. It is not caused by this PR, but should be fixed
   or tracked separately.

### 4.3 Deploy

1. Apply the four migrations through the normal deployment (`prisma migrate deploy`). Never run them
   by hand against the shared development database.
   - `20261007090000_workshop_reports_framework`
   - `20261007100000_bookings_free_service_mileage_bands`
   - `20261007110000_pre_job_estimates`
   - `20261007120000_labour_standard_hours_technicians`

   All are additive and idempotent. They backfill booking status from the old free-text status,
   estimate branch, customer and vehicle from the job card, and one technician row per existing
   labour line.
2. Before production, run `SELECT status, count(*) FROM "ServiceAppointment" GROUP BY 1` on a copy.
   Any status the backfill does not recognise becomes *Booked*. Check that this is acceptable.
3. Users must log out and in once to receive the new report permissions.

### 4.4 Set-up after deploy (admin, per branch)

1. **Service types**: tick *Free service* and set *Free service no* (1, 2, 3…) on the free service
   types, or the free service and "before first service" reports stay empty. Set category `PDI` on the
   PDI service type (or `preDelivery`, see 3.4).
2. **Report settings**: check the mileage bands and the due-soon threshold.
3. **Custom roles**: the built-in roles are granted their reports. Custom roles need report permissions
   granted under *Settings → Roles & Permissions → Reports — Workshop*.
4. **Existing jobs** have no service type link and show *Not set*. Optional one-off back-fill:
   match the job's existing service text to the service type master. Ask the team if it is wanted.

---

## 5. Definition of done (from #75)

| Item | State |
|---|---|
| Migrations: job card **engineer** (and job type) | ❌ Blocked (Q2, Q1) |
| Migrations: appointment service type, mileage, booking requests, status | ✅ |
| Migrations: estimate number, date, status, optional job card, vehicle, customer, branch | ✅ |
| Migrations: labour standard hours and multiple technicians | ✅ |
| Migrations: free service no and coupon no | ✅ |
| Migrations: mileage band setting | ✅ |
| Indexes for the report date filters | ✅ |
| Zod validation for every report endpoint | ✅ |
| Unit tests (All filter, as on, overdue/due soon, technician split and efficiency, free service claimable, before first service, mileage bands, detail/summary) | ✅ |
| Database integration tests (booking → estimate → job → labour → bill → delivery; cancelled bill and PDI excluded) | ✅ |
| Swagger with example response for every endpoint; `doc/reports.md` | ✅ for the 14 built |
| CI: backend typecheck, build, tests; frontend lint (0 errors), build | ✅ (one existing failure on `main`, see 4.2) |
| Acceptance: labour register groups by **credit, cash and zero** | ⚠️ Cash and credit together (3.3) |
| Acceptance: PDI jobs appear only in the PDI bill register | ⚠️ Excluded everywhere; register not built (3.5) |
| All other acceptance criteria | ✅ |

---

## 6. Suggested order to finish

| Step | Work | Depends on | Estimate |
|---|---|---|---|
| 1 | Review, QA, resolve #82 conflicts, merge and deploy #81 | Team | 1–2 days elapsed |
| 2 | Business meeting: Q1, Q2, Q5, Q7, cash/credit rule; confirm Q3, Q4, Q8–Q11 | Service manager, accounts | 30 min |
| 3 | Cash / credit / zero grouping (3.3, option A) | Step 2 | 0.5 day |
| 4 | PDI marker switch (3.4) | #82 merged | 1–2 hours |
| 5 | Engineer (3.1) and job type (3.2) | Step 2 | 1.5–2.5 days |
| 6 | Repair order control chart (3.7), consumption (3.6) if kept | Step 2 (and step 5 for engineer) | 1–3.5 days |
| 7 | PDI bill register (3.5) | #69 delivered | 1 day |

After step 7, #75 is complete. Steps 3–6 can ship as one follow-up PR. Step 7 can ship with or right
after #69.
