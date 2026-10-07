# Workshop reports

The **Reports** menu (`/reports`) lists every report the user is permitted to run, grouped as
Front office, Workshop, Productivity, Billing, Vehicle analysis and Finance. Each report has its own
page (`/reports/<slug>`) and API endpoint (`GET /api/reports/<slug>`).

These replace the legacy AutoEnhancer *Service → Daily Reports* screens. The filters, options and
print widths follow the legacy screens; see `doc/plans/workshop-reports-plan.md` (section 8) for
where they differ from the original issue and why.

## Using a report

1. Pick the **period**: a date range (from / to) or a single date ("as on", "for date"). Quick
   picks: Today, Yesterday, This week (Monday to today), This month, Last month.
2. Narrow with the **filters**. Every filter has an **All** checkbox, ticked by default, which
   ignores the filter. Untick it to pick one or more values. Variant options follow the models
   picked.
3. Set the **options** (e.g. print address, detail / summary, order by).
4. Select **Run report**. The filters are saved in the page address, so the page can be
   bookmarked or shared and runs straight away when opened. Changing a filter after a run shows
   "Filters changed — run to update" until the report is run again.

**Detail / summary:** *Detail + summary* (default) shows rows, group subtotals and the grand total;
*Summary only* shows the subtotals and the grand total; *Detail only* shows rows and the grand
total without group subtotals.

**Output:**
- **Screen:** sortable columns (click a heading; sorting is within each group), group subtotals,
  grand total.
- **Print:** the browser print dialog (page range, copies and printer are chosen there). 80-column
  reports print on A4 portrait, 132-column reports on A4 landscape, with the company and branch
  header, report title, period, filters applied, repeated column headings, totals, "Printed … by …"
  and "Page x of y" (Chrome / Edge).
- **Export Excel:** a real `.xlsx` with exactly what is on screen — every row, group labels,
  subtotals and the grand total — with amounts kept as numbers.

**Formats:** amounts in NGN with two decimals; dates `dd/mm/yyyy`; times `HH:mm` (24-hour). All dates
and times are branch local time (WAT, `Africa/Lagos`), whatever the viewer's device is set to.

## Rules every report follows

- **Branch:** a report always covers the user's own branch. Admin and SuperAdmin get a *Branch*
  choice (a branch or *All branches*). A request for another branch by anyone else is refused (403).
- **Excluded:** cancelled job cards, cancelled bills, and PDI jobs (service type with category
  `PDI`). PDI jobs will appear only in the PDI bill register.
- **Dates** are local calendar days: a job opened at 23:30 UTC on 5 October counts on 6 October.
- **Range:** at most 366 days.
- **Size:** a report returns at most 25,000 rows. Beyond that the page says so and asks for
  narrower filters (totals then cover the rows shown).
- **Consistency:** each report reads one database snapshot (read-only, repeatable read) with a
  30-second statement limit.

## Permissions

One permission per report (`report:<slug>`), managed under **Settings → Roles → Reports — Workshop**.

| Role | Reports granted by default |
|---|---|
| ServiceAdviser, Receptionist | Service booking, Job estimate register, List of job cards open, Vehicles to be ready |
| WorkshopManager | All workshop, productivity and vehicle-analysis reports, Free service, report settings |
| BillingOfficer, Accountant | Daily labour register, Workshop bill report, Free service |
| Admin, SuperAdmin | All |

`report:settings` allows editing mileage bands and report thresholds. The receipt register keeps
`report:receipt-register`.

## API

`GET /api/reports/<slug>` — Bearer token, permission `report:<slug>`. Full parameter lists and an
example response for each report are in Swagger (`/api/docs`, tag *Reports*), generated from the
report registry.

Common query parameters:

| Parameter | |
|---|---|
| `from`, `to` | Range reports: `YYYY-MM-DD`, inclusive, branch local time, at most 366 days |
| `date` | Single-date reports |
| `model`, `variant`, `serviceType`, `team`, `receivedBy`, `deliveredBy`, `technician`, `complaint`, `labourOperation` | Filter ids, comma separated (or repeated). Omit = All |
| `mode` | `both` (default), `summary` (no rows), `detail` |
| `branchId` | Admin / SuperAdmin only: a branch id or `ALL` |

Unknown parameters are rejected (400), so a typo never silently runs an unfiltered report.

