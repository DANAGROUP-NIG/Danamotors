# Repeat jobs: manual testing guide

Step-by-step checks for the repeat job feature (`doc/workshop.md`, *Repeat jobs*). Work on a **local** database only.
Never run migrations or seeds against the shared dev database in `server/.env`.

Job numbers depend on what else is in your database, so the steps name vehicles by registration
(`LSR-701RP` … `LSR-708RP`). Repeat counts below are exact for a database where the repeat demo ran today;
"jobs opened" and repeat % also count any other jobs in the period, so they vary.

## 0. Set up

1. Start a local Postgres and use a database whose name contains `demo` (e.g. `dana_demo_repeat`).
2. In `server/`, point `DATABASE_URL` at it for these commands only:
   ```bash
   export DATABASE_URL="postgresql://<user>:<password>@localhost:<port>/dana_demo_repeat"
   npx prisma migrate deploy                     # applies 20261120100000_repeat_jobs
   npx ts-node prisma/seed/seed.ts               # base data (skip if the database already has it)
   npx ts-node prisma/seed/demo/index.ts --second-branch="Abuja Branch" --repeat-only
   ```
   The last command prints (job numbers will differ):
   ```
   RPT-1 LSR-701RP: 2026000002 automatic repeat, PENDING_REVIEW
   RPT-2 LSR-702RP: 2026000003 automatic repeat, PENDING_REVIEW
   RPT-3 LSR-703RP: 2026000004 automatic repeat, CONFIRMED
   RPT-4 LSR-704RP: 2026000005 automatic repeat, NOT_REPEAT
   RPT-5 LSR-705RP: 2026000006 manual repeat, PENDING_REVIEW
   RPT-6 LSR-706RP: no new job: open one in the UI
   RPT-7 LSR-707RP: no new job: open one in the UI
   RPT-8 LSR-708RP: no new job: open one in the UI
   ```
   Run it again: same output, nothing new is created.
3. Start the API (`npm run dev` in `server/`, same `DATABASE_URL`) and the client (`npm run dev` in `client/`).
4. Sign in on **Main Branch**. Users used below (local seed passwords):
   - `superadmin@danamotors.com` (SuperAdmin): everything
   - `wm.lagos@kiaamotors.com` (WorkshopManager, Main): reviews (the seed reviewed RPT-3 and RPT-4 as this user when present, else as an admin)
   - `serviceadvisor@kiamotors.com` (ServiceAdviser, Main): can open jobs, read repeats and run the reports, cannot review

### Demo data at a glance (Main Branch window: 15 days / 500 km)

| Key | Vehicle | Previous visit | This visit | Expected |
|---|---|---|---|---|
| RPT-1 | LSR-701RP Rio | 9 days ago, 45,200 km, "AC not cooling" | today, 45,610 km | Automatic (days **and** km), pending, with an opening note |
| RPT-2 | LSR-702RP Sportage | 40 days ago, 30,000 km | today, 30,320 km | Automatic **by km only**, pending |
| RPT-3 | LSR-703RP Sorento | 6 days ago, 61,000 km | today, 61,150 km | Confirmed: 2 wrong diagnosis + 3 road test not conducted |
| RPT-4 | LSR-704RP Rio | 12 days ago, 18,000 km | today, 19,900 km | Automatic by days, reviewed **0 not a repeat** |
| RPT-5 | LSR-705RP Sportage | 120 days ago, 22,000 km | today, 29,500 km | Outside both limits, flagged **by hand** (manual), pending |
| RPT-6 | LSR-706RP Sorento | billed 5 days ago, 40,000 km | — | Open a job yourself: warning appears |
| RPT-7 | LSR-707RP Rio | billed 60 days ago, 10,000 km | — | Open with 10,300 km (repeat by km) or 12,000 km (no repeat) |
| RPT-8 | LSR-708RP Sportage | billed 90 days ago; **cancelled** job 3 days ago | — | Open a job: no repeat (cancelled jobs never count) |

## 1. Settings and reason codes

1. As superadmin: **Settings → Company**, branch **Main Branch**. Under *Repeat jobs and bookings* expect
   *Repeat window (days)* `15`, *Repeat window (km)* `500` and **Print the repeat block … on the job card** ticked.
2. Switch to **Abuja Branch**: `45` days, `4000` km (the legacy Abuja window).
3. Change Main to `20` days, save, then back to `15`, save. Expected: saved each time. (Each save is written to the
   audit log as `BRANCH_SETTINGS_UPDATED` with before and after.)
4. **Settings → Workshop Masters**, kind **Repeat job reason**: codes `0`–`6` in legend order. Code 0 *Not a repeat job*
   has **Means "not a repeat job"** ticked; 1–6 do not.

## 2. Reports (Reports → Service · Repeat jobs)

Run these **first**, right after the seed: the later steps open and review repeats, which changes the figures.
Use period **This month**, Main Branch.

### R1. List of repeat jobs
1. Default options: **4** rows (RPT-1, RPT-2, RPT-3, RPT-5): cards Listed 4 · Pending 3 · Confirmed 1 · Not a repeat 0.
   Columns: job no/date, registration/VIN, model · variant, mileage, previous job/date, prev. mileage, days, km,
   prev. engineer/SA, engineer/SA now, reasons, remarks, review (status and source).
