# Workshop daily reports: analysis and execution plan

Status: **plan only, nothing implemented yet.** Frontend work waits for the design images generated from
[workshop-reports-ui-prompts.md](workshop-reports-ui-prompts.md).

---

## 1. What the codebase actually has (vs. the issue's "what exists" table)

The issue was written against an older snapshot. Checked against `server/prisma/schema.prisma` and the code on this branch:

| Finding | Impact |
|---|---|
| **#64 is already merged.** `JobCardLine.chargeType` (`CUSTOMER / WARRANTY / GOODWILL / FREE`) is linked 1:1 to `JobCardLabour` and `PartIssuance`. | Warranty and FOC labour/parts columns are **not blocked**. Reports 10 and 13 only wait on #65. |
| **#65 is not merged.** `Invoice` has no bill type (cash / credit / zero). | Reports 10 and 11 cannot group by bill type yet. Build the queries, gate the grouping on the field. |
| **`Invoice` has no `branchId`.** | Every bill report must branch-scope through `invoice.jobCard.branchId`. Counter-sale invoices without a job card are out of scope. |
| **Nothing marks a job as PDI.** No enum, flag or master code. | "Exclude PDI from every report" has no rule to implement. Proposal: `WorkshopMaster.category = 'PDI'` on the PDI service type (the `category` column already exists). Needs sign-off before phase 2. |
| **Job status is mixed-case legacy text.** `JobCard.status` and `JobCardStatusHistory.toStatus` hold both `OPEN/IN_PROGRESS/...` and `Open/Pending/In Progress/Completed/Closed/...`. `canonicalJobStatus()` in `job-card-workflow.service.ts` maps them. | Report SQL needs one shared `CASE` fragment that mirrors `canonicalJobStatus()`, with a unit test that keeps the two in sync. |
| **Money is `Float`**, not `Decimal`. `finance/money.ts` rounds with `Prisma.Decimal`. | Aggregate in SQL as `ROUND(SUM(x)::numeric, 2)`; never sum floats in JS. |
| **No branch time zone and no settings table.** | Fix `REPORT_TZ = 'Africa/Lagos'` (WAT, UTC+1, no DST) and convert date boundaries in SQL with `AT TIME ZONE`. "Due soon" hours and mileage bands need somewhere to live (see 3.6). |
| **Missing indexes** for report date filters: `Invoice.issuedDate`, `JobCard.createdAt`, `JobCard.promisedAt`, `ServiceAppointment.scheduledAt`. | Add composite indexes in the first migration. |
| `/service/staff` accepts only `ServiceAdviser | Technician` and one required `branchId`. | Extend for `Engineer` and delivery advisor; allow it to be omitted for Admin "all branches". |
| `Estimate.jobCardId` is required with `onDelete: Cascade`, and `estimate-approval.ts` assumes a job card. | Making it optional touches the live approval flow (see risks). |
| `/reports` route guard and sidebar link use `financereport:read | report:receipt-register`. | Both must accept any `report:*` permission. |
| A **"Repair order control chart"** screenshot is attached but is **not in the spec**. | Ask whether it is in scope (open question 7). |
| The legacy screens and sample Excel outputs differ from the issue in places (print width, date basis, columns, filters). | Listed in section 8; the design prompts follow the legacy screens. |

---

## 2. Architecture

### 2.1 Backend: `server/src/modules/reports`

```
reports/
  reports.routes.ts          # generated from the registry: permission + Zod + controller per slug
  reports.controller.ts      # thin: resolve scope, call definition.run(), send JSON
  reports.registry.ts        # ReportDefinition[]: slug, permission, schema, run, group
  reports.openapi.ts         # swagger blocks with example responses
  core/
    scope.ts                 # branch scope (user branch / Admin choice / all), REPORT_TZ, date range → UTC bounds
    filters.ts               # base Zod pieces: dateRange (≤366 days), multi-select ids, mode, orderBy
    sql.ts                   # Prisma.sql fragments: canonicalStatusSql, inList(), notCancelledJob, notPdi
    shape.ts                 # rows → { rows, groups, totals } and detail/summary/both trimming
    calc.ts                  # pure: statusAsOn, promiseState (overdue/due soon), splitTechnicianShare,
                             #       efficiency, mileageBand, freeServiceClaimable, beforeFirstService
  front-office.reports.ts    # 1 booking, 2 estimate register
  workshop.reports.ts        # 3 open jobs, 4 status, 5 progress, 6 service-wise, 7 to be ready
  productivity.reports.ts    # 8 daily, 9 technician
  billing.reports.ts         # 10 labour register, 11 workshop bill, 12 PDI, 13 free service
  vehicle-analysis.reports.ts# 15 before first service, 16 mileage-wise
  consumption.reports.ts     # 14 (last)
```