Response (`data`):

```json
{
  "report": { "slug": "workshop-status", "title": "Workshop status report", "width": 132, "generatedAt": "…" },
  "filters": { "query": { "date": "2026-09-30" }, "applied": [{ "key": "model", "label": "Model", "values": [] }] },
  "rows": [{ "jobNumber": "2026004655", "groupKey": "IN_PROGRESS", "…": "…" }],
  "groups": [{ "key": "IN_PROGRESS", "label": "In progress", "count": 14, "totals": { "count": 14 } }],
  "totals": { "count": 35 },
  "summary": { "OPEN": 8 },
  "meta": { "rowCount": 35, "truncated": false, "branch": { "id": "…", "name": "Abuja – Utako" }, "timeZone": "Africa/Lagos" }
}
```

`GET /api/reports/lookups/<source>` feeds the filter dropdowns (`model`, `variant`, `serviceType`,
`team`, `complaint`, `labourOperation`, `serviceAdvisor`, `technician`). Any report permission is
enough. Inactive masters and staff are included and flagged, because old jobs still refer to them.

## Adding a report

1. Server: add a `ReportDefinition` (query schema, filters, `run(db, scope, query)`) in the right
   `server/src/modules/reports/*.reports.ts` file and list it in `reports.registry.ts`. The route,
   permission check, validation and Swagger entry follow from the registry.
2. Add the `report:<slug>` permission to `PERMISSIONS` and the role grants in
   `shared/constants/roles.ts`, plus an idempotent migration inserting it (the permission test
   checks the migration matches `ROLE_PERMISSIONS`).
3. Client: add a `ReportConfig` in `client/features/reports/configs` and list it in
   `configs/index.ts`. The hub card, route, filter bar, table, print and Excel follow from it.

## Reports

### Front office

**Service booking report** (`service-booking`, 80 col) — vehicles booked to come in on a date
(booked-for date). Filters: model, variant, service type. Option: print address. Shows the
booking no, booked-for date and time, registration / VIN, customer, model / variant, service
type, mileage, booking requests, estimated amount (parts + labour + oil on the requests) and the
status: *Booked*, *Arrived* (a job card was opened from the booking, with its job no),
*No-show* or *Cancelled*. Totals by service type with the number that arrived.

**Job estimate register** (`job-estimate-register`, 132 col) — estimates dated in the period:
estimates prepared **before** a job card and the **latest** estimate of each job card (earlier
revisions are left out). Filters: model, variant, **estimate status** (active / pending approval /
closed / all) and **job status** (not opened / opened / both). Shows parts, labour, service,
discount and net amount, the customer's decision, the estimate status and the job opened; *Show
estimate lines* lists the lines under each estimate.