2. Tick **Include vehicles marked "not a repeat job"**: **5** rows (RPT-4 added), Not a repeat 1.
3. Tick **Only vehicles marked "not a repeat job"**: the *Include* box hides and the list has **1** row (RPT-4).
4. Model filter **Sportage**: RPT-2 and RPT-5 only.
5. **Print**: 132-column layout with the filters in the header. **Excel**: same rows and columns.

### R2. Repeat job analysis
1. **Analyse by Model**, **Only summary**: one row per model with Jobs, Repeats, Repeat %, Pending, Confirmed and
   columns *1 Component failure* … *6 Spares unavailable*. Expect Sportage repeats **2** (pending 2), Rio **1**,
   Sorento **1** (confirmed 1, *2 Wrong diagnosis* 1, *3 Road test not conducted* 1). Totals: repeats **4**,
   pending 3, confirmed 1. RPT-4 (not a repeat) is not counted anywhere.
2. **Detail with summary**: each model's repeat jobs, then its summary row; a *Highest repeat %* chart above the table.
3. **Detail**: only models with repeats, no summary rows.
4. **Analyse by Engineer**: the repeats sit under the **previous** job's engineer (the engineer of the DM-RPT-…-V1
   visits), with jobs = the jobs that engineer handled this month.
5. **Analyse by Service advisor**: same, by the previous job's advisor.
6. Print and Excel in each mode.

### R3. Date-wise summary of repeat jobs
1. One row per day with jobs. Today's row: repeats **4**, pending 3, confirmed 1, not a repeat 1, repeat % = 4 ÷ jobs
   opened today. The grand total adds the days up. Days at 10% or more are tinted.
