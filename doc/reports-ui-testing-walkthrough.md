# Workshop reports — UI testing walkthrough

A step-by-step guide to testing the workshop daily reports (PR #81, branch `feature/workshop-reports`)
through the application screens. It covers setting up test data, then checking each report, and
finally the features every report shares (filters, print, Excel, permissions).

Work through the parts in order: the reports can only show what the earlier steps create.

| Part | What you do | Time |
|---|---|---|
| [0](#part-0--before-you-start) | Prepare the environment and accounts | 15 min |
| [1](#part-1--master-data) | Set up master data | 20 min |
| [2](#part-2--create-the-test-data) | Create bookings, estimates and jobs (two days) | 60–90 min |
| [3](#part-3--test-each-report) | Run and check each report | 60 min |
| [4](#part-4--shared-features-check-on-any-report) | Shared features: filters, print, Excel, branches, permissions | 30 min |
| [5](#part-5--reporting-a-problem) | Reporting a problem | — |

The user guide for the reports is in [reports.md](reports.md); open questions and the defaults used are
in [plans/workshop-reports-plan.md](plans/workshop-reports-plan.md) (section 7).

---

## Part 0 — Before you start

### 0.1 Environment

1. Use a **test environment** with its own database. Do not test against the shared development
   database or production.
2. Deploy the branch `feature/workshop-reports` (or check it out locally).
3. Apply the database migrations (`npx prisma migrate deploy` in `server/`). Four migrations come with
   this work:
   - `20261007090000_workshop_reports_framework` — report permissions and indexes
   - `20261007100000_bookings_free_service_mileage_bands` — bookings, free service no, mileage bands
   - `20261007110000_pre_job_estimates` — estimates before a job card
   - `20261007120000_labour_standard_hours_technicians` — standard hours, shared technicians
4. Start the server and the client. If the client runs on a port other than 3000, add that address to
   the server's `CLIENT_URL` (e.g. `CLIENT_URL=http://localhost:3123`), otherwise login fails with a
   CORS error (HTTP 500 on `/api/auth/login`).
5. Use **Chrome or Edge** for the print tests.

### 0.2 Accounts

You need one user per role below, all in the **same branch** (e.g. *Abuja – Utako*), plus one Admin.
Create missing users under **Users** (Admin login).

| Role | Used for |
|---|---|
| Admin | Setting up masters and checking every report and the branch choice |
| Workshop Manager | Most reports; report settings |
| Service Adviser | Bookings, job opening, estimates; front-desk reports |
| Billing Officer | Job bills, receipts; billing reports |
| Technician × 2 | Assigned to labour lines (they do not need to log in) |
| A user in a **second branch** | Branch scope checks (any role) |

> After changing a role's permissions, the user must **log out and in again** — permissions are read at
> login.

### 0.3 Dates used in this guide

The test data spans two days so the "as on" and date-range behaviour can be checked:

- **Day 1** = yesterday
- **Day 2** = today

All dates are shown as `dd/mm/yyyy` and times as `HH:mm`, in branch local time (WAT).

### 0.4 Test log

Keep this table while you create data; later steps refer to the numbers.

| Ref | What | Number (fill in) |
|---|---|---|
| B1 | Booking that arrives | BK…………… |
| B2 | Booking left waiting | BK…………… |
| B3 | Booking no-show | BK…………… |
| B4 | Booking cancelled | BK…………… |
| E1 | Pre-job estimate, approved, job opened from it | …………… |
| E2 | Pre-job estimate, pending | …………… |
| E3 | Pre-job estimate, declined | …………… |
| E4 | Pre-job estimate, cancelled | …………… |
| J1 | Job from B1, delivered late, shared labour, billed | …………… |
| J2 | Free service job, coupon, warranty part | …………… |
| J3 | Job in progress, past its promise time | …………… |
| J4 | Job due within 2 hours | …………… |
| J5 | Job opened from E1 | …………… |
| J6 | PDI job (must never appear) | …………… |
| J7 | Cancelled job (must never appear) | …………… |
| J8 | Job billed, bill cancelled the same day | …………… |

---

## Part 1 — Master data

Log in as **Admin**. Open **Settings → Workshop Masters**.

### 1.1 Service types (kind *SERVICE_TYPE*)

Create or check these. *Code* and *description* are examples; keep yours if they already exist.

| Code | Description | Free service | Free service no | Category | Charged to |
|---|---|---|---|---|---|
| RGS | Paid Service | off | — | — | Customer |
| 1FS | 1st Free Service | **on** | **1** | — | Company |
| 2FS | 2nd Free Service | **on** | **2** | — | Company |
| RW | Running Repair | off | — | — | Customer |
| PDI | Pre-delivery inspection | off | — | **PDI** | Company |

Checks:
- [ ] *Free service no* only appears after ticking *Free service*.
- [ ] Unticking *Free service* and saving clears the number.
- [ ] Category `PDI` is what keeps PDI jobs out of the reports.

### 1.2 Other masters

- **TEAM**: *Team A – Mechanical*, *Team B – Express*.
- **COMPLAINT**: *AC not cooling*, *Brake noise*.
- **LATE_REASON**: *Parts awaited*.
- **MODEL / VARIANT**: at least two models with one variant each (e.g. *Sportage* → *SPG20GSLA*,
  *Seltos* → *SELT1.6EA*).

### 1.3 Labour catalogue

**Labour Catalogue**: create two labour items, e.g.

| Code | Description | Default hours | Rate |
|---|---|---|---|
| PM20K | Periodic maintenance 20,000 km | 2 | 20,000 |
| BRK | Front brake pad replacement | 1.5 | 15,000 |

*Default hours* become the **standard hours** on labour lines (unless a model labour rate exists).

### 1.4 Vehicles

Create (or reuse) **five vehicles** with customers. Give three of them a **sale date** in the last 60
days and a **selling dealer**, and fill in the **engine no** — the free service and
"before first service" reports show these.

### 1.5 Report settings

Open **Reports → Report settings** (button top right of the hub) — or **Settings → Report Settings**.

- [ ] Eight default mileage bands are listed (0–1,000 km … 100,000+ km); *Due soon threshold* is 2 hours.
- [ ] Change band 3's *From* to a value inside band 2 → the row shows **"Overlaps with …"** in red and
      *Save changes* refuses with "Fix the highlighted bands first". Put it back.
- [ ] Clear *To* on band 5 (not the last band) → "Only the last band can be open-ended". Put it back.
- [ ] Set *Due soon threshold* to 3, save → "Report settings saved". Set it back to 2.
- [ ] Log in as a **Service Adviser** and open `/settings/reports` → no access (they lack `report:settings`).

---

## Part 2 — Create the test data

Do Day 1 steps **yesterday** if possible. If you can only test on one day, do everything today and read
"Day 1" as "earlier today" — the date-specific checks in Part 3 then use today for both.

### 2.1 Bookings (Day 2) — as Service Adviser

**Appointments → Service Appointments → Book appointment.** For each booking pick the customer and
vehicle, a *Service*, the date and time **today**, and the new fields:

| Ref | Service type | Mileage | Booking requests (complaint · request · parts / labour / oil ₦) | Then |
|---|---|---|---|---|
| B1 | Paid Service | 10,450 | — · *10k service* · 60,000 / 26,500 / 0 and AC not cooling · *AC weak* · 0 / 15,000 / 0 | Check in (2.4) |
| B2 | Paid Service | 20,110 | Brake noise · *Brake pads* · 45,000 / 15,000 / 0 | leave |
| B3 | 1st Free Service | 1,020 | — · *First service* · 0 / 0 / 0 | set status **No-show** |
| B4 | Running Repair | 32,600 | — · *Engine check* · 0 / 20,000 / 0 | set status **Cancelled** |

Checks:
- [ ] Each saved booking shows a **Booking no** `BK` + year + 6 digits on its detail page, with
      service type, mileage and the booking requests.
- [ ] *Add request* allows up to 30 rows; a row without a request text cannot be saved.
- [ ] On B3, the status list offers **No-show** (only while the booking is *Pending*). After saving, the
      page shows the grey **No-show** banner.
- [ ] A new booking for the same vehicle is allowed after B3 is a no-show.

### 2.2 Pre-job estimates (Day 2) — as Service Adviser

**Quotations → New estimate.** Pick customer, vehicle, a description, then add lines: one **Part**,
one **Labour operation** (hours), one **Service**; optional discount.

| Ref | Lines | Discount | Then |
|---|---|---|---|
| E1 | 1 part × 2, PM20K × 2 h, a service | 5,000 | *Record decision → Approved*; later open job J5 from it |
| E2 | 1 part, BRK × 1.5 h | 0 | leave pending |
| E3 | a service | 0 | *Record decision → Declined* |
| E4 | 1 part | 0 | *Cancel estimate* with a reason |

Checks:
- [ ] Saving shows "Estimate <number> created · ₦<net>"; the number is year + 6 digits.
- [ ] A part with no retail rate is refused ("Retail rate is not set for …").
- [ ] A discount larger than the total is refused.
- [ ] The Quotations list shows **Before job card** under the number; E1 shows *Awaiting job card* after approval.
- [ ] *Record decision* is offered once only; after a decision it is gone.
- [ ] A cancelled estimate shows *Cancelled* and no longer offers decision or cancel.

### 2.3 Technicians on labour lines

Labour is added on the job card page (**Labour performed**). Each line can have **up to three
technicians**; *+ Add technician* adds a row, and the *%* box takes an optional share. Leave all shares
blank for an even split, or give every technician a share adding up to 100.

### 2.4 Jobs

The job workflow requires, in order: an **approved estimate** before work starts, labour/parts within
that estimate, a **passed QC** before *Ready*, and a **paid bill** (or approved credit) before
*Delivered*. Each job below follows that flow.

**Opening a job** — **Job Cards → Open job card**: customer/vehicle (or *Booking*), *Service*,
**Service type** (new), **Free service coupon no** (new, free services only), mileage, bay, advisor,
team, promised date/time, customer requests.

#### J1 — Day 1, from booking B1, delivered late (as Service Adviser, then Billing Officer)

> If you create everything today, open J1 from B1 today instead.

1. Check in B1 (*Mark as Checked In*), then open the job from it (pick B1 under *Booking*).
   - [ ] *Service type* is filled from the booking (**Paid Service**).
2. Promise it for **15:00 Day 1**. Team: *Team A*.
3. On the job card: add an estimate with PM20K and BRK, record the customer's **approval**.
4. Add labour:
   - PM20K, 2 h, technicians **Tech 1 75 %** and **Tech 2 25 %**.
   - BRK, 1.5 h, **Tech 2** only.
   - [ ] Each line shows *Std 2 h* / *Std 1.5 h* next to its amount.
   - [ ] Shares of 60 + 30 are refused ("Shares must add up to 100%").
5. Move to *In progress* → *QC* → **Record QC pass** → *Ready* (after 15:00 if you can, so it is late).
6. As Billing Officer: **Invoices → new** (job bill) → *Create job bill*. Note the bill no.
7. On the bill, **Record receipt** for the full amount.
8. Back on the job: status **Delivered**, delivery advisor = an adviser, late reason **Parts awaited**.
   - [ ] B1 now counts as *Arrived* (converted).

#### J2 — Day 1, free service with coupon and a warranty part

1. Open a job with service type **1st Free Service**, coupon **C-118**, on a vehicle with a sale date.
2. Estimate → approve → add PM20K labour (Tech 1) and issue one part.
3. In **Job card lines**, change the part's *who pays* to **Warranty** (needs warranty permission).
4. QC pass → Ready → create the job bill → receipt (if the bill is ₦0 no receipt is needed) → Delivered.

#### J3 — Day 2, in progress past its promise time

Open, promise **one hour ago** (today), team B, add a complaint *AC not cooling*, approve the estimate,
add BRK labour with **both** technicians (no shares), move to **In progress**. Leave it.

#### J4 — Day 2, due soon

Open, promise **in about one hour**, move to **QC**. Leave it (not ready).

#### J5 — Day 2, opened from estimate E1

**Open job card** → under *Estimate* pick **E1** → load it (download icon) → finish opening.
- [ ] Customer and vehicle fill in from E1; the lines load as customer requests.
- [ ] After saving, E1 shows *Job …* in Quotations and is closed as converted.
- [ ] Picking a **closed** estimate (E3/E4) only loads it as a template; the job opens but the estimate
      stays as it was.

#### J6 — PDI job (exclusion check)

Open a job with service type **PDI** today and bill it. It must **not** appear in any report.

#### J7 — Cancelled job (exclusion check)

Open a job today and set status **Cancelled**. It must not appear in any report.

#### J8 — Day 1, bill created then cancelled

Take a job to *Ready*, create its bill, then **Cancel bill** the same day (before delivery). The job
returns to *Ready*. Used by the workshop status and billing checks.

---

## Part 3 — Test each report

Log in as **Workshop Manager** unless a step says otherwise. Open **Reports** in the sidebar.

**Every report page has the same layout:** breadcrumb, title, *Print* and *Export Excel*, a filter card
(**Period**, **Filters**, **Options**, *Reset*, **Run report**), summary cards, and the results table
with group subtotals and a navy grand total.

Before the first run the page says *"Set the filters and select Run report"*. After a run the filters
are in the address bar.

### 3.0 Reports hub — `/reports`

- [ ] Cards are grouped *Front office, Workshop, Productivity, Billing, Vehicle analysis, Finance*.
- [ ] Each card shows *Portrait/Landscape* and *Date based/Period based*.
- [ ] Typing in *Search reports…* filters cards; a nonsense word shows "No reports match".
- [ ] Category chips filter the sections.
- [ ] *Report settings* button shows for Workshop Manager and Admin only.
- [ ] *Receipt register* opens `/reports/receipt-register` and works as before.

### 3.1 Service booking report (Front office)

**Period:** *Booked for* = **today**. Run.

- [ ] 4 bookings: B1 **Arrived · <J1 no>** (green), B2 **Booked** (blue), B3 **No-show** (grey),
      B4 **Cancelled** (red).
- [ ] Summary: Bookings 4 · Arrived 1 (25 % arrival) · Awaiting 1 · No-show 1 · Cancelled 1.
- [ ] Grouped by service type; each subtotal shows bookings, arrived and the estimated amount.
- [ ] B1 *Requests* lists both requests; *Est. amount* = 60,000 + 26,500 + 15,000 = **₦101,500.00**.
- [ ] *Mileage* = the booking mileage.
- [ ] Tick *Print address*, run → *Address* and *Phone* columns appear.
- [ ] Service type filter: untick *All*, pick *Paid Service* → only B1 and B2.

### 3.2 Job estimate register (Front office)

**Period:** this month. Estimate status **All**, Job status **Both**, *Show estimate lines* ticked. Run.

- [ ] E1–E4 listed, plus the latest estimate of each job (J1, J3…). Earlier revisions of the same job
      do not appear.
- [ ] Each row: estimate no/date, registration, customer, model, parts, labour, service, discount, net,
      *Approval* pill, *Estimate status*, *Job no*.
- [ ] E1: Approved · *Closed · job opened* · job no **J5** (link). E2: Pending approval · *Pending*.
      E3: Declined · *Closed · declined*. E4: *Closed · cancelled*.
- [ ] Net = parts + labour + service − discount (check E1).
- [ ] Lines are listed under each estimate (type tag, description, qty, rate, amount).
- [ ] Estimate status **Active** → only approved estimates with no job yet (none if E1 is converted).
- [ ] **Pending approval** → E2 (and pending job estimates). **Closed** → E1, E3, E4 and decided job estimates.
- [ ] Job status **Not opened** → E2, E3, E4. **Opened** → E1 and job estimates.
- [ ] Print: **landscape**.

### 3.3 List of job cards open (Workshop)

**Period:** Job date Day 1 → Day 2. Run.

- [ ] All jobs opened in those two days **except J6 (PDI) and J7 (cancelled)**.
- [ ] Columns: job no (link), opened date and time, registration/VIN, customer, model/variant, service
      type, mileage, received by, team, status pill, promised.
- [ ] Summary cards: total and the top service types; grand total line lists counts per service type.
- [ ] *Received by* filter → only that adviser's jobs.
- [ ] Jobs opened before this release show service type **"Not set"** until edited — expected.

### 3.4 Workshop status report (Workshop) — "as on"

**As on = Day 2 (today).** Run.

- [ ] Grouped by status: Open, In progress, QC, Ready, Billed – not delivered, Delivered.
- [ ] J3 under **In progress**, J4 under **QC**, J1 under **Delivered** only if delivered today.
- [ ] J8 shows **Ready** (its bill was cancelled).
- [ ] *Days open* is red above 7.
- [ ] The coloured bar under the cards matches the counts.

**As on = Day 1.** Run.

- [ ] Jobs opened on Day 2 are **not** listed.
- [ ] J1 shows the status it had at the end of Day 1 (e.g. **Delivered** if delivered on Day 1, or
      **Billed – not delivered** with its bill no and amount if delivered on Day 2).
- [ ] J8 shows **Ready** if its bill was cancelled on Day 1.

Options:
- [ ] Tick *Only undelivered vehicles* → Delivered rows disappear; the *Delivered* card turns faded.
- [ ] *Summary only* → no rows, only group subtotals and the grand total. *Detail only* → rows without
      subtotals.
- [ ] Print: **landscape**.

### 3.5 Workshop progress report (Workshop)

**Date on: Job date**, Day 1 → Day 2, *Due soon within* 2 hours. Run.

- [ ] J3: red left border, red pill **Overdue …** (time since its promise).
- [ ] J4: amber border, amber pill **Due in …** (under 2 h).
- [ ] Jobs promised later than 2 h: grey text **"… left"**.
- [ ] J1 (if delivered after its promise): orange pill **Late …** and *Late reasons* = *Parts awaited*.
- [ ] Summary: On time, Due soon, Overdue, Delivered late, Delivered on time.
- [ ] Change *Due soon within* to 0 → J4 moves to On time.
- [ ] **Date on: Bill date** → only jobs with a bill in the period.
- [ ] Without changing the box, the *Due soon* default comes from Report settings (set 3 there, reload
      a fresh report page → the box shows 3).

### 3.6 Service-wise workshop progress (Workshop)

**Date on: Bill date**, Day 1 → Day 2. Opens in **Summary only**. Run.

- [ ] One row per service type in the table above the results: opened, ready, billed, delivered, on
      time, late, on-time % (bar), labour and parts billed (net of discount); bold total row.
- [ ] Chart: on time (green) vs late (orange) per service type.
- [ ] J8 is **not** counted as billed (its bill was cancelled).
- [ ] Switch to *Detail + summary* → job rows under each service type.

### 3.7 Vehicles to be ready (Workshop)

**Promised for = today.** Run.

- [ ] Only jobs promised today that are **not delivered**, sorted by promised time.
- [ ] J3 (past promise, not ready) has a **red** border; *At risk* card counts it.
- [ ] Summary: Promised, Ready, Still in work, At risk.
- [ ] *Phone* column shows the customer's phone.
- [ ] Print: **portrait**.

### 3.8 Daily productivity report (Productivity)

**For date = the day the labour lines were added** (Day 1 for J1). Run.

- [ ] Grouped by technician; Tech 1 and Tech 2 each have a subtotal with jobs, lines, standard hours,
      charged hours, amount and an **efficiency** pill (green ≥ 100 %, amber 85–99 %, red < 85 %).
- [ ] J1 PM20K (2 h, ₦40,000, 75/25): Tech 1 gets **1.5 h / ₦30,000**, Tech 2 **0.5 h / ₦10,000**;
      the row shows *"Shared with … · 75 %"*.
- [ ] J3 BRK (no shares, two technicians): split **evenly**.
- [ ] Lines with no technician appear last under **No technician**.
- [ ] Grand total hours/amount = the sum of the lines (nothing lost to rounding).

### 3.9 Technician productivity report (Productivity)

**Bill date** Day 1 → Day 2. Run.

- [ ] Efficiency chart with a 100 % line; one bar per technician.
- [ ] Only labour on **billed** jobs (J3, J4 have no bill → not included).
- [ ] *Technician* filter: pick Tech 2 only → only Tech 2's share of each line (0.5 h of the shared line).
- [ ] *Order by* Job date / Bill date changes the row order within each technician.

### 3.10 Daily labour register (Billing) — as Billing Officer

**Bill date** Day 1 → Day 2. Run.

- [ ] Groups: **Cash and credit bills** and **Zero value bills** (a ₦0 bill, e.g. J2 if free).
      Cash and credit are together until bills record their type (issue #65) — expected.
- [ ] Columns: labour, discount, service charges, VAT on labour, **total labour**
      (= labour − discount + service charges + VAT), bill amount, **warranty labour**, **FOC labour**.
- [ ] J8's cancelled bill is **not** listed; J6 (PDI) is **not** listed.
- [ ] If a labour line was set to *Warranty* (or *Free*/*Goodwill*) its amount shows under Warranty
      labour (or FOC labour).
- [ ] Footnote explains that external labour and WCT are not recorded.
- [ ] Print: **landscape**, with the two groups and a double-ruled grand total.

### 3.11 Workshop bill report (Billing)

Same period. Run.

- [ ] Legacy columns: job no, job date, registration, customer, model, service, **delivered by**,
      **gate pass no**, bill no/date, total amount.
- [ ] Tick *Show parts / labour breakdown* → parts, labour, discount, VAT, round-off appear.
- [ ] *Order by* **Bill no** → rows sorted by bill number.
- [ ] Totals per group match the labour register's bill amounts.

### 3.12 Free service report (Billing)

**Bill date** Day 1 → Day 2. Run.

- [ ] Only J2 (service type flagged *free service*).
- [ ] Shows engine no, sale date, selling dealer, mileage, **free svc no 1**, coupon **C-118**,
      service charge, other charges (= warranty labour + warranty parts), **net claimable** = service
      charge + other charges.
- [ ] Grouped under **1st free service**; the summary table below shows model × free service.

### 3.13 Vehicles reported before first service (Vehicle analysis)

**Sale date** covering the vehicles you gave sale dates to. Run.

- [ ] Only jobs **after the sale date** and **before** that vehicle's first job with free service no 1,
      not free services, not PDI.
- [ ] Grouped by vehicle: VIN · registration · model · *Sold dd/mm/yyyy* · customer.
- [ ] *Days since sale* pill (red under 30 days).
- [ ] Customer request filter (*AC not cooling*) → only J3-like jobs with that complaint.

### 3.14 Vehicles visited — mileage wise (Vehicle analysis)

**Bill date** Day 1 → Day 2. Run.

- [ ] Bar chart per mileage band (the bands from Report settings).
- [ ] Rows grouped by band, ordered by mileage; jobs without mileage under *Mileage not recorded*.
- [ ] *Mileage (km)*: untick *All*, From 5,000 To 15,000 → only jobs in that range.
- [ ] *Print customer request* / *address* / *labour details* add those columns.

---

## Part 4 — Shared features (check on any report)

### 4.1 Filters

- [ ] Every filter has **All** ticked by default and its dropdown greyed out.
- [ ] Untick *All* → the dropdown opens with a search box; tick several values → chips appear
      ("Sportage ×", "+1").
- [ ] *Variant* only lists variants of the models picked under *Model*.
- [ ] Inactive masters/staff appear marked *(inactive)*.
- [ ] Quick dates: Today, Yesterday, This week (Monday–today), This month, Last month.

### 4.2 Run, URL, reset

- [ ] After *Run report* the address bar holds the filters. Copy it into a new tab → the same report
      runs straight away.
- [ ] Change a filter after a run → amber **"Filters changed — run to update"** until you run again.
- [ ] *Reset* puts the default filters back (does not re-run).
- [ ] Browser *Back* returns to the previous filters and result.

### 4.3 Table

- [ ] Click a column heading → sorted ascending, again → descending, again → original order. Sorting
      stays inside each group.
- [ ] Job numbers link to the job card.
- [ ] Wide tables scroll sideways inside the card; the page itself does not.

### 4.4 Validation and states

- [ ] *To* before *From* → "The end date must be on or after the start date." (no request sent).
- [ ] A range longer than 366 days → "The period cannot be longer than 366 days."
- [ ] Filters that match nothing → empty state "No … match these filters".
- [ ] Stop the server and run → error panel with **Retry**; start the server, *Retry* → works.

### 4.5 Print

- [ ] *Print* on an **80-column** report (e.g. Vehicles to be ready) → A4 **portrait**.
- [ ] On a **132-column** report (e.g. Workshop status, Daily labour register) → A4 **landscape**.
- [ ] Printout: company name, branch address and phone, report title, period, *filters applied*,
      column headings repeated on every page, group labels, subtotals, double-ruled grand total,
      footer *"Printed dd/mm/yyyy HH:mm by <name>"* and *"Page x of y"*.
- [ ] No sidebar, header or buttons on the printout.
- [ ] *Detail only* / *Summary only* print the same way they show on screen.

### 4.6 Excel

- [ ] *Export Excel* downloads `<report>-<from>_to_<to>.xlsx`, which opens in Excel **without** a format
      warning.
- [ ] It contains: company, branch address, title, period, filters applied, a header row with a filter,
      group labels, every row (not just one page), subtotals and the grand total.
- [ ] Amounts are numbers (they add up with `SUM`), shown with two decimals.
- [ ] Columns hidden on screen (e.g. address when *Print address* is off) are not in the file.

### 4.7 Branch scope

- [ ] Workshop Manager / Service Adviser: reports only show **their branch**; no *Branch* filter.
- [ ] Admin: a **Branch** filter (first in *Filters*) shows their branch by default; *All branches*
      shows every branch together; the results header names the branch or "All branches".
- [ ] A non-admin who edits the URL to add `branchId=<another branch>` gets an error, not data.

### 4.8 Permissions — who sees which reports

Log in as each role and open **Reports**:

| Role | Should see |
|---|---|
| Service Adviser, Receptionist | Service booking, Job estimate register, List of job cards open, Vehicles to be ready |
| Workshop Manager | All Front office, Workshop, Productivity and Vehicle analysis reports, Free service, Report settings |
| Billing Officer, Accountant | Daily labour register, Workshop bill report, Free service report (+ Receipt register as before) |
| Admin, SuperAdmin | Everything |

- [ ] Opening a report URL you are not allowed shows "You do not have access to this report."
- [ ] **Settings → Roles & Permissions → <role>**: the report permissions are listed under **Reports — Workshop**;
      granting one, then logging out and in, makes that report appear.

### 4.9 Phone width

On a phone (or browser at ~390 px wide):
- [ ] Filters stack in one column; summary cards in two columns.
- [ ] The table scrolls sideways inside its card; the page does not scroll sideways.

---

## Part 5 — Reporting a problem

Raise each problem against PR #81 with:

```
Report:            (e.g. Workshop status report)
URL:               (copy the address bar after Run — it holds the filters)
Logged in as:      (role, branch)
Steps:             1. … 2. …
Expected:          …
Actual:            …  (screenshot; for print issues attach the PDF)
Test data refs:    (J1, B3, … from the test log)
```

Known and expected (not defects):
- Cash and credit bills share one group (bill type comes with #65).
- No *Engineer* or *Job type* filters yet (open questions 1 and 2).
- No PDI bill register, consumption report or repair order control chart yet.
- Jobs opened before this release show service type *Not set* until edited.

See [reports-remaining-work.md](reports-remaining-work.md) for what is still to come.