Estimate statuses:
- **Pending approval** — waiting for the customer's decision.
- **Active** — approved, no job card yet.
- **Closed** — a job card was opened from it (or it was approved as a job's scope), the customer
  declined, it was cancelled, or a later revision replaced it.

Estimates before a job (**Quotations → New estimate**): pick the customer, vehicle and parts /
labour / services; prices come from the part retail rate, the model labour rate and the service
price. Each gets a number (`YYYY######`) and one customer decision (*Record decision*); an open
one can be cancelled with a reason. Opening a job card from it (*Estimate* on the job opening
form) loads its lines and closes it as converted. Existing estimates were numbered by date and
given a status from their latest decision.

Bookings now record (Appointments → Book / Edit):
- **Booking no** `BKYYYY######`, given automatically (existing bookings were numbered by date);
- **Service type** — the workshop service type (paid service, free service, running repair…);
- **Mileage** given when booking (replaced by the reading taken at check-in);
- **Booking requests** — complaint code, request and estimated parts / labour / oil;
- **No-show** — a new status, available while the booking is still pending.

The booking status (booked / converted / cancelled / no-show) follows the appointment status and
job opening. Existing bookings were set from their status and whether a job was opened.

### Workshop

**List of job cards open** (`job-cards-open`, 80 col) — job cards opened in a date range (job
date). Filters: model, variant, service type, service group, received by. Option: print address.
Shows job no, opened date and time, registration / VIN, customer, model / variant, service type,
mileage, received by, team, current status and promise time. Totals by service type.

**Workshop status report** (`workshop-status`, 132 col) — every job that was open at some point on
the *as on* date, with its status **as it stood at the end of that day**:
- *Delivered* if delivered by then (delivery time, or the delivery recorded in status history);
- *Billed – not delivered* if a bill was active then (issued, and not cancelled by then);
- otherwise the latest status-history entry made by then (legacy status text is mapped);
- a job with no status history at all (e.g. imported) uses its current status from its last
  update onward, and *Open* before that.

A job cancelled later still shows as open on earlier days. Filters: standard + delivered by.
Options: only undelivered vehicles; detail / summary. Columns include the bill active that day,
delivery and days open (red over 7). Summary: counts by status.

**Workshop progress report** (`workshop-progress`, 132 col) — jobs against their promise date and
time. **Date on**: job date (default) or bill date (as the legacy report did; open question 4 in
the plan). For each job:
- delivered → *delivered late* if delivered after the promise, else *delivered on time*;
- ready, not delivered → judged by when it became ready (*overdue* if ready after the promise);
- in work → *overdue* once the promise has passed, *due soon* within the chosen hours (default 2),
  otherwise *on time*.

Overdue rows are red, due-soon rows amber, late deliveries orange. Late reasons come from delivery.

**Service-wise workshop progress** (`service-wise-progress`, 132 col) — the same jobs grouped by
service type, by bill date (default, as legacy) or job date. Per service type: jobs, ready, billed,
delivered, delivered on time / late, on-time %, labour and parts billed (net of discount, from the
job's current bill). Opens in summary mode with a chart of on-time vs late deliveries.

**Vehicles to be ready** (`vehicles-to-be-ready`, 80 col) — vehicles promised for a date and not
yet delivered, sorted by promised time. *At risk* (red) = past the promise time and not ready.

The engineer and job type filters from the legacy screens are not shown yet: the job card has no
engineer or job type field (open questions 1 and 2 in the plan).

### Productivity

**Daily productivity report** (`daily-productivity`, 80 col; workshop manager) — labour lines
**recorded** on the day, grouped by technician: jobs, lines, standard hours, charged hours,
labour amount and **efficiency** (standard ÷ charged hours; green from 100%, amber 85–99%, red
below). Lines with no technician are listed last under *No technician*.

**Technician productivity report** (`technician-productivity`, 80 col) — labour on jobs **billed**
in the period, by technician, with an efficiency chart. Filters: model, variant, technician (only
the chosen technicians' share of each line). Order by job date or bill date.

Labour lines now record:
- **Standard hours** — the model labour rate's hours (else the labour item's default hours) when
  the line is added; existing lines were filled the same way.
- **Up to three technicians**, each with an optional **share %** (all or none, adding up to
  100). Without shares the line's hours and amount are split evenly; the last technician takes
  any rounding difference so the shares add back up to the line.

### Vehicle analysis

**Vehicles reported before first service** (`before-first-service`, 80 col) — vehicles **sold**
in the period (sale date) that came in before their first free service. A job counts when its
date is after the sale date and before the vehicle's first job whose service type has free
service no 1 (or the vehicle has had none yet), and its service type is not a free service or
PDI. Grouped by vehicle; shows days since sale (red under 30) and the customer requests.
Filters: model, variant, customer request.

**Vehicles visited — mileage wise** (`mileage-wise`, 80 col) — vehicles billed in the period,
grouped by **mileage band** with a bar chart per band. Filters: model, customer request, labour
operation and a **mileage from / to** range (as the legacy screen). Options: print customer
request, address and labour details. Mileage is the odometer reading on the job card.

### Settings and masters used by the reports

- **Settings → Report settings** (`/settings/reports`, permission `report:settings`; also linked
  from the reports hub): the mileage bands (ascending, no overlaps, only the last open-ended) and
  the *due soon* threshold for the progress reports (default 2 hours).
- **Settings → Workshop masters → Service type**:
  - *Free service* + **Free service no** (1 = first free service). Existing free service types
    whose code or name says first / second / third (e.g. `F1`, `2FS`, "First free service") were
    numbered automatically; check the others.
  - **Category** `PDI` marks the pre-delivery inspection service type, which every report except
    the PDI bill register leaves out.
- **Job opening** records the workshop **service type** and the **free service coupon no**
  (both optional; carried over from the booking). Jobs opened before this change have no service
  type and show as "Not set" until edited.
