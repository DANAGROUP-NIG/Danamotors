# Post-service follow-up (PSF): manual testing guide

Step-by-step checks for the post-service follow-up module (#111; rules in `doc/psf.md`, reports in `doc/reports.md`,
*Service · Follow-up (PSF)*). Use a **local** database only. Never run migrations or seeds against the shared dev
database in `server/.env`.

The demo jobs are delivered at **fixed dates in February 2026** and their calls are at fixed times, so every figure
below is exact whenever you seed. Times are Lagos time. The figures assume no other delivered jobs in February 2026
at Main Branch; a fresh demo database has none.

## 0. Set up

1. Start Docker Desktop, then the local Postgres container `dana-pdi-pg` (port 55432). A ready database is
   **`dana_demo_psf`**: a copy of the late-deliveries demo database with this feature's migration and demo applied.
2. In `server/`, for these commands only (user and password from the container's `POSTGRES_USER` / `POSTGRES_PASSWORD`):
   ```bash
   export DATABASE_URL="postgresql://<user>:<password>@localhost:55432/dana_demo_psf"
   npx prisma migrate deploy        # applies 20261123100000_psf
   npx ts-node prisma/seed/seed.ts  # base data (skip if the database already has it)
   npm run prisma:seed:demo -- --psf-only --second-branch="Abuja Branch"
   ```
   The last command prints:
   ```
   Post-service follow-up (Lagos times):
     PSF-1 LSL-901PF DM-PSF-1: delivered 2026-02-02 10:00, not followed up
     PSF-2 LSL-902PF DM-PSF-2: delivered 2026-02-03 11:00, not available → satisfied
     PSF-3 LSL-903PF DM-PSF-3: delivered 2026-02-04 15:00, dissatisfied
     PSF-4 LSL-904PF DM-PSF-4: delivered 2026-02-05 12:00, dissatisfied → closed
     PSF-5 LSL-905PF DM-PSF-5: delivered 2026-02-06 16:00, no phone
     PSF-6 LSL-906PF DM-PSF-6: delivered 2026-02-09 12:00, not followed up
     PSF-7 LSL-901PF DM-PSF-7: delivered 2026-02-10 17:00, not available
     PSF-8 LSL-902PF DM-PSF-8: not delivered
     PSF-9 ABJ-909PF DM-PSF-9: delivered 2026-02-03 13:00, satisfied
     PSF-10 LSL-902PF DM-PSF-10: delivered 2026-02-12 10:00, satisfied
     PSF-11 LSL-911PF DM-PSF-11: delivered 2026-02-13 11:00, not followed up
   ```
   Run it again: the same list, nothing duplicated.
3. Start the API (`npm run dev` in `server/`, same `DATABASE_URL`) and the client (`npm run dev` in `client/`).
4. Users (local seed passwords):
   - `admin.lagos@danamotors.com`: Admin, Main Branch, **own branch only**, every PSF permission. Use it for most steps.
   - `ccuofficer1@kiamotors.com`: CCU officer (calls, letters, dissatisfied and history reports only).
   - `wm.lagos@kiaamotors.com`: Workshop manager (read and reports, no calls).
   - `servicemanager@kiamotors.com`: Service manager (everything, every branch).

### The demo data

| Job | Vehicle | Customer | Service, labour | Delivered | Follow-up (calls) |
|---|---|---|---|---|---|
| DM-PSF-1 | LSL-901PF Rio | DEMO-C61 Ifeoma Nwosu | RR; AC regas, car wash | 02 Feb 10:00 | none |
| DM-PSF-2 | LSL-902PF Sportage | C61 | RR; engine overhaul (major), AC regas | 03 Feb 11:00 | 04 Feb not available → 05 Feb satisfied |
| DM-PSF-3 | LSL-903PF Sorento | DEMO-C63 Halima Sani | RR; AC regas | 04 Feb 15:00 | 05 Feb dissatisfied (AC line) |
| DM-PSF-4 | LSL-904PF Rio | C61 | RG | 05 Feb 12:00 | 06 Feb dissatisfied → 09 Feb closed |
| DM-PSF-5 | LSL-905PF Sportage | DEMO-C62 Tunde Bakare (no phone) | RR; AC regas | 06 Feb 16:00 | 07 Feb no phone |
| DM-PSF-6 | LSL-906PF Sorento | C61 | AC (accidental) | 09 Feb 12:00 | none |
| DM-PSF-7 | LSL-901PF Rio | C61 | RR; engine overhaul (major) | 10 Feb 17:00 | 11 Feb not available |
| DM-PSF-8 | LSL-902PF Sportage | C61 | RR | not delivered | — |
| DM-PSF-9 | ABJ-909PF Sorento (Abuja) | DEMO-C64 | RR | 03 Feb 13:00 | 04 Feb satisfied |
| DM-PSF-10 | LSL-902PF Sportage | C61 | RG; AC regas | 12 Feb 10:00 | 13 Feb satisfied |
| DM-PSF-11 | LSL-911PF Rio | DEMO-C65 Grace Udo (no phone, no address) | RR | 13 Feb 11:00 | none |

Car wash (`DM-PSF-WASH`) is not marked for follow-up analysis, so it never appears as a line.

## 1. Navigation and access

1. Sign in as Admin. **Workshop → Post-service Follow-up** shows: Follow-up Entry, Follow-up List, Dissatisfied
   Customers, Follow-up Letters, Mailing List.
2. **Reports** hub: a *Service · Follow-up (PSF)* group with eight reports (calls and lists, analysis, letters and mailing).
3. Sign in as the workshop manager: the entry screen opens, but the call form says **View only**; *Follow-up Letters*
   and *Mailing List* are not in the menu.
4. Sign in as the CCU officer: entry works; the *Analysis*, *model-wise* and *closed* reports are not offered.
5. Open `/psf` as a user without `psf:read` (e.g. a technician): you are redirected away.

## 2. Follow-up status entry: worklist

As Admin, open **Follow-up Entry**. Set *Delivered from* **01 Feb 2026** to **28 Feb 2026**.

1. The strip reads **Delivered 9 · To call 5 · Satisfied 2 · Dissatisfied (open) 1 · Satisfaction 66.67%**.
   DM-PSF-8 (not delivered) and DM-PSF-9 (Abuja) are not counted.
2. Tabs: **To call 5** (DM-PSF-11, 7, 6, 5, 1, newest first), **Dissatisfied 1** (DM-PSF-3), **Satisfied 2**
   (DM-PSF-10, 2), **Closed 1** (DM-PSF-4), **All 9**.
3. Type `nwosu` in the filter box: only C61's jobs remain. Type `lsl 901`: DM-PSF-7 and DM-PSF-1.
4. **Job no.** box: type `LSL-902PF` and *Open*: DM-PSF-10 opens (the vehicle's latest delivered job).
   Type `DM-PSF-8`: an amber banner says the job has not been delivered yet. Type `XYZ-000`: *No job or vehicle matches*.

## 3. Record calls

The calls below change the figures. To check the reports against the starting figures, run section 4 first (or
re-seed into a fresh copy of the database afterwards); 4.9 gives the figures after these calls.

### 3.1 Not available, then satisfied with a booking (DM-PSF-1)

1. Open **DM-PSF-1**. Header: Rio, LSL-901PF, *Not followed up*. Facts: delivered 02 Feb 2026, follow-up date —,
   service RR, mileage, advisor.
2. Customer card: Ifeoma Nwosu, two phones (Mobile, Mobile 2) as tap-to-call links with a copy button,
   *Prefers to be called: Monday · Morning (9–12) · Phone*, address 14 Allen Avenue, Ikeja, Lagos.
3. Lines: **RR** (Service) and **DM-PSF-AC** AC regas. The car wash is not listed.
4. Press **4** on the keyboard: *Not available* is selected, the remark fills *Customer not available*, the lines say
   *Takes “Not available”*, and *Book the next visit* is disabled. Click **Save call**.
5. A toast confirms. The job leaves the *To call* tab only after a successful contact, so it is still there with
   *Not available · 1 call*. The history shows attempt 1.
6. Open DM-PSF-1 again. Press **1**: every line is *Satisfied*, remark *Customer satisfied*. Tick **Book the next
   visit**, pick tomorrow 10:00 and a service, notes `Check AC`. **Save call**.
7. The toast names the new booking number. History: attempt 2 *Customer satisfied* with *Booked for …*, attempt 1
   *Customer not available*. The status badge is *Customer satisfied*; *To call* is now 4 and *Satisfied* 3.
8. **Appointments**: the booking is there for LSL-901PF, source PSF, request *Booked on the post-service follow-up
   of job DM-PSF-1*.

### 3.2 Dissatisfied with one line (DM-PSF-7)

1. Open **DM-PSF-7** (lines RR and DM-PSF-ENG *Major*). Press **1**, then mark **DM-PSF-ENG** *Dissatisfied*: the
   row turns red and the call switches to **Customer dissatisfied** by itself, and the remark is cleared.
2. Click **Save call** with an empty remark: *Say what the customer is dissatisfied with.* Pick the quick remark
   *Problem not fixed*, save.
3. *Dissatisfied* tab: 2 (DM-PSF-7 and DM-PSF-3). History shows the red *DM-PSF-ENG Engine overhaul* chip.

### 3.3 Close a follow-up (DM-PSF-3)

1. Open **DM-PSF-3**, press **5**: the remark is empty; saving without one gives *Give the reason for closing the
   follow-up.* Choose *Issue resolved by the service manager*, save.
2. The page shows **Follow-up closed** by you with the remark, and no call form. *Closed* tab: 2.
3. API check (optional): `POST /api/psf/jobs/<DM-PSF-3 id>/calls` with `{"status":"SATISFIED","lines":[]}` → **409**
   `PSF_CLOSED`.

### 3.4 Update the customer profile while on the call (DM-PSF-5)

1. Open **DM-PSF-5**: the customer card says *No phone on record*.
2. Click **Update customer profile**, add a phone number, save. The dialog closes and the number appears on the card
   straight away as a tap-to-call link.
3. Record **2** (dissatisfied) on this job **without a remark**, then try to save: refused. Cancel with **Clear**.

### 3.5 Unsaved changes and next

1. Pick an outcome on any job, then click another job in the list: the browser asks to leave without saving.
2. **Save & next** saves and opens the next job in the list.

### 3.6 Branch and job checks

1. As the service manager (every branch), type `DM-PSF-9` in **Job no.**: it opens. Copy the page URL (`/psf?job=…`).
2. Sign in as Admin (Main Branch only) and paste the URL: *You can only open jobs of your own branch* (403). Typing
   `DM-PSF-9` in **Job no.** gives the same refusal.

## 4. Reports

Run each report for **01 Feb 2026 – 28 Feb 2026**. The figures below are the seeded starting figures (before the
calls of section 3); after them, see 4.9.

### 4.1 Post-service follow-up list (`/reports/psf-followup-list`)

| Options | Jobs |
|---|---|
| Defaults (100%, include accidental ticked, include not contacted) | 9: DM-PSF-1…7, 10, 11 |
| Untick *Include accidental vehicles* | 8 (DM-PSF-6 left out) |
| *Major labour* | 2: DM-PSF-2, DM-PSF-7, labour column shows only DM-PSF-ENG (amber) |
| *Only labour marked for follow-up analysis* | 6: DM-PSF-1, 2, 3, 5, 7, 10 |
| Accidental unticked, not contacted *Only* | 4: DM-PSF-1, 5, 7, 11 |
| Accidental unticked, not contacted *Not include* | 4: DM-PSF-2, 3, 4, 10 |

- *With address* adds the address column. Rows not followed up are tinted amber. The **Call** link opens the job on
  the entry screen.
- Print preview: 132-column layout without the Call column. **Excel**: the same rows and phones.

### 4.2 Customer follow-up analysis (`/reports/psf-analysis`)

Cards: Delivered **9**, Followed up **6** (66.67% of delivered), Reached **3**, Satisfaction **66.67%**,
Dissatisfied **1**, Not contacted **5**.

| Code | Status | Jobs | % of delivered | % of followed up |
|---|---|---|---|---|
| 1 | Customer satisfied | 2 | 22.22% | 33.33% |
| 2 | Customer dissatisfied | 1 | 11.11% | 16.67% |
| 3 | No phone | 1 | 11.11% | 16.67% |
| 4 | Customer not available | 1 | 11.11% | 16.67% |
| 5 | Follow-up closed | 1 | 11.11% | 16.67% |
| | Not followed up | 3 | 33.33% | — |
| | **Jobs delivered** | **9** | 100% | |

*Labour / service-wise satisfaction* section (last call's lines):

| Code | Type | Followed up | Satisfied | Dissatisfied | No phone | Not available | Closed | Satisfaction % |
|---|---|---|---|---|---|---|---|---|
| RG | Service | 2 | 1 | 0 | 0 | 0 | 1 | 100% |
| RR | Service | 4 | 2 | 0 | 1 | 1 | 0 | 100% |
| DM-PSF-AC | Labour | 4 | 2 | 1 | 1 | 0 | 0 | 66.67% |
| DM-PSF-ENG | Labour | 2 | 1 | 0 | 0 | 1 | 0 | 100% |
| Total | | 12 | 6 | 1 | 2 | 2 | 1 | 85.71% |

Untick *Print labour-wise satisfaction*: the section disappears. The section is also in print and as an Excel sheet.

### 4.3 Model-wise (`/reports/psf-analysis-model`)

| Model | Delivered | Followed up | Satisf. | Dissatisf. | No phone | Not avail. | Closed | Not followed | Satisf. % |
|---|---|---|---|---|---|---|---|---|---|
| Rio | 4 | 2 | 0 | 0 | 0 | 1 | 1 | 2 | 0% |
| Sorento | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0% |
| Sportage | 3 | 3 | 2 | 0 | 1 | 0 | 0 | 0 | 100% |

Totals equal 4.2 (9 delivered, 6 followed up, 66.67%). *From model* Sorento, *To model* Sportage: Rio drops out
and the subtitle reads *Models Sorento to Sportage*.

### 4.4 Dissatisfied customers (`/reports/psf-dissatisfied`)

One row, **DM-PSF-3** (Halima Sani, LSL-903PF): *Dissatisfied with* **DM-PSF-AC** AC regas and leak test, remark
*AC still blowing warm air after the regas*. DM-PSF-4 is not here: its follow-up was closed. Model filter *Rio*: empty.

### 4.5 Follow-up closed (`/reports/psf-closed`)

One row, **DM-PSF-4**: before closing *Dissatisfied*, closing remark *Service manager apologised; free valet at the
next visit*, closed by the main-branch demo advisor on 09 Feb 2026.

### 4.6 Vehicle follow-up history (`/reports/psf-history`)

- Run without a registration: *Enter the registration number of the vehicle.*
- `LSL-901PF`: 2 rows: DM-PSF-1 *Not followed up* (amber) and DM-PSF-7 call #1 *Customer not available*. Cards:
  Jobs 2, Calls 1.
- `lsl 902pf` (spaces and case ignored): 3 rows: DM-PSF-2 #1 *Not available*, DM-PSF-2 #2 *Satisfied*, DM-PSF-10 #1
  *Satisfied*. DM-PSF-8 (not delivered) is left out. *With labour details* shows each line's status; untick it to hide
  the column.

### 4.7 Customer follow-up letter (`/reports/psf-letter`)

All three groups ticked: 3 customers. Cards: Customers **3**, Letters to print **2**, No address **1**.

| Customer | Reason | Latest job | Jobs |
|---|---|---|---|
| Grace Udo | Customer has no phone; Customer not followed up | DM-PSF-11 | 1 (amber: no address, no letter) |
| Ifeoma Nwosu | Customer not available; Customer not followed up | DM-PSF-7 | 3 |
| Tunde Bakare | Customer has no phone | DM-PSF-5 | 1 |

- Only *Customer not available* ticked: Ifeoma Nwosu only. Untick all three: *Choose at least one group of customers.*
- **Print**: two A4 letters (Ifeoma Nwosu, Tunde Bakare), each with the branch heading, the address and the template
  text filled in (vehicle, delivery date, job). Tick *Print list* to add the list before the letters.
- **Letter template** (needs `report:settings`): placeholders insert at the cursor, the preview fills them in;
  *Save template* changes the printed letters; *Reset to default* restores the default text. An unknown
  `{{placeholder}}` is refused.

### 4.8 Mailing list (`/reports/psf-mailing-list`)

- No period. The list has every Main Branch customer with a street address, including DEMO-C61, C62 and C63, but not
  DEMO-C65 (no address); *Left out: no address* is at least 1.
- *City* **Lekki**: only Tunde Bakare (DEMO-C62).
- *Print as* **Labels**: an A4 sheet of 3 × 8 address labels. **Document**: the list.

### 4.9 After the calls of section 3

| Job | Before | After |
|---|---|---|
| DM-PSF-1 | not followed up | satisfied (2 calls, booking) |
| DM-PSF-7 | not available | dissatisfied (DM-PSF-ENG) |
| DM-PSF-3 | dissatisfied | closed |
| DM-PSF-5 | no phone | no phone (the attempt in 3.4 was cleared) |

Analysis: Delivered 9, Followed up **7**, Satisfied **3**, Dissatisfied **1**, No phone 1, Not available **0**,
Closed **2**, Not followed up **2**, Reached **4**, Satisfaction **75%**. The dissatisfied list shows DM-PSF-7 with
*DM-PSF-ENG Engine overhaul*; the closed list shows DM-PSF-3 and DM-PSF-4; the history of `LSL-901PF` shows DM-PSF-1
with two calls (not available, satisfied with the booking) and DM-PSF-7 with two calls.

## 5. Service MIS

Run **Management information report** for February 2026 (Main Branch). Section A6 shows *PSF — customers contacted*,
*satisfied*, *dissatisfied*, *not reachable* and *PSF satisfaction %* for the jobs in that report (delivered jobs),
instead of the old *not recorded* note.

## 6. API (Swagger)

`/api-docs`: tag **Post-service Follow-up** with five endpoints and examples; the eight `psf-*` reports appear with
the other framework reports.

## 7. Automated checks

- Server unit: `npx jest src/modules/psf src/modules/reports/psf src/modules/reports/mis/mis.logic.test.ts`.
- Server integration (local database only): `TEST_DATABASE_URL=… npx jest src/modules/psf/psf.integration.test.ts`.
- Client: `node --test test/psf-logic.test.mjs`.
