# Service MIS reports (#97): manual testing guide

Step-by-step checks for the 15 MIS reports, the master fields they use and the engineer on the job card. Expected
figures come from the MIS demo data (`prisma/seed/demo/mis.ts`, described in `doc/demo-data.md`). All its dates are
relative to the day the seed ran, so periods below are given as "the last N days".

## 1. Set up a local database

Never run this against the shared dev database in `server/.env`. Use a local Postgres (for example the
`dana-reports-pg` Docker container on port 55432).

```bash
cd server
export DATABASE_URL="postgresql://postgres:<password>@localhost:55432/dana_demo_mis"   # a database name containing "demo"
npx prisma migrate deploy            # applies 20261103100000_mis_reports
npx prisma migrate deploy            # run it twice: the second run applies nothing
npm run prisma:seed                  # base data (branches, roles, staff incl. engineer1–3, masters), if the database is new
npm run prisma:seed:staff            # on an existing database: syncs role permissions and adds the engineers
npm run prisma:seed:demo -- --second-branch="Abuja Branch"   # use your second branch's name
npm run prisma:seed:demo -- --second-branch="Abuja Branch"   # again: prints the same job numbers, adds nothing
```

The demo seed prints `MIS-01 … MIS-08 … job card DM-MIS-01 …`. Start the server (`npm run dev`) and the client
(`cd client && npm run dev`) with the same `DATABASE_URL`, and sign in as the seeded SuperAdmin (accounts in
`prisma/seed/staff.ts`).

**Checks after the migration** (optional, with `psql`):

```sql
SELECT code, category FROM "WorkshopMaster" WHERE kind = 'SERVICE_TYPE' ORDER BY code;   -- 1F FREE, RG PAID, RR RUNNING_REPAIR, AC ACCIDENTAL, PD PDI, RW OTHER …
SELECT code, description, attributes FROM "WorkshopMaster" WHERE kind = 'VEHICLE_GROUP';  -- BODY has {"bodyRepair": true}
SELECT count(*) FROM "MileageBand";                                                      -- 8
```

## 2. Masters and the job card

| # | Step | Expected |
|---|---|---|
| 2.1 | Settings → Workshop Masters → **Service**. | A **MIS category** column. Open *1F*: the *MIS category* select shows *Free service*. Change it to *Paid service*, save, and change it back. |
| 2.2 | Same screen, **Vehicle group** → *BODY REPAIR*. | A ticked **Body repair group (MIS body figures)** box. |
| 2.3 | **Complaint** → *DM-EN01*. | *Major defect* ticked. *DM-BR02* is not. |
| 2.4 | Labour catalogue: add an item with **Service group** *MAINTENANCE*. | Saved. In the database its `serviceGroupId` is the MAINTENANCE group. |
| 2.5 | Service charge per model (1F, model Rio). | *Due at* shows `1,000 km / 30 days`; 2F `5,000 km / 90 days`. |
| 2.6 | Open a job card: pick an engineer in **Engineer (optional)**. | Saved; the job shows the engineer. |
| 2.7 | Open an unbilled job card, change **Engineer (optional)** in the edit form, save. | "Job card updated"; the new engineer is shown. A billed job does not offer the field. |
| 2.8 | Customer form: set an anniversary date, save. | In the database `anniversaryDate` and `anniversaryOn` hold the same date. |
| 2.9 | Change a vehicle's owner (vehicle → ownership). | The new ownership row has `createdById` = you; it shows in S12 as *Recorded by*. |

## 3. Reports hub

Reports → the **Service MIS** section with four headings (Revenue and job summaries; Workshop and parts; Customers
and vehicles; Management) and 15 cards. Type *birthday* in **Find a report**: only that card stays.

In each report below, set the period, select **Run report**, then check the summary cards, the table, **Print**
(80-column reports print portrait, 132-column landscape) and **Export Excel** (same rows and totals).

The MIS demo jobs are the only ones with an engineer. Where a step says **engineers: Bola Adewale + Chika Obi**, pick
both in the *Engineer* filter to see only them. Main branch MIS jobs, rates and values:

| Job | Engineer | Service | Labour | Spares | Oil | Service charge | Notes |
|---|---|---|---|---|---|---|---|
| DM-MIS-01 | Bola | 1F free | 14,250 | 6,200 (FOC) | 27,500 (FOC) | – | no bill |
| DM-MIS-02 | Bola | RG paid | 20,500 − 10% = 18,450 | 6,200 | 27,500 | 15,100 | delivered late |
| DM-MIS-03 | Chika | RR running | 35,000 (15,000 body) | 24,000 (2 pads − 1 returned) | – | – | major + free-text complaint |
| DM-MIS-04 | Chika | AC accidental | 45,000 (all body) | 140,500 (incl. 12,500 accessory) | – | – | |
| DM-MIS-05 | Chika | RR running | 10,000 | 21,000 (warranty) | – | – | repeat of MIS-03 |
| DM-MIS-06 | Bola | PD PDI | 10,000 | – | – | – | stock vehicle |
| DM-MIS-08 | Bola | RG paid | 6,250 | – | – | – | still open |