**Registry pattern.** Each report is one `ReportDefinition`:

```ts
interface ReportDefinition<Q> {
  slug: string;                // 'workshop-status'
  permission: PermissionType;  // 'report:workshop-status'
  query: z.ZodType<Q>;         // shared base + report filters
  run(scope: ReportScope, q: Q): Promise<ReportResult>;
}
```

Routes, permission checks, validation and swagger come from the registry, so adding a report is one file entry and the API surface cannot drift.

**Response contract** (all reports):

```ts
{
  report:  { slug, title, width: 80 | 132, generatedAt },
  filters: { ...resolved filters, labels: { model: ['Sportage', 'Seltos'], serviceType: 'All' } }, // print header
  rows:    Row[],               // omitted when mode = 'summary'
  groups:  { key, label, count, totals: Record<string, number> }[],
  totals:  Record<string, number>,
  meta:    { rowCount, truncated: boolean, branch: { id, name } | 'ALL' }
}
```

**Query rules**
- `prisma.$queryRaw` with `Prisma.sql` / `Prisma.join` only; no string concatenation.
- Aggregation in SQL (`GROUP BY` / `ROLLUP` where it fits); calculations that need per-row logic (as-on status, splits) live in `calc.ts` as pure functions over narrow rows.
- Each report runs in a transaction with `SET LOCAL statement_timeout = '30s'`.
- Row cap 25,000 → `meta.truncated = true` and the UI asks the user to narrow filters. Excel exports the same rows.
- "All" = filter omitted from the SQL. A selected list = `IN (...)`. This is the unit-test target in the DoD.
- Default exclusions in `sql.ts`: cancelled jobs, cancelled invoices (`cancelledAt IS NULL`), PDI service type (except report 12).

**Branch scope** (`core/scope.ts`): non-admins are forced to `req.user.branchId` and any `branchId` in the query is rejected via the existing `assertBranchOwnership`. Admin/SuperAdmin may send `branchId` or `branchId=ALL`; with ALL, rows carry the branch name and groups can be per branch.

**Mounting:** `/api/reports/<slug>`. The existing `/finance/reports/receipt-register` stays as is; the frontend hub links to it.

### 2.2 Frontend: `client/features/reports`

```
reports/
  api/reports.api.ts            # runReport(slug, params) → ReportResult (typed per slug)
  catalogue.ts                  # slug, title, category, permission, width, icon, one-line description
  configs/<slug>.ts             # filters, options, columns, grouping, summary cards for each report
  components/
    ReportsHub.tsx              # /reports, category sections of cards, permission-filtered, search
    ReportRunner.tsx            # generic page: header, filter bar, summary strip, table, print layout
    ReportFilterBar.tsx         # period + dimensions + options + Run / Reset
    AllToggleMultiSelect.tsx    # label + "All" checkbox + multi-select combobox (WorkshopPicker search UX)
    PeriodField.tsx             # single date / range + presets (Today, Yesterday, This week, This month, Last month)
    ReportOptions.tsx           # checkboxes, Detail/Summary segmented control, Order by
    ReportSummaryStrip.tsx      # KpiCard-style totals (reuse warranty KpiCard pattern)
    ReportTable.tsx             # sortable, group header rows, subtotal rows, grand total, highlight rules
    ReportPrintLayout.tsx       # print-only header/footer, @page portrait/landscape
  hooks/useReportParams.ts      # URL query string ⇄ filters (Zod-parsed, so bad URLs fall back to defaults)
  lib/report-format.ts          # NGN 2dp, dd/mm/yyyy, HH:mm in Africa/Lagos
```