2. The filter is labelled **Service advisor**. Pick the advisor of the earlier visits: repeats stay (they count
   against the previous job's advisor); jobs opened count only that advisor's jobs.
3. Print (80-column) and Excel.

## 3. Automatic detection at opening

1. As `serviceadvisor@…`: **Workshop → Job Cards → New**. Pick customer *Chidi Okafor* and vehicle **LSR-706RP**.
2. The **Repeat check** card turns amber: *Repeat job: back 5 days and 0 km after job DM-RPT-6-V1* (km follows the
   mileage field). It shows the previous job's date, mileage (40,000 km), service type, engineer, advisor, complaint
   (*Steering wheel vibration*) and work done. The mileage field starts at the last reading (40,000), so both
   *Days since* and *Km since* (0 km) are highlighted. The header shows a **Repeat job** tag.
3. Set mileage `40,450`: the card says *back 5 days and 450 km* with both limits highlighted.
4. Leave the optional note empty. Fill the rest of the form (service type RR, promised date, a request, mechanic)
   and save. Expected: the job opens; its header shows **Repeat · pending**, and a **Repeat job** block shows previous
   job DM-RPT-6-V1, back after 5 days, driven 450 km, *Not reviewed yet*, branch window 15 days or 500 km.
   Source tag **Automatic**.
5. Nothing asked for a reason: the reason is recorded at review.

## 4. Window by km only, and outside both limits

1. New job for **LSR-707RP**, mileage `10,300`. Expected: amber card, *back 60 days and 300 km … (by km)*; only
   *Km since* is highlighted. Do not save this job (the next steps reuse the vehicle).
2. Same vehicle, change mileage to `12,000`. Expected: green **No repeat detected**: *the last billed job is outside
   the branch window of 15 days or 500 km*, and a checkbox **Flag as a repeat job by hand**.
3. Mileage `9,000` (lower than the last reading): the odometer rule asks for a replacement reason; tick it and give
   one. The repeat card stays green: a lower reading never counts as within the km window. Do not save.

## 5. Open, cancelled and PDI jobs never trigger a repeat

1. New job for **LSR-708RP**, mileage `51,300`. Expected: **No repeat detected**. The cancelled job 3 days ago is
   ignored, and the billed job 90 days / 1,300 km back is outside the window.
2. (Optional) Open a job for any vehicle, leave it open, then start another job for the same vehicle: the open job is
   not billed, so no repeat is detected against it.
3. PDI jobs (**Workshop → PDI**) never show the repeat card, and a PDI is never used as the previous job.

## 6. Flag by hand (manual)

1. New job for **LSR-707RP**, mileage `12,000` (no repeat detected). Tick **Flag as a repeat job by hand**.
2. Pick previous job **DM-RPT-7-V1** in *Previous job*, type a note "Battery flat again", save.
3. Expected: the job shows **Repeat · pending** with source **Manual**; the block shows *back 60 days*, *2,000 km*,
   and *Advisor's note: Battery flat again*.
4. Tick the box but leave *Previous job* empty and save: "Choose the job this visit repeats".

## 7. Repeat jobs list (legacy "Find")

1. **Workshop → Repeat Jobs**. Tiles: *Pending review*, *Confirmed repeats*, *Not a repeat*, *All flagged*.
   After steps 2 and 5 expect Pending **5** (RPT-1, RPT-2, RPT-5 and your two new jobs), Confirmed **1**,
   Not a repeat **1**, All **7**.
2. The default tab is **Pending review**, newest first. Each row: repeat job (link), vehicle, previous job, *Back after*
   (days and km; the limit that triggered is amber), the previous engineer and SA, reasons, status and source, and a
   **Review** button.
3. Search `LSR-704`: switch to **Not a repeat**: one row with chip **0 Not a repeat job**.
4. Source filter **Flagged by hand**, tab **All**: RPT-5 and your manual job from step 5.

## 8. Review (legacy "Repeat Job Details (Entry)")

1. As `wm.lagos@…`: open **LSR-701RP**'s repeat (Review). Expected layout:
   - header with job no, **Pending review**, **Automatic**, registration, model · variant, VIN
   - tiles *Back after* **9 days** (window 15 days, *within*), *Driven since* **410 km** (window 500 km, *within*),
     *Counts against* the previous engineer and service advisor
   - **Previous job** and **This visit** side by side: date, mileage, service type, advisor, engineer,
     technicians, customer requests (*AC not cooling* vs *AC still not cooling*), work done
   - the advisor's note *Customer says the AC is warm again after two days*
2. Click **Save** with nothing chosen: "Choose at least one reason." Choose **1 Component failure**, leave remarks empty:
   "Enter remarks for the reasons given."
3. Press the `4` key (outside the text box): **4 Workmanship problem** toggles on, marked *Reason 2*.
4. Click **0 Not a repeat job**: it replaces 1 and 4 (the others dim). Click **1** again: 0 is dropped.
5. Try to pick a sixth reason after choosing 1, 2, 3, 4 and 5: the sixth is refused with the "Five reasons" note.
6. Choose **1** and **4**, remarks "AC compressor clutch not replaced", **Save & next pending**. Expected: toast
   *Repeat job review saved*, and the next pending repeat opens. Back on the list, LSR-701RP is **Confirmed repeat**
   with chips 1 and 4.
7. Open **LSR-702RP**'s repeat: only *Driven since* (320 km) is *within*; *Back after* 40 days is not.
   Choose **0**, remarks "Customer back for a scheduled service", save. Expected: *Marked as not a repeat job*; the job
   card's tag reads **Not a repeat**.

## 9. Who can change a review

1. As `serviceadvisor@…`: open any repeat. Expected: read-only view (*You can view this repeat job but not review it*),
   and no **Review** buttons on the list (only **Open**).
2. As `wm.lagos@…`: open LSR-703RP (reviewed by the seed). If the seed used `wm.lagos`, the form is editable; change
   remarks and save. Otherwise it shows *Reviewed — only the reviewer or an Admin can change it*.
3. As superadmin: open LSR-703RP: always editable. Change the reasons to **2** only, save.
4. (Optional) Give `servicemanager@kiamotors.com` the `repeatjob:review` permission (Users → permissions) and open
   LSR-701RP (reviewed by `wm.lagos` in step 7): saving is refused with *Only the reviewer or an Admin can change a
   reviewed repeat job*.

## 10. Job card, print and vehicle history

1. **Workshop → Job Cards**: repeat jobs show a tag under the job number: **Repeat · pending** (amber),
   **Repeat** (red, confirmed), **Not a repeat** (grey).
2. Open LSR-703RP's job: the **Repeat job** block shows the reasons as chips, the remarks and *Reviewed by … on …*,
   with **Open review** (or **Review repeat** while pending). Click **Print**: the block prints with the reasons as
   text and without the buttons.
3. Settings → Company → Main Branch: untick **Print the repeat block**, save. Print the same job: no repeat block on
   paper (it still shows on screen). Tick it again.
4. **Vehicles → LSR-703RP**: the history row of today's job has the **Repeat** tag; filter **Repeat jobs** keeps only
   repeat visits.
5. **Reports → Vehicle history card** for LSR-704RP: the *Repair cost and repeat jobs* section lists the repeat with
   previous job DM-RPT-4-V1, review status *Not a repeat* and reason *0 Not a repeat job: Different complaint …*.

## 11. Permissions at a glance

| User | Menu *Repeat Jobs* | Review | Reports |
|---|---|---|---|
| WorkshopManager, Admin, SuperAdmin | yes | yes | all three |
| ServiceAdviser, ServiceManager, Auditor | yes | no (read only) | all three |
| Others (e.g. Technician) | no | no | no |

## 12. Existing repeat jobs (migration back-fill)

On a database that had repeat jobs before the migration: each one now has a record with source **Manual**, status
**Pending review**, its old reason as the advisor's note, and *window not recorded*. They appear in the list and
reports like any other repeat.

## Automated checks

From `server/`:

```bash
npx jest src/modules/repeat-job src/modules/reports/repeat           # unit tests
TEST_DATABASE_URL="postgresql://…/dana_test_repeat" npx jest src/modules/repeat-job/repeat-job.integration.test.ts
```

The integration test needs a migrated, disposable localhost database and skips without `TEST_DATABASE_URL`.
