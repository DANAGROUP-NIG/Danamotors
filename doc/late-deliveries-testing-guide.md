# Late deliveries: manual testing guide

Step-by-step checks for the promised date / time discrepancy feature (`doc/job-cards.md`, *Late deliveries*, and
`doc/reports.md`, *Service · Late deliveries*). Use a **local** database only. Never run migrations or seeds
against the shared dev database in `server/.env`.

The demo jobs sit at **fixed dates in January 2026**, so every figure below is exact whenever you seed. All times
are Lagos time. The figures assume no other jobs with a promise in January 2026 at the branch. A fresh demo
database has none.

## 0. Set up

1. Use a local Postgres database whose name contains `demo`. A ready one is `dana_demo_late` on the
   `dana-pdi-pg` container (port 55432). It is a copy of the CSC demo database with this feature's migration and demo
   already applied.
2. In `server/`, for these commands only:
   ```bash
   export DATABASE_URL="postgresql://<user>:<password>@localhost:55432/dana_demo_late"
   npx prisma migrate deploy        # applies 20261122100000_late_deliveries
   npx ts-node prisma/seed/seed.ts  # base data (skip if the database already has it)
   npm run prisma:seed:demo -- --late-only --second-branch="Abuja Branch"
   ```
   The last command prints:
   ```
   Late deliveries (Lagos times):
     LATE-1 LSL-801LD DM-LATE-1: promised 2026-01-05 17:00, delivered 2026-01-06 10:30
     LATE-2 LSL-802LD DM-LATE-2: promised 2026-01-05 17:00, delivered 2026-01-08 11:00, reasons 2
     LATE-3 LSL-803LD DM-LATE-3: promised 2026-01-07 23:00, delivered 2026-01-08 00:30, reasons 3
     LATE-4 LSL-804LD DM-LATE-4: promised 2026-01-12 17:00, delivered 2026-01-12 18:15
     LATE-5 LSL-805LD DM-LATE-5: promised 2026-01-12 12:00, delivered 2026-01-12 16:30, reasons 1, 6
     LATE-6 LSL-806LD DM-LATE-6: promised 2026-01-14 17:00, delivered 2026-01-14 16:00
     LATE-7 LSL-807LD DM-LATE-7: promised 2026-01-14 17:00, delivered 2026-01-14 17:00
     LATE-8 LSL-808LD DM-LATE-8: promised 2026-01-20 17:00, not delivered
     LATE-9 LSL-809LD DM-LATE-9: promised 2026-01-21 17:00, delivered 2026-01-23 09:00, reasons 2
     LATE-10 ABJ-810LD DM-LATE-10: promised 2026-01-06 17:00, delivered 2026-01-09 12:00, reasons 4
   ```
   Run it again: the same list, and nothing is duplicated.
3. Start the API (`npm run dev` in `server/`, same `DATABASE_URL`) and the client (`npm run dev` in `client/`).
4. Users (local seed passwords):
   - `admin.lagos@danamotors.com`: Admin, Main Branch, **own branch only**. Use it for most steps, because the counts
     below are for Main Branch.
   - `admin.abuja@kiamotors.com`: Admin, Abuja Branch, own branch only. Used for the branch checks.
   - `servicemanager@kiamotors.com`: Service Manager with `branch:all`. Sees both branches.
   - `advisor1@kiamotors.com`: Service Adviser. Has none of the new permissions.

What each demo job is for:

| Job | Promised → delivered | Expected |
|---|---|---|
| DM-LATE-1 | 05 Jan 17:00 → 06 Jan 10:30 | Late by date, 1 day, **no reason** |
| DM-LATE-2 | 05 Jan 17:00 → 08 Jan 11:00 | Late by date, 3 days, reason 2, remark |
| DM-LATE-3 | 07 Jan 23:00 → 08 Jan 00:30 | Late by date, 1 day (just after midnight), reason 3 |
| DM-LATE-4 | 12 Jan 17:00 → 12 Jan 18:15 | Late by time, 1h 15m, **no reason** |
| DM-LATE-5 | 12 Jan 12:00 → 12 Jan 16:30 | Late by time, 4h 30m, reasons 1 and 6, remark |
| DM-LATE-6 | 14 Jan 17:00 → 14 Jan 16:00 | On time |
| DM-LATE-7 | 14 Jan 17:00 → 14 Jan 17:00 | On time (exactly at the promise) |
| DM-LATE-8 | 20 Jan 17:00 → not delivered | In no report |
| DM-LATE-9 | 21 Jan 17:00 → 23 Jan 09:00 | Late by date, 2 days, reason 2, other service type |
| DM-LATE-10 | 06 Jan 17:00 → 09 Jan 12:00 | Abuja Branch, late by date, 3 days, reason 4 |

## 1. Late-reason master

1. Sign in as `admin.lagos`. Open **Settings → Workshop masters** (`/settings/workshop-masters`) and pick **Late delivery reason**.
2. Expect codes **1 Engineer absent, 2 Spare unavailable, 3 On diagnosis, 4 Customer's decision awaited,
   5 Wrong estimation, 6 Open time**, all active. If the database had "Awaiting parts" / "Awaiting customer
   approval" before, they are listed as inactive.