- **Routes:** `app/(dashboard)/reports/page.tsx` (hub), `reports/[slug]/page.tsx` (looks up the config; unknown slug → 404), `reports/receipt-register/page.tsx` (existing page moved, unchanged).
- **Run model:** filters edit local state; **Run** writes them to the URL; the React Query key is the URL params. A bookmarked URL runs immediately. Changing a filter after a run shows "Filters changed — Run to update".
- **Print:** `@page { size: A4 landscape }` injected per report width; repeat table headers with `thead { display: table-header-group }`; page numbers with `@page { @bottom-right { content: counter(page) " / " counter(pages) } }` (Chromium 131+). Header block = company, branch, title, period, applied filters.
- **Excel:** built from the same column config and rows, with group subtotal rows and a grand total row, via `downloadExcel`.
- **Guards:** `/reports` guard and sidebar item accept any `report:*` permission; `[slug]` checks the slug's own permission.
- **Mobile:** filter bar collapses into a "Filters (3)" sheet; table scrolls horizontally in its card; summary strip becomes a 2-column grid.

---

## 3. Data model changes

All additive, nullable on existing rows, created with `prisma migrate dev --create-only` **against a local/throwaway database, never `server/.env`'s shared DB**.

### 3.1 Indexes (phase 1)
`JobCard(branchId, createdAt)`, `JobCard(branchId, promisedAt)`, `Invoice(issuedDate)`, `ServiceAppointment(branchId, scheduledAt)`, later `Estimate(branchId, estimateDate)`.

### 3.2 Engineer (phase 2, after open question 2)
`ROLES.ENGINEER = 'Engineer'`, `JobCard.engineerId → User` (relation `JobEngineer`). Required on new openings only after sign-off; filter hidden until data exists.

### 3.3 Bookings (phase 2)
```prisma
enum AppointmentStatus { BOOKED CONVERTED CANCELLED NO_SHOW }
ServiceAppointment {
  serviceTypeId String?  → WorkshopMaster("AppointmentServiceType")
  mileage       Int?
  bookingStatus AppointmentStatus @default(BOOKED)   // new column; old free-text `status` kept and backfilled
  requests      AppointmentRequest[]
}
model AppointmentRequest { id, appointmentId, complaintCodeId?, description, estParts, estLabour, estOil }
```
Backfill maps current `status` text to the enum; job opening sets `CONVERTED`. Needs a small appointment UI change (service type, mileage, requests).

### 3.4 Estimates (phase 3)
`jobCardId` optional (`onDelete` → `SetNull`), plus `vehicleId`, `customerId`, `branchId`, `estimateNumber @unique` (`YYYY######` via `DocumentSequence`), `estimateDate`, `estimateStatus` enum (`ACTIVE / PENDING_APPROVAL / CLOSED`), `closedReason` (`CONVERTED / DECLINED / CANCELLED`), currency default `NGN` (+ backfill `USD → NGN`). Backfill `branchId/vehicleId/customerId` from the job card.

### 3.5 Labour (phase 4)
`JobCardLabour.standardHours Float?` (snapshot from `LabourRate.hours` for the vehicle model, else `LabourItem.defaultHours`), and
```prisma
model JobCardLabourTechnician { id, jobCardLabourId, technicianId, sharePercent Float?  @@unique([jobCardLabourId, technicianId]) }
```
A join table rather than three columns: unlimited techs, explicit split, simpler SQL. Backfill one row per existing `technicianId`. Cap at three in validation to match legacy.

### 3.6 Free service and settings (phase 2)
`WorkshopMaster.freeServiceNo Int?` (service types with `freeService = true`), `JobCard.freeServiceCouponNo String?`.
```prisma
model MileageBand  { id, fromKm Int, toKm Int?, label, sortOrder, active }
model ReportSetting { key String @id, value Json }   // e.g. 'progress.dueSoonHours' = 2
```
Report 16 filters on a km from/to range (as legacy does); the bands only group its summary.

### 3.7 Not before sign-off
Job type (open question 1); PDI marker if the PDI issue defines its own; requisition type (comes with the PDI issue).

---

## 4. Delivery plan (one PR per slice)

