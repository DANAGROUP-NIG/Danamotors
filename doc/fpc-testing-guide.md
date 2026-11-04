# FPC bulletins: manual testing guide (#98)

This guide checks the FPC bulletin work against the acceptance criteria of issue #98. Work through the parts in order.
Each step says what to do and what you should see (**Expect**).

Background: `doc/warranty.md` (Campaigns → FPC bulletins) and `doc/reports.md` (Service · FPC reports).

**Branches.** `restore/report-framework` restores the PR #81 report framework (its own PR). `feature/fpc-bulletins`
is branched from it and holds this issue. Test on `feature/fpc-bulletins`.

---

## Part 0: Set up a local database (never the shared dev database)

`server/.env` points at the shared dev database. Do not migrate or seed it. Use a local Postgres and pass
`DATABASE_URL` on the command line, which takes precedence over `.env`.

1. Turn on Docker Desktop's WSL integration for this distro (Docker Desktop → Settings → Resources → WSL integration).
2. Start Postgres (first time: create the container):

   ```bash
   docker start dana-reports-pg 2>/dev/null || docker run -d --name dana-reports-pg -e POSTGRES_PASSWORD=reports -p 55432:5432 postgres:16
   docker exec dana-reports-pg createdb -U postgres dana_demo_fpc
   ```

3. From `server/`, migrate, then load the base seed and the demo data. The database name contains `demo`, so the demo
   seed's safety guard allows it:

   ```bash
   export DATABASE_URL=postgresql://postgres:reports@localhost:55432/dana_demo_fpc
   npx prisma migrate deploy
   npm run prisma:seed
   npm run prisma:seed:demo -- --second-branch="Abuja Branch"
   ```

   **Expect:** `migrate deploy` applies `20261102100000_fpc_bulletins` without errors. The demo seed prints
   `JC-FPC-1` … `JC-FPC-4` with job numbers, and under *Campaigns* a line for `DEMO-KC26-P010-XM FPC ACTIVE` with:

   | VIN | Registration | Status after the seed | Why |
   |---|---|---|---|
   | KNAKU81DMC5000401 | LSR-401FP | PENDING | nothing done yet |
   | KNAKU81DMC5000402 | ABJ-402FP | PENDING | letter sent (called), not visited |
   | KNAKU81DMC5000403 | APP-403FP | PENDING | JC-FPC-1: work **not** done (parts not available), so back to pending |
   | KNAKU81DMC5000404 | LSR-404FP | COMPLETED | phoned, then JC-FPC-2 did the work |
   | KNAKU81DMC5000405 | ABJ-405FP | COMPLETED | JC-FPC-3 did the work; never called |
   | KNAKU81DMC5000406 | APP-406FP | SCHEDULED | JC-FPC-4 is at work, no answer yet |

   `KNAKU81DMC5000407` is inside the bulletin's VIN range but not registered (Part B).

4. Run the app against the same database, in two terminals:

   ```bash
   cd server && DATABASE_URL=postgresql://postgres:reports@localhost:55432/dana_demo_fpc npm run dev
   cd client && npm run dev        # client/.env.local already points at http://localhost:5000/api
   ```

**Logins** (local base seed):

| Role | Login | Branch scope |
|---|---|---|
| Warranty officer | `warranty@kiamotors.com` / `Warranty@123` | all branches (`branch:all`) |
| Service adviser, Main | `advisor1@kiamotors.com` / `Advisor@123` | Main Branch |
| Workshop manager | `wm.lagos@kiaamotors.com` / `WManager@123` | Main Branch |
| Super admin | `superadmin@danamotors.com` / `SuperAdmin@123` | all branches |

Job numbers come from the app's sequence, so they differ per database. Each seeded job card shows its key under
*Additional information* (e.g. `DEMO-SEED/JC-FPC-1`); searching job cards by registration also works.

---

## Part A: The FPC bulletin master (campaign form)

Log in as the **warranty officer**.

### A1. Sidebar and list

1. Open **Workshop → FPC bulletins**.
2. **Expect:** the page title is *FPC bulletins*, the *FPC bulletin* filter pill is selected, the address is
   `/campaigns?type=FPC`, and `DEMO-KC26-P010-XM` is listed with an orange *FPC bulletin* pill.
3. Click *All* on the type pills. **Expect:** the title changes to *Campaigns* and recalls etc. show too.

### A2. Create a bulletin with the legacy fields

