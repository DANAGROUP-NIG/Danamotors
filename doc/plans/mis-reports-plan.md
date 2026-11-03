# Service MIS reports (#97): analysis and plan

Branch `feature/mis-reports` (from `Jayking` = `origin/main` 2a5676e).

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Analysis and plan (this doc) | Done |
| 1 | Schema and masters: service category, service group, body repair flag, anniversary date, ownership recorder, mileage bands, indexes, permissions | Done (migration `20261103100000_mis_reports`) |
| 2 | Shared aggregation (`mis/mis.data.ts`) + S1, S2, S3 | Done |
| 3 | S4–S8 (productivity, engineer, parts, requisition returns, problems) | Done |
| 4 | S9–S14 (customer and vehicle lists) | Done |
| 5 | S15 management information report | Done; unit tests in `mis/mis.logic.test.ts` (29) |
| 6 | Frontend: framework extensions, 15 screens, hub, master screen fields, engineer on job editing | Done |
| 7 | Demo seed, docs, manual testing guide, full checks | Done (see Verification) |

## What the codebase already has (differs from the issue text)

The issue was written against an older tree. These already exist on `main`:

| Issue asks for | Already on main | Plan |
|---|---|---|
| `JobCard.engineerId` and an `Engineer` role | Column (migration `20261014110000`), role, job opening field (`requireStaff(..., ROLES.ENGINEER)`) | Reuse. Add the engineer to job **editing** if missing. |
| Report framework from PR #81 | Core, registry, controller, lookups, runner restored by PR #147 | Build on it. The 14 #75 reports and their schema are still missing (see open question 1). |
| `JobCardLabour.standardHours` | Present | Reuse for S4 hours sold. |
| `ReportSetting` | Present (`report:settings`) | Reuse. |
| Requisition number (#69) | `PartRequisition` (number, date, charge type, engineer), `PartRequisitionLine`, `PartReturnSlip` (return number and date) | S6/S7 show real requisition and return numbers, not the job number fallback. |
| `SERVICE_GROUP` master | `VEHICLE_GROUP` master kind = legacy `vehiclegroup`; complaints already hang from it | Use `VEHICLE_GROUP` as the service group (see open question 2). |
| `dueDays` / `dueKm` | `ServiceTypeModelSetting.daysLimit` / `mileageLimit`, shown as "Due at" on the service charge screen | Reuse (see open question 3). |
| Service group on labour lines | `JobCardLabour.groupId` points at a **TEAM** master (labour slip group) | Not the service group; S4 uses `LabourItem.serviceGroupId`. |

Still missing: service category values, `LabourItem.serviceGroupId`, `COMPLAINT.major`, `Customer.anniversaryOn`, `MileageBand`, the 15 permissions, indexes.

## Architecture

**Backend** (`server/src/modules/reports/mis/`):
- `mis.sql.ts`: one CTE `misJobsSql` that gives one row per delivered job with its category, service type, model/variant, engineer and the money split (labour gross / discount / net, spares, oil, service charge), all from active bills. S1, S2, S3, S5 and S15 A-sections read it, so their totals agree by construction.
- `mis.logic.ts`: pure functions (month buckets and day ranges, % and per-vehicle maths with `Prisma.Decimal`, category roll-ups, regular-visit rule, day-month wrap, skipped free service, MIR section assembly), each unit-tested.
- One `*.reports.ts` per group: `mis-summary` (S1–S3), `mis-workshop` (S4–S8), `mis-lists` (S9–S14), `mis-management` (S15). Each report is one `defineReport` entry in the registry: route, permission, Zod validation and Swagger come from it.
- S15 calls `PartsReportService.run()` and `PartyReportService`, not copies of their queries.

**Money basis:** a job's value covers every charge type (labour lines, requisitioned parts net of returns, direct issues net of returns at the retail rate, service charge), because job bills hold only customer-paid lines. Discounts come from the active bill. Oil = part type `O` and accessories = `A`, as in the parts reports.

**Frontend** (`client/features/reports/`):
- Framework extensions: `columnsFor(data, options)` for data-driven columns (months, service types, branches); `text` and `month` option kinds; an "MIS" hub category with its own section header.
- Screens are configs in `configs/mis-*.tsx`. Custom visuals: month trend chart (S1), category share bars (S2), heat-tinted % grid (S3), engineer scorecards (S5), sectioned scorecard with a branch column per branch (S15).
- Print (80 / 132 col) and Excel come from the same columns.

## Decisions taken (TODO(confirm) in code)

- Delivered = `JobCard.deliveredAt` in the period; a job not delivered is not in S1–S3.
- New customer = first non-PDI job at any branch in the period; branch scope applies to that job's branch.
- Billed / unbilled (S7) = the job has an active invoice when the report runs.
- Birthday/anniversary: day-month range, wraps over 31 Dec; the year is ignored.
- Customer-wise handling/discount, vehicle history upload/download and management data up/download are not built (issue section 4).
- MIR A6 (PSF) shows "Not recorded" until a follow-up module exists.

## Decisions confirmed with the user (2026-11-03)

1. PR #81 restore is a separate follow-up. MIS builds on the restored core and creates `MileageBand` idempotently.
2. Service group = the existing `VEHICLE_GROUP` master (no `SERVICE_GROUP` kind).
3. Free service due limits = the existing `daysLimit` / `mileageLimit` (no `dueDays` / `dueKm`).

## Further decisions made while building

- `COMPLAINT` masters already had `attributes.majorDefect`: used as the major flag (no new column).
- Body repair = VEHICLE_GROUP `attributes.bodyRepair` (editable on the master screen).
- Labour items keep picking the group by code; the server sets `serviceGroupId` from it.
- `VehicleOwnership.createdById` added for S12 *Recorded by* (only owner changes recorded from now on).
- MIR outstanding: the party age report takes five limits, so it runs twice (30…150 and 180…360) to give the legacy eight bands.
- MIR reports with a 120 s limit (`ReportDefinition.timeoutMs`) because it calls the parts report services.
- TODO(confirm): ServiceManager gets the WorkshopManager MIS set; year to date in S4 is the calendar year.

## Verification (2026-11-03, local Docker Postgres)

- `prisma migrate deploy` on a copy of a database at the latest main migration; second run of the SQL is a no-op; no drift from this migration in `migrate diff`.
- Base staff seed + demo seed (twice; the second run adds nothing).
- `mis.logic.test.ts` (29) and `mis.integration.test.ts` (S1–S15 on one fixture, rolled back) pass; all 15 reports smoke-run on the demo data, MIR with all branches.
- Server `tsc`, full unit suite (only the existing `vehicle-catalog.routes.test.ts` failure, also on main); client `tsc`, `eslint` (0 errors), `next build`.
- Existing `return-slip` and `labour-slip` integration suites fail the same way on main (JobCardLine amount check in the local database), unrelated.
- Not done: clicking through the screens in a browser.

