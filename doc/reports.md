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
