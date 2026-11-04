# Workshop monthly reports

Open **Reports → Monthly**. Ten cards are visible only with their individual `report:<slug>` permission. The Receipt Register is now under Finance at `/reports/finance/receipt-register`; its API remains unchanged. Monthly APIs live at `GET /api/reports/<slug>`, with OpenAPI descriptions at `/api/docs`.

| Code | Slug | Print |
|---|---|---|
| M1 | tax-register | A4 landscape / 132 columns |
| M2 | booked-vs-availed | A4 portrait / 80 columns |
| M3 | estimate-vs-job | A4 landscape / 132 columns |
| M4 | unbilled-parts | A4 landscape / 132 columns |
| M5 | corporate-bills | A4 portrait / 80 columns |
| M6 | delivered-model | A4 portrait / 80 columns |
| M7 | delivered-service | A4 portrait / 80 columns |
| M8 | warranty-attended | A4 portrait / 80 columns |
| M9 | warranty-parts | A4 portrait / 80 columns |
| M10 | vehicle-history-card | A4 portrait, section breaks |

All period reports require an ordered `from`/`to` range of at most 366 inclusive days. Dates use Lagos calendar days including the entire end day. Cancelled/void jobs and bills are excluded. PDI services (`preDelivery` or code PDI) are excluded except history with explicit `includePdi=true` plus `pdi:read` from issue #69. No portal route exposes the internal history card. Portal job reads exclude PDI and internal staff names.

Ordinary users are forced to their branch; missing branch assignment or another branch ID returns 403. Admin/SuperAdmin may select a branch or omit it for all branches. Screen data comes from server queries and aggregation, with `{rows,groups,totals,filters,warnings}`. Filters stay in the URL when Run is selected. Changed filters apply on Run; exporting or printing uses the last successful result. Excel is a genuine XLSX workbook using the already-installed SheetJS dependency. Each section is a sheet, with identical rows and server totals. Browser print handles printer, copies and page range.

Amounts use existing Prisma.Decimal money helpers. Unknown tax IDs and free-service sequence are blank because those fields are not recorded. Unknown warranty coverage is counted separately rather than declared beyond warranty. Missing opening snapshots use historical job date/mileage and current policy, with a **calculated** marker; later vehicle mileage is never substituted for missing historical mileage.

M2 ignores appointment status for conversion. A matching linked job or same-vehicle job must fall within the booked day and grace days (default 0), using local calendar days. Jobs without appointment links remain walk-ins. M3 matches parts by part ID and labour by operation ID/code; returns reduce actual quantities. Standalone estimates require branch/customer/vehicle metadata. Legacy estimates use createdAt and their ID when number/date are absent. New job-linked estimates receive a document number/date. The daily issue's standalone estimate creation/approval UI remains separate; this issue adds storage and reporting support.

M4 deducts net accepted returns and active billed quantities. New invoice lines retain the exact job-line link; legacy invoice quantities are allocated once over chronological matching customer-paid part lines. Warranty/FOC/goodwill lines stay unbilled unless an active invoice explicitly links them; exact links are deducted regardless of who pays. Accessories count as spares. Unclassified legacy categories are visible with Both and excluded by specific category filters.

M1 reads authoritative stored invoice VAT and amounts. The tax register exposes the issue's spares, oil, accessories, discount, taxable parts, parts VAT, labour, service charge, labour VAT, round-off and net total.  Cash/credit/both, displayed bill-number or date ordering, address, bill-type page breaks and detail/annexure modes apply. Counter-sale selection is hidden.

An annexure row whose category/rate is unknown stays unallocated. Partial or inconsistent snapshots receive an explicit `UNALLOCATED_DIFFERENCE` VAT adjustment, so annexure VAT always equals selected stored bill VAT; no database values change. Unknown money remains blank, while a confirmed absent category is zero. Legacy report snapshots can supply recorded labour VAT without implying a category split for parts. Missing historical bill types are **UNCLASSIFIED**, included with Both and excluded from Cash/Credit; no payment-status or later approval inference. New bills keep the existing explicit approved-credit classification.

M5 groups invoices by the **current vehicle corporate group**, independently of customer ownership. Historical fleet membership is not recorded. Admin/SuperAdmin manage shared groups, active status and VIN memberships at `/reports/corporate-groups`. Excel import reads the first sheet's VIN column, displays values for review, and applies on Add vehicles. Unknown VINs reject the whole import. Moving an existing membership requires an explicit checkbox. Every change is audited. Inactive groups remain reportable for historical bills.