1. On *FPC bulletins*, click **New FPC bulletin**. **Expect:** the form opens with the *FPC bulletin* type selected.
2. Check the labels. **Expect:** *FPC bulletin number*, *FPC bulletin date*, *Subject*, *Measures*, *Effective date*,
   *Close date (optional)* (the legacy names). Select the *Recall* type: the labels change back to *Campaign code*,
   *Title*, *Description*, *Start date*. Select *FPC bulletin* again.
3. Fill in:
   - FPC bulletin number: `Sorento XM11-15` (with a space; legacy numbers have them)
   - FPC bulletin date: any date last month
   - Subject: `Sorento (XM) fuel pump plate cover replacement`
   - Measures: `Countermeasure for all customers visiting the workshop`
   - Effective date: yesterday. Close date: blank.
4. Under **Job card**, type `130005-SORENTO (XM)` in *Display for job card*.
   **Expect:** the counter shows `19/100`; the *Print preview* box shows `SORENTO XM11-15 · 130005-SORENTO (XM)`.
   Untick *FPC bulletin to be printed on the job card*: the preview says nothing is printed. Tick it again.
5. Click **Save & add VIN ranges**.
   **Expect:** a toast *Campaign SORENTO XM11-15 created*; the bulletin page opens and scrolls to *Vehicles to check*,
   with the cursor in *From VIN*. The header shows *Bulletin of …*, *Effective …*, the measures, and
   *Prints on job cards as 130005-SORENTO (XM)*.

### A3. VIN ranges (legacy From VIN / To VIN grid, S and C)

On the new bulletin's *Vehicles to check* card:

1. Type `KNAKU81DMC500040` (16 characters) in *From VIN*. **Expect:** the counter shows `16/17` in amber.
2. Make it `KNAKU81DMC5000401`, leave *To VIN* blank, press **Enter**. **Expect:** a row *Single VIN* is listed.
3. Enter `KNAKU81DMC5000409` → `KNAKU81DMC5000402` and click **Add**. **Expect:** *From VIN comes after To VIN*.
4. Enter `KNAKU81DMC5000402` → `KNAKU81DMD5000409`. **Expect:** *Both VINs must share the first 11 characters*.
5. Enter `KNAKU81DMC5000402` → `KNAKU81DMC5000410` and press Enter. **Expect:** a row covering *9 VINs*.
6. Click **Paste ranges**, paste the two lines below, then **Add to list**:

   ```
   KNAKU81DMC5000402 KNAKU81DMC5000410
   KNAKU81DMC5000500
   ```

   **Expect:** only `KNAKU81DMC5000500` is added (the first line is already listed).
7. Click **Clear** (legacy C). **Expect:** the unsaved rows disappear. Re-add `KNAKU81DMC5000401` → `KNAKU81DMC5000410`.
8. Click **Check**. **Expect:** *New ranges 1*, *Vehicles in the system inside them 6*, *Will be added now 6*.
9. Click **Save 1 range** (legacy S). **Expect:** a toast *Saved 1 range(s) and added 6 vehicle(s)*; the range appears
   under the saved list with *10 VINs*; the progress tiles show *Affected 6*.
10. Click the bin on the saved range, read the warning, then **Keep range**.

### A4. Activate

1. Click **Activate**. **Expect:** status *Active*; advisers get a notification.
2. Optional: create another FPC bulletin with only a range whose vehicles are not registered (e.g.
   `KNAKU81DMC5000900` → `KNAKU81DMC5000909`). **Expect:** *Activate* is enabled although *Affected* is 0.

---

## Part B: A vehicle registered later joins the bulletin

1. As the warranty officer, register a vehicle (Vehicles → New) with VIN `KNAKU81DMC5000407`, any customer, Kia
   Sorento.
2. Open `DEMO-KC26-P010-XM`. **Expect:** *Affected* went from 6 to 7, and the vehicle list includes
   `KNAKU81DMC5000407` as *Pending*, linked to the new vehicle.
3. Also open `Sorento XM11-15` (from Part A). **Expect:** it gained the vehicle too (its range also holds 407).
4. Register a vehicle with VIN `KNAKU81DMC5000411` (outside both ranges). **Expect:** neither bulletin changes.
5. Open a job card for the 407 vehicle (Job cards → New). **Expect:** the warranty & campaign check shows an amber
   *FPC bulletin* banner for each bulletin, and they must be acknowledged before the job card is created.

---

## Part C: "FPC work done" on the job card and the READY rule

### C1. READY is blocked until answered