## 4. Report checks

### S2. Business product mix
1. Period: the last 60 days. Engineers: Bola + Chika. Job type **Both**. Run.
2. Expected: **6 vehicles**; Labour (net) **₦132,700**; Spares **₦197,900**; Oil **₦55,000**; Service charge **₦15,100**.
   Groups: Free services (1), Paid service (1), Running repair (2), Accidental (1), PDI (1).
3. In each category the % columns add up to 100; the category subtotals' % add up to 100. Per vehicle = amount ÷
   vehicles (e.g. Running repair labour 45,000 ÷ 2 = 22,500).
4. Job type **Regular** → 5 vehicles; **PDI** → 1.
5. Group by **Model (with mileage bands)** → same totals, plus one column per mileage band.
6. Clear the engineers and note the totals; S1 and S3 below must agree with them for the same full months.

### S1. Monthly information report
1. From month = two months ago, to month = this month; Annexure ticked. Run.
2. One column per month plus **Total**. Vehicles, A) Labour (1–4, gross, less discount, net, PDI, total), B) Spares,
   C) Oil, D) Service charge. *Body repair labour* is a memo line in italics.
3. Under each category the annexure lists its service types; they add up to the category.
4. Run S2 with no engineers for the same full months (1st of the first month to today): S1 *Total vehicles* = S2
   vehicles and S1 *Total labour* = S2 labour.
5. From day 1 to day 15: only jobs delivered on days 1–15 of each month remain. Tick **All months of the previous
   year**: the month boxes hide and 12 columns appear. From day 20 / to day 10 is refused before running.

### S3. Analysis of jobs
1. Same period as S2, **Model-wise**. Expected: a column only for service types with jobs; *Number of jobs* grid, then
   *Share of the row total (%)* with cells tinted by size. Total column = S2 vehicles; Repeat = 1 (DM-MIS-05) when the
   period covers it.
2. **Variant-wise**: rows become model · variant.

### S4. Group-wise productivity
1. As on: today. Service group: *BODY REPAIR*. Run.
2. Expected YTD: **2 lines, 2 jobs, ₦60,000** (DM-MIS-03 15,000 + DM-MIS-04 45,000), share 100%.
3. Clear the filter: MAINTENANCE and BODY REPAIR rows; shares add up to 100. DM-MIS-08 (open) counts on its job date.

### S5. Engineer performance
1. Period: the last 60 days (bill date). Engineers: Bola + Chika. Job type **Regular**. Run.
2. Expected: **5 jobs**, total **₦390,700**. Cards: *Bola Adewale* 2 jobs, ₦115,200, ₦57,600 per job, late 1 (50%);
   *Chika Obi* 3 jobs, ₦275,500, repeat 1 (33.3%).
3. DM-MIS-02 row is tinted red with "· late"; DM-MIS-05 shows the *Repeat* badge.
4. **Only summary**: rows hide, subtotals stay. Job type **Both** → 6 jobs (adds the PDI).

### S6. Engineer-wise part consumption
1. Period: the last 60 days (issue date). Engineers: Bola + Chika. Parts **Both**, Show **Detail + summary**. Run.
2. Expected total **₦252,900**: Non-warranty ₦198,200, Warranty ₦21,000, FOC ₦33,700; spares ₦197,900, oil ₦55,000.
   The brake pad line of DM-MIS-03 shows issued 2, returned 1, amount 24,000.
3. Parts **Oil** → ₦55,000. Show **Summary only** → one subtotal per engineer.

### S7. Requisition return register
1. Period: the last 60 days. Run (based on *Requisition return*).
2. Expected: **1 line**, return **DM-RT-MIS-03**, requisition DM-RQ-MIS-03, part 58101-DM100, returned 1, ₦24,000,
   reason *Second set not needed*, **Billed**.
3. Requisition type **Warranty** only → no lines. Billed **Unbilled** → no lines. Part number `58101-DM100` → 1 line.
   Based on **Job** → the group heading becomes the job.

### S8. List of major problems
1. Period: the last 60 days (job date). Engineers: Bola + Chika. **All defects**, **Defect-wise**. Run.
2. Expected groups: *DM-EN01 · ENGINE KNOCKING NOISE — MAINTENANCE* (1 job, row tinted red, *Major*),
   *DM-BR02 · BRAKE SQUEAL — MAINTENANCE* (1 job) and **Uncoded (free text)** with "Squeaky rear door".