| # | Slice | Contents | Unblocked by |
|---|---|---|---|
| 1 | **Framework** | reports module core, registry, permissions (+ role grants, "Reports — Workshop" group in the role admin screen), indexes migration, hub page, ReportRunner and shared components, print layout, Excel, receipt register moved under Finance | — |
| 2 | **Workshop reports** | 3 open jobs, 4 status (as on), 5 progress, 6 service-wise, 7 to be ready | PDI rule decision |
| 3 | **Booking + vehicle analysis** | booking schema + appointment UI, report 1; free service no / coupon / mileage bands + settings UI; reports 15, 16 | — |
| 4 | **Engineer** | engineer role, field, job opening UI, staff endpoint; turns on engineer filter in slices 2–3 | open question 2 |
| 5 | **Estimates** | estimate schema, pre-job estimate create/list UI, report 2 | — |
| 6 | **Productivity** | standard hours, line technicians (+ labour UI), reports 8, 9 | — |
| 7 | **Billing** | reports 10, 11, 13 | #65 |
| 8 | **PDI** | report 12 (read-only evidence) | PDI issue |
| 9 | **Consumption** | report 14 | open question 5, requisition type |

Each slice ships its own unit tests, swagger, a `doc/reports.md` section, and passes `tsc`, build, tests, lint.

---

## 5. Testing