M6/M7 count delivered jobs once by deliveredAt (two visits by one vehicle are two jobs). Optional delivery detail is included in screen/print/workbook. Targets are omitted pending business confirmation. M9 requires WARRANTY part lines; claim generation means submitted or subsequent status, or submission in status history. Billed-only requires an active invoice, not a stale billedAt timestamp. Technician is obtained from labour lines. Job type is hidden until its business meaning and data exist. Engineer is a distinct optional field and role, not an alias for technician.

Report jobs are capped at 10,000 with an explicit validation error, never silent truncation. Vehicle history searches require narrowing above 100 results; visits are counted in SQL without loading every search result's history. M9 uses `GET /api/reports/vehicle-options` for branch-scoped VIN/registration search and UUID keyset pagination (25 per page, maximum 100), with no 1,000-record cap. Selected IDs are re-resolved inside the same branch scope. Canonical vehicle models and legacy workshop models both appear in model selections. Large-date-range performance must be measured on a representative QA dataset.

Legacy `vehicle_history_card.sql` and `workshop_bill_report.sql` were not supplied or found. Implemented history sections follow the issue's explicit list; legacy-query parity remains pending those files. See [progress](progress/issue-79-progress.md) and [tester walkthrough](testing/issue-79-frontend-walkthrough.md).


## Historical tax-register reference (not an output option)

The former 24-column photo layout is no longer an output option. M1 renders the category/VAT columns specified in #79. Stored legacy snapshot data remains available for original document numbers and verified VAT values; this change does not erase or rewrite historical invoice data.

Optional Invoice.taxRegisterSnapshot stores verified report-only values (schema version 1). New job bills snapshot the current billing calculation; there are no handling/surcharge/WCT inputs in current billing, so these amounts are zero for new bills. Government allocation is unknown where not recorded and remains blank. Historical bills without this snapshot or category breakdown show unknown values as dashes; a total involving an unknown entry stays unknown rather than presenting a misleading partial sum. Stored invoice net total and rounding remain authoritative.

The supplied Kia Plaza cohort has been enriched via prisma/legacy/enrich-tax-register.cjs, after a dry run. It fills only empty snapshots or missing original-document metadata and refuses conflicting values; financial invoice fields are not updated. Source discountamt is a percentage, while DiscountAmount is the stored parts discount amount. Labour includes internal labour and service charge after labordiscount, plus external labour after its separate discount. Parts with a positive stored tax rate/amount are shown under Taxable; the zero-tax bucket uses the combined Tax paid/non-taxable heading and does not assert VAT exemption. GovtVehicle supplies the source government split. All 75 source bills reconcile within one kobo; seven require a rounding note. Source I/Z billing flags and unverified imported tax-category provenance are not guessed: unclassified imported cash/credit bills appear separately and do not enter Cash-only/Credit-only results. Their category VAT annexure remains legacy-unallocated until category mappings are verified.

Historical seed verification recorded before this local-only audit: 74 active bills, all 24 fields present, original document numbers present, net total NGN 7,422,930. See testing/issue-79-tax-register-verification.json. Synthetic component/print/XLSX evidence is in testing/issue-79-tax-register-preview; it contains no customer export data.


## History and verification

With all detail options enabled, M10 has eleven sections. Current and earlier owners share the customer section; cost per kilometre and repeat jobs share the last section. Staff names appear only in authorized internal job visits. Each section has an explicit column schema even when empty; print starts each subsequent section on a new page and Excel produces one sheet per included section, without an extra summary sheet. Options remove their sections. Portal job queries retain cancellation/PDI exclusions even when a status is requested; internal staff names and PDI-linked credit applications are not exposed.

The audit uses a disposable localhost PostgreSQL database. See [audited progress](progress/issue-79-progress.md), [before/after gaps and actual results](testing/issue-79-audit.md), and [component/XLSX verifier](testing/verify-monthly-report-output.cjs). Existing preview files are historical; current synthetic captures are under ignored `.audit-local/visual`. Authenticated role-matrix and production-scale performance testing are separate from those component checks.


## Issue scope correction

Issue #79 is authoritative. The duplicate metric cards above report output are removed. Table footers, required subtotals/grand totals, M2's service-type summary and M4's selectable per-job/per-charge summary remain.