3. **Major defects** → only DM-EN01. **Job-wise** → one group per job with a *Defect* column. From code `DM-BR02` to
   `DM-BR02` → only that code (uncoded left out).

### S9. List of new customers
Period: the last 60 days. Expected among the rows: **Ngozi Eze** (Rio, first job DM-MIS-01) and **Tunde Bakare**
(Sportage, first job DM-MIS-02), grouped by model with a count. A customer whose first job is older is not listed.

### S10. List of regular customers
1. Visits from: 60 days ago. Mileage difference 0, minimum visits 2. Run.
2. Expected among the rows: LSR-501MS, LSR-502MS and LSR-503MS with 2 visits each (other demo vehicles with two
   visits are listed too).
3. Mileage difference **500** → LSR-502MS drops out (1,800 → 1,950 km is a comeback); LSR-501MS and LSR-503MS stay.
4. From registration `LSR-501MS` to `LSR-501MS` → only that vehicle. Print address adds address and phone.

### S11. Birthday / anniversary
1. Run with the defaults (this month, Both, Date-wise). Expected: **Ngozi Eze** birthday on the 15th and anniversary on
   the 20th of this month.
2. From **01 Dec** to **31 Jan**: **Tunde Bakare** birthday 24 Dec listed before his anniversary 05 Jan.
3. **Name-wise** orders by customer. The cards *No birthday recorded* / *No anniversary recorded* show how complete the
   dates are. 31 Feb is refused.

### S12. Vehicle resale history
Period: the last 60 days. Expected: **LSR-503MS** Sportage, previous owner *Tunde Bakare* → new owner *Halima Sule*,
resale date 10 days ago, recorded by the main branch admin. Vehicle `LSR-503MS` → the same row; `ZZZ` → none.

### S13. Vehicles that skipped free service
1. Sold: from 90 days ago to today. **Detail only**. Run.
2. Expected: **LSR-502MS** Rio, *1F · FIRST SERVICE*, *Days passed*, due by (sale + 30 days) / 1,000 km, last visit
   DM-MIS-05. **LSR-501MS is not listed** (its 1F was done).
3. **Summary only**: Rio — vehicles sold 2, 1F skipped 1 (50%).
4. Service skipped filter: tick only *SECOND SERVICE* → no rows yet (2F is due within 90 days).

### S14. Vehicle list by model and variant
1. Sold: the last 90 days. Expected: LSR-501MS and LSR-502MS under *Rio · Rio automatic petrol* (subtotal 2).
2. **Include stock vehicles** → the Sorento `KNAPM81DMT7000504` appears with a *Stock* badge. Order **Sale date** →
   one list without groups.

### S15. Management information report
1. Period: the last 60 days, your branch. Run. Expected sections A (workshop), B, C, D, E, F/G, Purchases, Outstanding.
2. A1 *Labour billed (net)* = S2 labour for the same period with no filters; A2 *Vehicles — total* = S2 vehicles;
   A4 repeat jobs and A5 late deliveries match S5's counts; A6 reads *Not recorded*.
3. E *Workshop bills* + *Counter sale bills* = *Total billing*. Outstanding shows eight bands (up to 30 days … over
   240) and *Outstanding as % of billing*.
4. As an admin: **Branch → All branches** → one column per branch plus **Total**; DM-MIS-07 appears in the second
   branch's column.
5. Tick **Stock based on dealer rate** / **Profitability based on dealer rate** → C and D change to dealer-rate values.

## 5. Permissions

| Sign in as | Expected on the hub |
|---|---|
| ServiceAdviser | S9–S14 only. Opening `/reports/mis-monthly` shows "You do not have access to this report". |
| StoreOfficer or GeneralStoreManager | S6 and S7. |
| WorkshopManager or ServiceManager | All but S15. |
| Admin / SuperAdmin | All 15. |

A role without `stock:read` running S15 sees no sections C and D and a note saying why; without
`report:party-outstanding-age`, no Outstanding section. A non-admin without `inventory:cross-branch` or `branch:all`
cannot choose All branches.

## 6. API

Swagger (`/api/docs`, tag *Reports*) lists the 15 `GET /api/reports/<slug>` endpoints with parameters and example
responses. Quick checks with a token:

- `GET /api/reports/mis-monthly?fromMonth=2026-01&toMonth=2027-02` → 400 (more than 12 months).
- `GET /api/reports/business-product-mix?from=2026-09-01&to=2026-09-30&unknown=1` → 400 (unknown parameter).
- `GET /api/reports/lookups/engineer` → the Engineer users of your branch.

## 7. Automated tests

```bash
cd server
npx jest src/modules/reports/mis/mis.logic.test.ts                                  # 29 unit tests
TEST_DATABASE_URL=<local test database> npx jest src/modules/reports/mis/mis.integration.test.ts   # S1–S15 on a database (rolls back)
```