1. Log in as **service adviser, Main**. Open the job card of `APP-406FP` (`DEMO-SEED/JC-FPC-4`, *In progress*).
2. **Expect:** the *Linked campaigns* card shows `DEMO-KC26-P010-XM` with *Campaign work done on this job?*
   **Done / Not done**, and the amber note *Answer before the job is marked ready*. The card shows even though this
   adviser may not have `warranty:read`.
3. Send the job for quality check and record a passed QC (as on any job). Open *Next action*.
   **Expect:** *Mark vehicle ready* is disabled, with the message *Record whether the campaign work was done for
   DEMO-KC26-P010-XM … before marking the vehicle ready*.
4. Optional API check (Swagger, `PUT /service/job-cards/{id}` with `{"status":"READY"}`). **Expect:** `409` with
   `code: "CAMPAIGN_ATTENDANCE_REQUIRED"` and the campaign in `details`.

### C2. Not done (with a reason) returns the vehicle to outstanding

1. Click **Not done**. **Expect:** a *Reason* list (Parts not available, Customer declined, Done elsewhere, Not
   applicable to this vehicle, No time on this visit, Other) and a note field. *Save* stays disabled until a reason is
   chosen; with *Other* it also needs a note.
2. Choose *Customer declined*, note `Customer in a hurry`, **Save**. **Expect:** *Not done: Customer declined:
   Customer in a hurry · recorded by … on …*.
3. Mark the vehicle ready. **Expect:** it succeeds.
4. Open the bulletin. **Expect:** `KNAKU81DMC5000406` is back to **Pending** (it was *Scheduled*), so the next job card
   flags the bulletin again.

### C3. Done completes the vehicle

1. Open a new job card for `LSR-401FP` (acknowledge the FPC banner). Approve its estimate, start work, pass QC.
2. Under *Linked campaigns*, click **Done** on each linked bulletin (two if you did Part A: `DEMO-KC26-P010-XM` and
   `SORENTO XM11-15`). **Expect:** *Done · recorded by …*.
3. Mark the vehicle ready. **Expect:** the bulletin shows `KNAKU81DMC5000401` as **Completed** with this job card.
4. Change the answer to *Not done* (any reason) while the job is *Ready*. **Expect:** the vehicle goes back to
   *Pending*. Set it back to *Done*: it is *Completed* again.

### C4. Printed job card

1. On any job card linked to the bulletin, click **Print** (browser print preview).
2. **Expect:** an **FPC / CAMPAIGN** box: `DEMO-KC26-P010-XM   130005-SORENTO (XM) - check fuel pump plate cover   Done: ____`.
   The on-screen *Linked campaigns* card does not print.
3. Edit the bulletin, untick *print on the job card*, save, print again. **Expect:** no FPC box.
   Tick it again afterwards.

---

## Part D: F1 FPC vehicles report

Log in as the **warranty officer**. Open **Reports**. **Expect:** a **Service · FPC** section with *FPC vehicles* and
*FPC analysis*. Open **FPC vehicles**. Set *Branch* to *All branches* and run the report.

The numbers below are for a fresh demo seed (before Parts A–C added or changed vehicles). If you did Parts B and C,
see the note after the table.

### D1. The five lists

**Expect** the tiles: *To be called 4 · Called, not visited 1 · Visited, not attended 2 · Attended 2 · Attended, not
called 1*. Click each *Show* choice and run:

| Show | Rows (registration) | Notes |
|---|---|---|
| To be called | LSR-401FP, ABJ-402FP, APP-403FP, APP-406FP | |
| Called, not visited | ABJ-402FP | the letter |
| Visited, not attended | APP-403FP (JC-FPC-1), APP-406FP (JC-FPC-4) | job no, job date, bill date; reason *Parts not available: Plate cover on back order* and *Not answered* |
| Attended | LSR-404FP (JC-FPC-2), ABJ-405FP (JC-FPC-3) | |
| Attended, not called | ABJ-405FP | 404 was phoned before its visit |

After Parts B and C: 407 joins *To be called*; 406's reason becomes *Customer declined: Customer in a hurry*; 401 leaves
*To be called* and joins *Attended* and *Attended, not called* (it was never called).

### D2. Filters, order and scope

1. *In the order of*: try Registration and VIN. **Expect:** rows re-sort; VINs not registered come last.
2. Untick *All* on *FPC bulletin*. **Expect:** only FPC bulletins are offered. Set *Campaign type* to *All campaign
   types*: the demo recall and free fix are offered too.
3. Log in as **service adviser, Main**. Run *To be called*. **Expect:** no *Branch* choice; Abuja customers'
   vehicles (ABJ-…) are not listed.