3. There is no delete action, only active / inactive. Re-running `npx ts-node prisma/seed/seed.ts` keeps the six.

## 2. Promise date details entry

1. As `admin.lagos`: **Workshop → Late Deliveries → Promise Date Entry** (`/late-deliveries/date`).
2. Set **Promised from** `01/01/2026` **to** `31/01/2026`. The list shows **4 jobs**, newest promise first:
   DM-LATE-9 (2 days), DM-LATE-3 (1 day), DM-LATE-2 (3 days), DM-LATE-1 (1 day). The tabs read **All 4 · No reason 1 ·
   Recorded 3**. DM-LATE-10 (Abuja) is not listed.
3. Click **No reason**: only DM-LATE-1, with an amber *No reason* tag.
4. Open **DM-LATE-1**. Check:
   - header: `DM-LATE-1`, *Service job*, a red *Late by date* badge, `LSL-801LD · Rio …`;
   - tiles: Promised **05 Jan 2026, 17:00** → Delivered **06 Jan 2026, 10:30** → Late by **1 day** ("17h 30m after the
     promise");
   - six numbered reason tiles, none selected, `0 / 6 selected`; History shows only *Delivered*.
5. Click **Save** with nothing selected: *Select at least one reason.* (Save stays disabled until something changes.)
6. Press the keys **2** then **4** (with the focus outside a text box). Tiles 2 and 4 light up with **#1** and **#2**.
   Type a remark, e.g. *Compressor came from the main store*. *Unsaved changes* appears.
7. Click another job in the list: the browser asks to leave without saving. Cancel.
8. Click **Save**. Toast *Late-delivery reasons saved*. History now shows *Admin … reasons none → 2, 4 · remarks added*
   with the date and *on the promise date details screen*. The list tabs read **No reason 0 · Recorded 4**.
9. Click **Undo** after changing something: the form returns to the saved values.
10. Select all six tiles: the note reads `6 / 6 selected` and a seventh cannot be added (the server refuses seven).
11. **Prev / Next** walk the list. **Save & next** saves and opens the next job.
12. **Find**: type `lsl 803ld` (spaces and lower case are fine) and press **Find**. DM-LATE-3 opens.
13. **Find** `DM-LATE-6`. An amber banner: *Job DM-LATE-6 was not delivered late.*
14. **Find** `DM-LATE-4`. Banner: *…delivered late on the promised day (by time), not on a later date. Use the
    promise time details entry.* Click **Go to promise time details**. The time screen opens on DM-LATE-4.
15. **Find** `DM-LATE-8`. Banner: *…has not been delivered yet…*

## 3. Promise time details entry

1. **Late Deliveries → Promise Time Entry** (or the *Late by time* switch at the top). Same period.
2. The list shows **2 jobs**: DM-LATE-4 (**1h 15m**, no reason) and DM-LATE-5 (**4h 30m**, 2 reasons).
3. Open DM-LATE-5: tiles 1 and 6 are selected, and the remark is filled. Promised 12:00 → delivered 16:30.
4. Open DM-LATE-4, pick reason **3**, then Save. It moves to *Recorded*.
5. Open `/late-deliveries/time?job=<id of DM-LATE-1>` (copy the id from the job card URL). The banner points you to
   the date screen.

## 4. Job card integration

1. Open job card **DM-LATE-2**. A **Delivered 3 days late** panel shows the *Late by date* badge, promised and
   delivered times, reason chip **2 Spare unavailable** and the remark. **Correct reasons** opens the date screen on
   this job.
2. Open **DM-LATE-6** (on time). No panel.
3. Deliver a new job after its promised time (any open job whose promise has passed): the delivery form asks for
   reasons (now shown with their numbers 1–6) and offers a **Delay remark**. After delivery, the job card panel
   shows both.

## 5. Branch and permission checks

1. Sign in as `admin.abuja`. On the date screen with January 2026, only **DM-LATE-10** is listed (3 days, reason 4).
2. Open `/late-deliveries/date?job=<id of DM-LATE-1>`: *Could not open this job: You can only open jobs of your own
   branch* (HTTP 403). **Find** `DM-LATE-1` gives the same message.
3. Sign in as `servicemanager` (`branch:all`). The date screen lists **5 jobs** (both branches), and DM-LATE-1 opens.
4. Sign in as `advisor1`. There is no *Late Deliveries* menu, `/late-deliveries/date` is blocked, and the five reports
   are missing from **Reports**.

## 6. Reports

Run each from **Reports → Service · Late deliveries** as `admin.lagos`, branch **Main Branch**, period **Promised date
01/01/2026 to 31/01/2026**, every filter on **All**. The figures assume the demo data before your edits in steps 2–3.
If you saved reasons there, the reason lines move: DM-LATE-1 leaves *No reason recorded* and counts under 2 and 4.
Re-seeding does not undo edits; delete and re-seed the demo database, or adjust the expectations.

### 6.1 Promised date discrepancy report (132 col)

- Cards: **Delivered 8 · Late by date 4 · Late % 50.00% · Average days late 1.75**.
- Detail (oldest promise first): DM-LATE-1 (1, *No reason recorded*, highlighted), DM-LATE-2 (3, reason 2, remark),
  DM-LATE-3 (1, reason 3: **just after midnight counts as the next day**), DM-LATE-9 (2, reason 2).
  Time-late, on-time and undelivered jobs are absent.
- Summary *By model*: **Rio 4 delivered, 2 late, 50%, 1.5**; Sorento 2, 1, 50%, 1; Sportage 2, 1, 50%, 3.
  Total 8, 4, 50%, 1.75.
- *By service type*: the running-repair type 7, 3, 42.86%, 1.67; the other type (DM-LATE-9's) 1, 1, 100%, 2.
- *By reason*: 1 → 0; **2 → 2 (50%, 2.5)**; **3 → 1 (25%, 1)**; 4, 5, 6 → 0; **No reason recorded → 1 (25%, 1)**.
- **Print**: choose *Summary only*, then Run. Only the three tables show, and the print preview has them under the
  heading. *Detail only*: no tables. *Detail with summary*: both.
- **Filters**: tick off *All* on Model. The dropdown enables, and Variant offers only that model's variants. Model
  **Sportage** gives only DM-LATE-2 (Delivered 2). Service type = DM-LATE-9's type gives only DM-LATE-9. Job type
  **PDI** gives nothing.
- Period **01/02/2026–28/02/2026**: empty. Tick **All promised dates**: the January jobs come back, and the heading
  reads *Promised date: all dates*.
- **Export Excel**: sheet 1 has the four rows and the total; sheet *Summary* has the three tables with the same
  figures.

### 6.2 Promised time discrepancy report (132 col)

- Cards: **Delivered 8 · Late by time 2 · Late % 25.00% · Average delay 2h 53m** (172.5 min).
- Detail: DM-LATE-5 (promised 12:00, delivered 16:30, **4h 30m**, reasons 1 + 6), DM-LATE-4 (17:00 → 18:15,
  **1h 15m**, no reason).
- *By model*: Sportage 2, 1, 50%, 270; Rio 4, 1, 25%, 75; Sorento 2, 0, 0%, 0.
- *By reason*: 1 → 1 (50%, 270); 6 → 1 (50%, 270); No reason recorded → 1 (50%, 75).

### 6.3 Promised date delayed delivery analysis (80 col)

- Cards as in 6.1: **8 · 4 · 50.00% · 1.75**. These must equal 6.1.
- Rows: 1 Engineer absent 0; **2 Spare unavailable 2 (50%)**; **3 On diagnosis 1 (25%)**; 4, 5, 6 → 0; **No reason
  recorded 1 (25%)**, highlighted. Grand total: *Late jobs (4 of 8 delivered, 50.00%)*.
- The bar chart *Why jobs were late* shows the three non-zero lines.

### 6.4 Promised time delayed delivery analysis (80 col)

- Cards: **8 · 2 · 25.00% · 2h 53m**, the same as 6.2.
- Rows: 1 → 1 (50%, 4h 30m); 6 → 1 (50%, 4h 30m); No reason recorded → 1 (50%, 1h 15m); the others 0.

### 6.5 List of delayed deliveries (132 col)

- **6 rows**: DM-LATE-1 (Date, 1 day), DM-LATE-2 (Date, 3 days), DM-LATE-3 (Date, 1 day), DM-LATE-5 (Time, 4h 30m),
  DM-LATE-4 (Time, 1h 15m), DM-LATE-9 (Date, 2 days). The total reads *6 delayed · 4 by date · 2 by time*. This is
  the union of 6.1 and 6.2.

### 6.6 Stability and branch scope

- Run 6.1 again on another day: the same figures (late status comes only from the stored date-times).
- Branch **Abuja Branch** (as `servicemanager`, or `admin.abuja`): the date report has only DM-LATE-10 (Delivered 1,
  Late 1, 100%, 3 days, reason 4); the time report is empty.

## 7. API spot checks (optional)

Swagger (`/api-docs`), tag *Late Deliveries*:
- `PUT /api/late-deliveries/{id}` with seven reason ids → 400; with a duplicate → 400 *A reason can be selected only
  once*; with `kind: "TIME"` on DM-LATE-1 → 400 code `NOT_LATE`.
- The audit log (Admin → Audit log, action `LATE_DELIVERY_REASONS_UPDATED`) shows each save with `before` and `after`.

## Automated checks run

- Server unit: `late-delivery.logic.test.ts`, `reports/late-delivery/late.logic.test.ts`.
- Server integration (needs `TEST_DATABASE_URL` on a local DB with the migration):
  `late-delivery.integration.test.ts` covers SQL / JS classification parity, date vs time vs on time, midnight,
  filters, all dates, analysis = discrepancy totals, list = union, 403, audit, and the six-reason / duplicate rules.
- Client: `node --test test/late-delivery-logic.test.mjs`.