M7 is the requested delivery-date by actual service-type grid, with every delivered job counted once. The additional free-service-sequence table, hard-coded service buckets and accidental-excluding total are removed. M5 groups by corporate membership with its required bill columns and one subtotal per corporate; extra customer/bill-type subdivisions are removed. M2, M4 and M9 expose the issue's full column sets, rather than photo-only columns that hid required fields. M1 uses the issue's category/VAT columns; the extra legacy-layout selector is removed. Historical report snapshots remain readable and invoice amounts are unchanged.

# Framework reports (#75)

Reports built on the report framework from PR #81 share one route (`/reports/<slug>`), one endpoint
(`GET /api/reports/<slug>`) and one screen: filter bar, sortable table with group subtotals, browser
print (80 column on A4 portrait, 132 column on A4 landscape) and Excel export. The monthly reports
above keep their own screens; both are served from `/reports/[report]`.

PR #81 was dropped from `main` by merge `70b7699`. Only the framework was restored. The 14 workshop
daily reports and their schema (bookings, pre-job estimates, labour technicians) come back in a
separate restore of PR #81. The `MileageBand` table is already created by the MIS migration (#97).

## Using a report

1. Pick the period, if the report has one (a date range or a single date).
2. Narrow with the filters. Each has an **All** tick, on by default. Variant options follow the
   models picked.
3. Set the options and select **Run report**. The filters are kept in the page address, so a run
   can be bookmarked or shared.

## Rules

- **Branch:** a report covers the user's own branch. Admin and SuperAdmin may choose a branch or
  *All branches*. Anyone else asking for another branch gets 403.
- **Excluded:** cancelled job cards and bills, and PDI jobs (a pre-delivery service type, or the
  legacy `PDI` category).
- **Dates** are local calendar days (`Africa/Lagos`). A range is at most 366 days.
- **Size:** at most 25,000 rows. Beyond that the page asks for narrower filters.
- **Consistency:** each run reads one read-only, repeatable-read snapshot with a 30-second limit.

## API

`GET /api/reports/<slug>` needs the report's permission (`report:<slug>`). Filter ids go comma
separated (`model`, `variant`, …); omitted means All. `branchId` (Admin / SuperAdmin) is a branch
id or `ALL`. Unknown parameters are rejected (400). Swagger (`/api/docs`, tag *Reports*) is
generated from the registry.

`GET /api/reports/lookups/<source>` feeds the filter dropdowns (`model`, `variant`, `serviceType`,
`team`, `complaint`, `labourOperation`, `serviceAdvisor`, `technician`, `campaign`, `engineer`,
`serviceGroup`, `partCategory`, `freeService`). Any report permission is enough. Inactive entries are
included and flagged.

Matrix reports (S1, S3, S15 below) also return `columns`: the months, service types or branches that
the data columns stand for.

## Adding a report

1. Server: write a report with `defineReport({ slug, title, width, permission, period, query,
   filterKeys, run })` and list it in `server/src/modules/reports/reports.registry.ts`. The route,
   permission check, validation and Swagger entry follow from the registry.
2. Add `report:<slug>` to `PERMISSIONS` and `ROLE_PERMISSIONS` in `shared/constants/roles.ts`,
   with an idempotent migration that inserts the permission and its default grants.
3. Client: add a `ReportConfig` in `client/features/reports/configs` and list it in
   `configs/index.ts`. The hub card, page, filter bar, table, print and Excel follow from it.

## Service · FPC reports (#98)

Legacy *Service → FPC Bulletin*: the five vehicle lists are one report (F1) with a **Show** choice, plus the analysis
(F2). Called, visited and attended are defined in `doc/warranty.md` (FPC bulletins).

### F1. FPC vehicles (`/reports/fpc-vehicles`, 80 column, `report:fpc-vehicles`)