### D3. Print as list, letters and labels

1. Tick **Letters** and **Labels** as well as *Print list*, run, then **Print**.
2. **Expect** in the print preview: the list on A4 portrait with the company header; then one letter page per
   registered vehicle (customer name and address, the bulletin subject and measures, the branch phone); then an
   A4 sheet of address labels (3 across).
3. Untick all three and run. **Expect:** *Tick at least one of Print list, Letters or Labels.*

### D4. Letter template

1. Click **Letter template** (strip above the table). **Expect:** placeholder chips, the template, and a live preview
   filled from a row of the report.
2. Add `{{branchEmail}}` via its chip, **Save template**, print letters again. **Expect:** the e-mail appears.
3. Type `{{phone}}` and save. **Expect:** *Unknown placeholder: {{phone}}*.
4. **Reset to default**. **Expect:** the default text comes back.

### D5. Record as called

1. Show *To be called*, tick **Record as called when printing** (a hint explains it), tick *Letters*, run.
2. Click **Print & record**. **Expect:** a dialog with the count (*Letter sent: N*, *On the call list (phone): M*).
3. Click **Record & print**. **Expect:** a toast *Recorded … vehicle(s) as called*, then the print dialog.
4. Run *Called, not visited*. **Expect:** those vehicles are now listed. On the bulletin page their *Last contact*
   reads *Letter / list sent*, and the status is unchanged (*Pending*).
5. Without the tick, **Print** records nothing.

### D6. Excel

Click **Export Excel** on any list. **Expect:** the same rows and columns as on screen.

---

## Part E: F2 FPC analysis

Open **FPC analysis** as the warranty officer, *Branch*: All branches. The numbers are for a fresh demo seed. Set *Bill date* from 14 days ago to today,
*FPC bulletin date*: All, *In the order of*: Bulletin date. Run.

**Expect** for `DEMO-KC26-P010-XM` on a fresh demo seed:

| Affected | Called | Visited | Attended | Not attended | Reasons | Att. % visited | Att. % affected | Outstanding |
|---|---|---|---|---|---|---|---|---|
| 6 | 2 | 3 | 2 | 1 | Parts not available 1 | 67% | 33% | 4 |

1. Check **visited = attended + not attended** (3 = 2 + 1), and that it matches F1 (*Attended* 2 rows; the
   *Visited, not attended* row billed in the period is JC-FPC-1; JC-FPC-4 is not billed).
2. *In the order of*: **Model**. **Expect:** a *Sorento* group with the bulletin under it, a *Total Sorento* row and a
   *Grand total*.
3. Set *Bill date* to last year. **Expect:** visited, attended and not attended are 0; affected, called and
   outstanding stay (they are to date).
4. Untick *All* on *FPC bulletin date* and pick a range without the bulletin date. **Expect:** no bulletins.
5. Print (A4 landscape) and **Export Excel**. **Expect:** the same rows and totals.

---

## Part F: Permissions

| Check | Login | Expect |
|---|---|---|
| F1 visible, F2 hidden | service adviser | *FPC vehicles* in Reports; *FPC analysis* not listed; opening `/reports/fpc-analysis` is refused |
| Both reports | warranty officer, workshop manager | both listed |
| Letter template | service adviser | no *Letter template* button (needs `report:settings`) |
| Record as called | a role without `campaign:vehicle:update` | the tick has no effect; Print only prints |
| Bulletin form | service adviser | can view bulletins, cannot create or edit (`campaign:create` / `campaign:update`) |

---

## Part G: Automated checks (optional)

From `server/`:

```bash
npx jest src/modules/campaign src/modules/reports          # unit tests (FPC rules, selections, analysis); slow with the repo's ts-jest
docker exec dana-reports-pg createdb -U postgres dana_fpc_it
DATABASE_URL=postgresql://postgres:reports@localhost:55432/dana_fpc_it npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://postgres:reports@localhost:55432/dana_fpc_it npx jest src/modules/campaign/fpc.integration.test.ts
```

The integration test builds an FPC bulletin with a range of three VINs (two registered, one registered later), one
letter, and two job cards (one attended, one not), then checks the linking, the READY guard, the statuses, F1's five
lists and F2.

## Troubleshooting

- **The demo seed refuses the database:** its name must contain `demo`, or pass `--allow-database=<name>`.
- **`migrate deploy` fails on an enum value:** run it again; every step is idempotent.
- **A report shows *You do not have access*:** log out and in again after the migration, so the token has the new
  `report:fpc-*` permissions.