- **Unit (pure, fast):** `calc.ts` functions (as-on status, overdue / due soon at boundaries and across midnight in WAT, split + efficiency incl. zero charged hours, band edges, claimable amount, before-first-service window), "All" vs selected filter SQL fragments, `shape.ts` detail/summary trimming, `canonicalStatusSql` ↔ `canonicalJobStatus` parity.
- **Integration:** `describe.skip` unless `TEST_DATABASE_URL` is set, and refuse to run if it equals `DATABASE_URL`. Seed booking → estimate → job → labour → bill → delivery; assert reports 1, 3, 4, 5, 10, 11 rows and totals; assert cancelled bill and PDI job are excluded; assert a non-admin cannot read another branch.
- **Speed:** run Jest with the transpile-only config plus a separate `tsc --noEmit` (the repo's default ts-jest run is ~16 min).
- **Frontend:** lint 0 errors, build; manual check of print preview portrait/landscape and Excel against the screen.

---

## 6. Risks

1. **Estimate model change hits a live flow.** `estimate-approval.ts`, job billing and `JobCardEstimateSection` assume `estimate.jobCard`. Mitigation: keep the relation required in code paths that start from a job card; add null-guards and tests before relaxing the column.
2. **Appointment status backfill.** Free-text values in production are unknown. Run a `SELECT status, count(*)` on a copy first; unmapped values → `BOOKED` with a migration report.
3. **As-on status correctness** depends on status history completeness. Jobs created before history existed fall back to `createdAt/billedAt/deliveredAt`. Documented in `doc/reports.md`.
4. **Large ranges** (366 days × all branches). Indexes + row cap + statement timeout; summary mode skips rows.
5. **Print fidelity** varies by browser; target Chrome/Edge (what the branches use) and state it.
6. **Scope creep:** pre-job estimate UI, booking requests UI, labour-technician UI and mileage band settings are real feature work inside a "reports" issue. Estimate each separately.

---

## 7. Open questions for the business

1. **Job type:** what does it mean (e.g. in-house/outside, customer/internal, repeat)? Every legacy screen has the filter. It stays hidden until the meaning is confirmed.
2. **Engineer:** a separate role, or service advisors/workshop managers?
3. **PDI marker:** OK to identify PDI jobs by the `PDI` category on the service type master?
4. **Progress reports date filter:** legacy filters reports 5 and 6 on **job bill date** (see 8.2). Unbilled overdue jobs would then never appear on report 5. Proposal: report 5 gets a "Date on: Job date | Bill date" choice (default job date); report 6 keeps bill date.
5. **Consumption report (14):** build or drop?
6. **Bill type before #65:** wait for #65, or show reports 10/11 ungrouped first?
7. **Repair order control chart:** filter screen attached (screenshot 014) but not specified. In scope? A draft design prompt (23) is ready.
8. **"All branches" for Admin:** one combined report, or grouped per branch?
9. **Workshop bill report columns:** the issue lists parts / labour / discount / VAT / round-off, but the reference output has delivered by, gate pass no and one total amount instead (see 8.3). Which one?
10. **WCT** in the labour register: what is it (withholding / works-contract tax?), and where does the new app record it? It is zero on every July row.
11. **PDI bill register filters:** legacy only allows model and variant (the rest are locked). Keep it that way, or add the filters the issue lists?

---

## 8. Evidence from the legacy screens and sample outputs

Source: `doc/plans/legacy-reports/` (17 AutoEnhancer 6.4 screenshots from branch "kia plaza", plus July 2026 Excel
outputs for the Abuja/Utako branch). That folder holds real customer names, so it must stay out of git.

### 8.1 Confirmed as the issue describes
Reports 1, 3, 4, 7, 8, 9, 13, 14, 15 match the issue's filters, options and print width. Common pattern
confirmed: single "All" column of checkboxes, "Refresh selection", output Screen/Printer/File, page range,
copies, printer setup. Options that don't apply are greyed out, so we leave them out:
- Print address is greyed on reports 6, 7, 8 and 12.
- Report 9's print mode is fixed to "Detail only", so it gets no detail/summary option.

### 8.2 Differences from the issue (the prompts follow the legacy screen)

| Report | Issue says | Legacy shows | Plan |
|---|---|---|---|
| 2 Job estimate register | 80 col | **132 col** | Landscape print |
| 5 Workshop progress | job date (open q.) | **Job bill date**; has print address, Excel, detail/summary | "Date on" choice, see q.4 |
| 6 Service-wise progress | as report 5 | **Job bill date**; print address greyed | Bill date; no print address |
| 11 Workshop bill | order by job/bill no; no print address | **Print address** option; default order **Job no** | Add print address; default job no |
| 12 PDI bill register | 7 filters + print address | only **Model, Variant** active; rest locked; print address greyed | Model + Variant (q.11) |
| 16 Mileage wise | "mileage band" dropdown filter | **Mileage (km) from / to** numeric range; order by Mileage | Km range filter; bands only group the summary |
| 15, 16 | — | "In the order of" dropdown (Sale date / Mileage) | Order-by select |

The legacy "Excel" checkbox (reports 7, 15, 16, ROCC) becomes the Export Excel button everywhere.

### 8.3 Sample outputs (`*.xlsx`)

**Daily labour register** (`Jul 2026`, 89 bills):
- Header: company name, branch address, phone; title; "01/07/2026 To 31/07/2026". The print header needs `Branch.address` and `Branch.phoneNumber` (both exist).
- Columns: S.No, Job Number, Job Date, Regn Number, Customer's Name, Model, Variant, VIN, Type of Repair (service type **code**: RGS, RW, RNGRP, ACCID, SC, 2FS, DI), C.Memo/Inv.No., Bill Date, Labor Charges, External, Discount, Service Charges, VAT on Labor, **WCT**, Total Labour, Bill Amount, Warranty Labour, FOC Labour.
- `Total Labour = Labor + External − Discount + Service Charges + VAT + WCT` (cell formula). Bill Amount is the whole bill (parts included).
- Groups: `CREDIT :` (59) and `ZERO VALUE BILLS :` (30). No cash bills that month, so empty groups must render cleanly. The legacy subtotal rows are **blank** in the export; ours must fill them.
- Footnote: "In case of split bills (spare & oil & labour), only labour bill details are printed." In the new app a job can have several invoices (`JobCard.invoices[]`). The register lists every non-cancelled job bill; the labour columns come only from labour lines.
- Warranty labour is non-zero on 3 bills (ACCID, SC, RW), all with zero customer labour. That confirms warranty labour sits outside the customer bill and must come from `JobCardLine.chargeType = WARRANTY`.

**Workshop bill report** (89 bills, same bills as above):
- Header: company, address (3 lines), phone, "WORKSHOP BILL REPORT", period.
- Columns: SrNo, JOB NUMBER, JOB DATE, REGN NUMBER, CUSTOMER'S NAME (truncated to 25 chars, which the 80-column layout forces), MODEL, VARIANT, SERVICE, **Del.By** (user code), **G.PASS NUMBER**, C.MEMO/INV.NO., INVOICE DATE, TOTAL AMOUNT.
- Groups `C R E D I T :` / `Z E R O  A M O U N T`, each with "TOTAL … AMOUNT", then GRAND TOTAL (₦25,502,300 = credit only).
- So the reference has **no parts/labour/discount/VAT split** (q.9). `JobCard.gatePassNumber` and `deliveryAdvisor` cover the extra columns.

**Numbering:** legacy job, bill and gate-pass numbers are `YYYY######` (e.g. 2026000714). `nextDocumentNumber()` in the new app already uses the same format, so printed reports look familiar.

**Service type shown as a code** (RGS, RW…) in legacy prints. The new screens show the description, and the Excel/print columns show the code as legacy did.