- **Filters:** model, variant, FPC bulletin (each with All); campaign type (FPC by default; picking bulletins
  overrides it); branch (the vehicle owner's branch) for Admin, SuperAdmin and `branch:all` users.
- **Show:**

  | Show | Campaign vehicles listed |
  |---|---|
  | To be called | not completed or not applicable, campaign active |
  | Called but not visited | a contact logged, no job card |
  | Visited but not attended | job cards, none recording the work as done. One row per visit |
  | Attended | the job card that recorded the work as done |
  | Attended but not called | attended, with no contact logged before that job card was opened |

  The tiles above the table show the count of every list for the same filters.
- **Order:** model, variant, registration or VIN. Not-registered VINs come last.
- **Print as** (any combination): **List** (bulletin, VIN, registration, model, variant, customer, phone, branch,
  status; job no, job date, bill date and not-attended reason on visit lists), **Letters** (one A4 page per vehicle,
  template under *Letter template*, `report:settings`) and **Labels** (A4 sheet of 3 × 8). VINs not registered yet
  appear in the list only.
- **Record as called** (To be called only, needs `campaign:vehicle:update`): on Print the page asks for confirmation
  with the count, then adds one contact per vehicle printed: `LETTER` for letters and labels, `PHONE` for the call
  list, outcome `SENT`. Those vehicles then show under *Called but not visited*. Without the tick nothing is recorded.

### F2. FPC analysis (`/reports/fpc-analysis`, 132 column, `report:fpc-analysis`)

- **Filters:** bill date from / to (the period); model (All); FPC bulletin date from / to, or All; campaign type.
- **Order:** model (one row per bulletin and model, totals per model) or bulletin date.
- **Columns:** bulletin, bulletin date, subject, effective – close; vehicles affected (less not applicable); called;
  visited in the period (job cards **billed** in the period); attended and not attended in the period, with the count
  per reason (*Not answered* for visits from before the job card asked); attended % of visited; attended % of affected
  (to date); still outstanding.
- Totals per model and a grand total; percentages are worked out from the summed counts. For the same bulletin and
  period, visited = attended + not attended, as in F1.

### Settings

`GET /api/reports/settings` (any report permission) returns the FPC letter template and its placeholders.
`PUT /api/reports/settings` (`report:settings`) saves it; `{ "fpcLetterTemplate": null }` resets it to the default.
Unknown `{{placeholders}}` are rejected. TODO(confirm): match the template to a printed legacy FPC letter (#98 question 5).

## Service MIS reports (#97)

Legacy *Service → MIS Reports*. The hub lists them under **Service MIS**. All 15 are framework reports:
`/reports/<slug>`, `GET /api/reports/<slug>`, permission `report:<slug>`. Plan and decisions:
`doc/plans/mis-reports-plan.md`; manual test steps: `doc/mis-reports-testing-guide.md`.

### Shared rules

- **Jobs and money (S1, S2, S3, S5, S15)** come from one aggregation (`server/src/modules/reports/mis/mis.data.ts`),
  so the reports agree. A job's value covers **every charge type** (customer, warranty, goodwill, free): labour lines,
  requisitioned parts net of returns, parts issued directly net of returns that were not rejected (at the retail rate,
  as the job bill prices them), and the service charge. Job bills hold only the customer-paid lines, so bills alone
  would show no labour or parts on free services. **Discounts** come from the job's active bill. The parts discount is
  shared between spares and oil in proportion.
- **Oil** = parts of type `O`, **accessories** = type `A` (as in the parts reports). Spares include accessories.
- **Service category** is the `category` of the job's service type: `FREE`, `PAID`, `RUNNING_REPAIR`, `ACCIDENTAL`,
  `PDI` or `OTHER` (masters, see `doc/workshop.md`). **Body** figures are labour in a service group flagged *Body
  repair*, not a category.
- **Job type:** regular or PDI (a pre-delivery service type). Reports with a job type choice default as listed below.
- **Engineer** is `JobCard.engineerId` (a user with the Engineer role), set on job opening and editing.
- Cancelled jobs and bills are excluded.

### The reports

| # | Report (slug) | Width | Period | Filters and options |
|---|---|---|---|---|
| S1 | Monthly information report (`mis-monthly`) | 132 | from month – to month (≤ 12), or all months of the previous year | from day – to day of each month; annexure by service type |
| S2 | Business product mix (`business-product-mix`) | 132 | delivered | model, variant, service type, service group, engineer; job type (default both); group by service type or model (model adds vehicles per mileage band) |
| S3 | Analysis of jobs (`job-analysis`) | 132 | delivered | model-wise or variant-wise |
| S4 | Group-wise productivity (`group-productivity`) | 80 | as on date | model, variant, service group |
| S5 | Engineer performance (`engineer-performance`) | 132 | billed | std filters; job type (default regular); jobs with summary, or only summary |
| S6 | Engineer-wise part consumption (`engineer-part-consumption`) | 80 | issued | engineer; spares / oil / both; detail, summary or both |
| S7 | Requisition return register (`requisition-return-register`) | 132 | returned | based on job / requisition / return; job type (default both); requisition types; billed / unbilled; purchase source, part category, part number |
| S8 | List of major problems (`major-problems`) | 132 | job opened | std filters; job type; major or all defects; from / to defect code; defect-wise or job-wise |
| S9 | List of new customers (`new-customers`) | 80 | first job | model |
| S10 | List of regular customers (`regular-customers`) | 80 | visits from | from / to registration; mileage difference; minimum visits; print address |
| S11 | Birthday / anniversary (`birthday-anniversary`) | 80 | — | from / to day and month; birthday, anniversary or both; date-wise or name-wise; print address |
| S12 | Vehicle resale history (`vehicle-resale`) | 80 | resale | one vehicle (registration or VIN) or all |
| S13 | Vehicles that skipped free service (`skipped-free-service`) | 80 | sold | model, variant, free services; order by model, variant or sale date; detail or summary |
| S14 | Vehicle list by model and variant (`vehicle-list`) | 80 | sold | model, variant; include stock vehicles; order; print customer address |
| S15 | Management information report (`management-information`) | 80 | period | branch or all branches; stock / profit at dealer rate |

"Std filters" = model, variant, service type, service group, engineer.

### Report rules

- **S1** counts jobs in the month they were **delivered**, only on days *from day*–*to day* of each month (clamped to
  the month's length). Labour, spares and oil show the categories, then gross, less discount, net, PDI and total.
  Running jobs = running repair + other services. Body repair labour is a memo line. The annexure adds each
  category's service types, which add up to the category.
- **S2** row % are shares of the row's category (they add up to 100 in each category); category subtotals are shares
  of the whole. Labour is net of discount; spares and oil are before discount. Per vehicle = amount ÷ vehicles. The
  model option gives the same totals.
- **S3** only shows service types with a job in the period. The second grid is each row as % of its total.
- **S4** counts labour lines this month and this calendar year up to the date: billed jobs on the bill date, others on
  the job date. Hours = standard hours where recorded, otherwise charged hours. Labour is net of the bill's labour
  discount, shared over the job's lines.
- **S5** total = labour net + spares and oil net + service charge. Late = delivered after the promised time.
- **S6** amount = (issued − returned) × rate, by the job's engineer (the requisition's engineer when the job has none).
  Charge types: non-warranty (customer), warranty, FOC (free), goodwill.
- **S7** lists completed (or approved) returns. *Billed* = the job has an active bill when the report runs.
- **S8** groups by complaint code with its service group (the code's VEHICLE_GROUP parent); free-text complaints go
  under *Uncoded (free text)*. *Major defects* keeps codes flagged major and leaves out uncoded ones.
- **S9** a new customer's first ever job (any branch, not PDI, not cancelled) is in the period; the branch is that job's.
- **S10** a visit counts when its mileage is at least the mileage difference above the last counted visit.
- **S11** needs no year; a range such as 01 Dec – 31 Jan wraps. The cards show how many customers have no date.
- **S12** a resale is every ownership record after the vehicle's first, dated by its purchase date. *Recorded by* is
  kept for owner changes recorded after #97.
- **S13** a free service (service type in the `FREE` category) is skipped when it was not done and its due limit has
  passed by today: `daysLimit` from the sale date or `mileageLimit` km (the service charge per model screen). With no
  limit, it is skipped once a later free service has been done.
- **S14** stock vehicles have no sale date or no owner; those without an owner appear in every branch's list.
- **S15** reads each section from the report that owns it: workshop (A) from the MIS job aggregation, counter sale (B)
  from the counter sales summary, closing stock (C) and parts profit (D) from the parts reports (FIFO, or dealer rate
  if ticked), total billing (E) from job bills and counter sales, transfers (F, G) from the STN register, purchases from
  vendor MRNs, and outstanding from the age-wise party outstanding as on the end date in the legacy eight bands.
  C and D need `stock:read`, outstanding needs `report:party-outstanding-age`; a section the user may not see is left
  out. *All branches* needs `inventory:cross-branch` (or `branch:all`) and gives one column per branch plus a total.
  A6 (PSF satisfaction) shows *not recorded* until a follow-up module exists.

### Legacy screens merged or left out

- *Model Wise Business Product Mix* is S2's **model** option.
- *Downloading Vehicle History* is the vehicle history card search (#79 M10).
- *Upload Vehicle History*, *Management Data Uploading / Downloading* are left out: every branch is in one database.
- *Customer-wise Handling / Discount* is left out: the percentages were set up but never applied (issue #97, open
  question 5).

### Default grants

WorkshopManager and ServiceManager: all but S15. ServiceAdviser: S9–S14. StoreOfficer and GeneralStoreManager: S6 and
S7. Admin and SuperAdmin: all. TODO(confirm): #97 names WorkshopManager; ServiceManager gets the same set.

