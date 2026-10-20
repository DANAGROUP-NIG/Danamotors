# Issue #79 Frontend Walkthrough

## 1. Before You Start

Use a **disposable local QA database** with migrations applied. Do not run the fixture against production. From `server`, run `npm run prisma:deploy`, `npm run prisma:generate`, then set `MONTHLY_REPORT_QA_CONFIRMED=true` and run `npx ts-node prisma/seed/monthly-reports.ts`. PowerShell: `$env:MONTHLY_REPORT_QA_CONFIRMED='true'`. The fixture creates branch **QA79 QA** and prints IDs. A second invocation leaves an existing fixture untouched. Use a fresh QA database to reset it.

Run `npm run dev` in server and client. Open `http://localhost:3000/login`, then Reports. This work is in the current checkout; no deployment URL or PR has been created. Node shim workaround on this workstation: prepend `C:\Program Files\nodejs` to PATH for this terminal.

Fixture password for the following local test accounts: `Issue79-QA-Only-2026!`. These are synthetic QA users, not production credentials.

| Email | Role |
|---|---|
| qa79-0@example.test | Admin |
| qa79-1@example.test | WorkshopManager |
| qa79-2@example.test | Accountant |
| qa79-3@example.test | BillingOfficer |
| qa79-4@example.test | ServiceAdviser |
| qa79-5@example.test | WarrantyOfficer |
| qa79-6@example.test | No report permissions |
| qa79-7@example.test | Engineer |
| qa79-8@example.test | Technician |

Migrations grant existing roles the report permissions. If role defaults were customized, Admin can check Settings → Roles. Log out/in after changing grants. Corporate maintenance and parts VAT settings require Admin/SuperAdmin. PDI inclusion additionally requires `pdi:read`; add that existing/future permission only to an authorized test role to exercise it. WorkshopManager receives corporate:manage but the shared master writes also require Admin/SuperAdmin.

Leave `JOB_BILL_PARTS_VAT_ENABLED` unset or `false`. In Reports → Parts VAT settings verify **Enable parts VAT** is unticked and all three rates are **7.5**. An environment value `true` overrides the stored flag; remove it before testing OFF.

## 2. Seed / Test Data

Select branch **QA79 QA**. Use **01/10/2026–07/10/2026** for every period report. Search fields use prefix **QA79**.

| Record | Facts |
|---|---|
| QA79-001 / QA79VIN01 | Rio LX, customer QA79 Customer, sold 01/01/2026, warranty 365 days/100,000 km, current mileage 10,000, dealer QA Dealer, fleet QA79-FLEET |
| QA79-J1 / QA79-E1 / QA79-B1 | Booking 01/10 availed same day; delivery 02/10; ACTIVE snapshot; estimate 6 filters × 100, actual 5 issued − 1 returned = 4; labour 200; service charge 100; 10% parts discount; parts VAT OFF; bill 683, stored VAT 22.50, round-off +0.50 |
| QA79-W1 | One warranty oil line on J1, qty 1, rate/amount 50; submitted case QA79-C1 / manufacturer QA79-MAN1; omitted from customer bill |
| QA79-J2 / QA79-B2 | Sportage EX; booked 01/10, opened/delivered 03/10; EXPIRED_DATE; credit bill labour 100 + VAT 7.50 + round-off .50 = 108 |
| QA79-J3 | Rio, opened/delivered 02/10, free service, EXPIRED_MILEAGE, mileage 100,001; walk-in; only invoice is cancelled and excluded |
| QA79-J4 | Rio, opened/delivered 04/10, no snapshot, mileage 10,000; calculated UNDER; walk-in |
| No-show vehicle | Booking 01/10, no job |
| QA79-E2 | Standalone estimate dated 01/10, one filter × 100, no job |
| QA79-CANCELLED | Cancelled job delivered 02/10; excluded |
| QA79-CANCELLED-BILL | Cancelled invoice 999; excluded |
| QA79-PDI | PDI delivered 02/10; excluded by default |

Expected overview: 4 delivered jobs; 3 bookings; grace 0 = 1 availed/2 not availed; grace 2 = 2 availed/1 not availed; 2 walk-ins; active bill total **791**; VAT **30**; unbilled warranty amount **50**; attendance under **2**, beyond **2**; main vehicle history visits **1**; estimate shortage amount **−300** (−200 on E1, −100 on E2).

## 3. Per-Report Test Steps

For each report: open Reports → Monthly → named card, choose the dates above, then **Run report**. Filters change results only after Run. Print uses the browser dialog; inspect company/branch/title, applied filters, page orientation, repeating table headings and readable totals. Excel should open without a file-format warning and contain every visible report section with matching totals. Sort a column on screen; export must retain the same set of rows. Empty-range check: 01/09/2026–01/09/2026 shows no matching records. Return to the October range afterward.

### M1 — Tax register

- Choose Categories and VAT layout, Cash and credit, Bill number, Detail and annexure; Run.
- CASH group: QA79-B1, parts 400, spares 400, discount 40, labour 200, service 100, labour VAT 22.50, total 683. CREDIT group: QA79-B2, labour 100, VAT 7.50, total 108. Grand bill amount 791 and VAT 30.
- Annexure: SPARES rate 0, sale 400, discount 40, taxable 360, VAT 0; LABOUR rate 7.5, sale/taxable 400, discount 0, VAT 30.
- Choose Cash: one bill, total 683/VAT 22.50. Credit: one bill, total 108/VAT 7.50. Change order to Bill date: B1 before B2.
- Include address: QA79 Road address/phone fields appear. Tax ID stays blank because none is recorded.
- Choose Only detail: no annexure section. Only annexure: no CASH/CREDIT detail. Tick bill-type page break: CREDIT starts a new page. Landscape print. XLSX has corresponding detail/annexure sheets.
- [ ] Pass [ ] Fail

### M2 — Booked vs. availed

- Grace 0: bookings 3, availed 1, not availed 2, availed % 33.33, walk-ins 2.
- Grace 2: bookings 3, availed 2, not availed 1, availed % 66.67, walk-ins 2. J2 shows days late **2**; J1 **0**. Rows have booking IDs because legacy booking numbers are not stored.
- Enter −1 or 1.5 grace days: browser/API must reject; no report replaces the last result.
- Single day 01/10 with grace 2 still includes the matching late J2; no walk-ins in that single day.
- Portrait print. Excel sheets correspond to booked/availed, not availed, walk-ins and service-type summary.
- [ ] Pass [ ] Fail

### M3 — Estimate vs. job

- Based on Estimate, Shortage: E1 filter estimated qty 6/amount 600; actual qty 4/amount 400; variation −2/−200. E2 estimated qty 1/100, actual 0/0, variation −1/−100. Grand variation −300.
- Based on Job, Shortage: E2 disappears; variation −200.
- Excess: J1 warranty oil actual qty 1/50, estimated 0/0, variation +1/+50. Matching labour shows no variation and is omitted.
- Landscape print; totals per job and overall agree with Excel.
- [ ] Pass [ ] Fail

### M4 — Unbilled parts

- All charge types, Spares and oil, Detail and summary: one warranty oil row, qty issued 1, returned 0, billed 0, net 1, rate 50, amount 50. Customer filters are absent because their net 4 units were billed.
- Warranty: same row; Non-warranty: no rows; Oil: same row; Spares/accessories: no rows.
- Summary only hides detail and shows J1/WARRANTY line count 1 and amount 50. Detail only hides group summaries. Re-run after each choice.
- Landscape print. Excel preserves the selected sections and total 50.
- [ ] Pass [ ] Fail

### M5 — Corporate bills

- Corporate All for both range endpoints, Cash and credit, Code order: only fleet QA79-FLEET, B1 amount 683/outstanding 683. B2 is excluded because its vehicle is not a member.
- Untick All and select QA79-FLEET as both endpoints: same result. Credit only: empty. Changing owner must not change fleet membership.
- Portrait print; fleet subtotal and grand total 683 in screen and workbook.
- [ ] Pass [ ] Fail

### M6 — Deliveries by model

- Model All: 02/10 Rio 2; 03/10 Sportage 1; 04/10 Rio 1. Rio column total 3, Sportage 1, grand total 4. No target columns are shown.
- Untick All; select QA79-RIO: total 3. Restore All and enable delivery details: four rows; J1 includes the delivering ServiceAdviser name.
- Date 02/10 only: total 2. Both cancelled and PDI deliveries are absent.
- Portrait print. Excel Report sheet has grid plus totals, Delivery details sheet has four jobs when selected.
- [ ] Pass [ ] Fail

### M7 — Deliveries by service

- QA79 Paid service column total 3; QA79 Free service total 1; grand total 4.
- 02/10 row: paid 1/free 1/total 2; 03/10 paid 1; 04/10 paid 1.
- Delivery details has the same four jobs as M6. Portrait print and matching Excel totals.
- [ ] Pass [ ] Fail

### M8 — Warranty attendance

- Both: 4 rows; Under 2/Beyond 2/Unknown 0. J1 snapshot ACTIVE; J2 snapshot EXPIRED_DATE; J3 snapshot EXPIRED_MILEAGE; J4 **calculated**, UNDER.
- Under: J1/J4 only. Beyond: J2/J3 only. Include address adds the fixture customer address/phone.
- Portrait print. Excel rows/model summaries match selected coverage filter. A separate job with no mileage/start date must show UNKNOWN, not UNDER/BEYOND (create in a separate QA fixture to avoid changing the baseline).
- [ ] Pass [ ] Fail

### M9 — Warranty parts

- All dimension checkboxes ticked, All categories/claims: one oil row, J1/W1, qty 1/rate 50/amount 50, case C1, manufacturer claim MAN1, SUBMITTED.
- Generated: same row. Not generated: empty. Show billed jobs only: same row because J1 has an active invoice. Oil: same row; Spares/Accessories: empty.
- Untick Vehicle All and select QA79-001: same row. Select another vehicle: empty. Restore All. Model Rio and Variant LX also retain the row. Technician comes from labour lines; Engineer is separate.
- Portrait print; VIN subtotal and grand total 50 in screen and Excel.
- [ ] Pass [ ] Fail

### M10 — Vehicle history card

- Search Registration QA79-001 (other text fields blank), Search vehicles: one row, customer QA79 Customer, Rio/LX, VIN QA79VIN01, visits 1.
- Try each search independently: customer QA79, product Kia, model QA79 Rio, variant LX, VIN QA79VIN01. Customer/product/model/variant can match multiple QA vehicles; VIN/registration identifies the main vehicle exactly.
- Open history: vehicle/warranty, current owner, ownership history, dealer, free services, job visits, requests, parts, labour/service charges, expenses by service type, warranty/FOC/goodwill, cost per km, repeat sections. Main visit J1/bill B1 amount 683. Parts show filter net 4/400 and warranty oil 1/50. Labour 200 plus service charge 100. Warranty section amount 50. Average cost/km is blank with only one mileage reading.
- Back to search; untick each optional section and reopen. Parts/oil, labour/service-charge and requests sections respectively disappear. Financial bill totals remain 683.
- Vehicle page → history → Full history card opens the same main card.
- PDI is absent by default. Admin/SuperAdmin have `pdi:read` by default; they can explicitly include PDI and then visits become 2. Other users require a separate explicit grant and must be rejected by API without it even if the URL is edited to includePdi=true. Portal must never reveal PDI or staff names.
- Portrait print, section page breaks; XLSX one sheet per visible section. Legacy SQL parity is pending supplied reference files; do not sign off that parity as verified.
- [ ] Pass [ ] Fail

### Corporate admin

- Admin → Reports → Manage corporate groups. Select QA79-FLEET; one member QA79VIN01.
- New group code QA79-SECOND/name Second QA fleet; Save. Add VIN QA79VIN2: member count 1. M5 now has B2 in the second group, amount 108.
- Upload workbook with first-sheet header VIN and value QA79VIN01. Values appear in the textarea; no change until Add vehicles. Without Move checkbox, it rejects existing membership. With Move ticked, vehicle joins SECOND; M5 moves B1 into that group. Restore VIN01 to FLEET with Move ticked to restore baseline.
- Add VIN UNKNOWNVIN79: rejects with no changes. Remove VIN2 from SECOND to restore baseline. Make SECOND inactive: adding members rejected; historical membership is still reportable.
- [ ] Pass [ ] Fail

## 4. Parts VAT Flow (billing)

This flow uses a new job/estimate/bill and does not modify the baseline fixture bills. In Part Master create customer-paid spares rate 1,000, oil 500, accessories 250 (untick Taxable for accessories). Use one of each; add labour 1,000 and service charge 100; parts discount 10%, labour discount 20%. Prepare matching estimate and customer approval, then complete/QC/ready the job according to the existing billing workflow.

- OFF: parts after discount 1,575; labour after discount 800; service 100; labour VAT 67.50; total before rounding 2,542.50; rounded bill **2,543**, round-off **+0.50**. Compare preview and saved bill.
- ON (business-approved QA exercise only): save enable=true with rates 7.5 each. For another identical new job: spares taxable 900/VAT 67.50; oil taxable 450/VAT 33.75; exempt accessories taxable 225/VAT 0; labour/service taxable 900/VAT 67.50; total VAT **168.75**; total before round-off 2,643.75; rounded bill **2,644**, round-off **+0.25**.
- Existing QA79-B1 remains **683** and VAT **22.50** regardless of flag changes. Tax register annexure for the new bill agrees with its VAT **168.75**.
- Restore flag OFF afterward. Do not enable it in production without business confirmation.
- [ ] Pass [ ] Fail

## 5. Permissions Matrix

| Role | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Admin/SuperAdmin/WorkshopManager | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Accountant/BillingOfficer | Yes | No | No | Yes | Yes | No | No | No | No | No |
| ServiceAdviser | No | No | No | No | No | Yes | Yes | No | No | Yes |
| WarrantyOfficer | No | No | No | No | No | No | No | Yes | Yes | No |
| No report permissions | No | No | No | No | No | No | No | No | No | No |

Hidden cards must stay hidden. Direct unauthorized page URLs are guarded/redirected; direct API URLs return 403. Admin/SuperAdmin alone can edit the shared corporate master and VAT settings. Other grants are explicit; roles customized in a database may differ from seeded defaults.

## 6. Cross-Cutting Checks

- With a second branch user, run the same dates: none of the QA79 records should appear. A supplied QA79 branchId must return 403. Admin may choose all branches.
- Dates 07/10–01/10 and a range longer than 366 days reject. Invalid UUIDs reject at API; grace values −1/1.5 reject.
- Simulate Slow 3G: Generating report is visible and Run disabled. Browser offline: error/Retry appears; restore connection and Retry reloads the same filters.
- Tick All: dropdown disabled/filter omitted. Untick and choose one or more dimensions; results change only on Run. Bookmarked URL restores filter values. Branch changes do not retain another branch's result.
- At 390px viewport, filters stack and tables scroll inside their card. Print and export remain reachable.
- Large range: record elapsed time and record count on representative QA data. Above 10,000 matched jobs, a narrowing error is expected; no silent partial totals. Vehicle search above 100 matches must request narrower text. No production-load benchmark has been performed.
- [ ] Pass [ ] Fail

## 7. Reconciliation Checks

- M1 stored VAT total **30** = annexure VAT **30**. Bill total **791** excludes cancelled 999.
- M6/M7 row totals sum to **4**; column totals sum to **4**.
- M2 grace 2: **2 + 1 = 3** bookings; walk-ins **2** are separately labelled.
- M4 main filter **5 − 1 − 4 = 0** unbilled; warranty oil **1 − 0 − 0 = 1**, value **50**. Compare net-issued separately from net-unbilled (issued − returned − billed).
- M5 main fleet bill **683** belongs to vehicle membership; changing customer company name must not change grouping.
- [ ] Pass [ ] Fail

## 8. Sign-off

Tester: __________ Date: __________ Environment/commit: __________

- [ ] Baseline fixture verified
- [ ] M1–M10 screen/print/Excel checks complete
- [ ] Corporate maintenance/import checked and baseline restored
- [ ] OFF/ON VAT exercise complete; flag restored OFF
- [ ] Permission and branch checks complete
- [ ] Loading/error/mobile checks complete
- [ ] Reconciliations complete
- [ ] Legacy SQL compared when supplied
- [ ] Business confirms parts VAT, corporate membership interpretation and delivery-target decision

Result: Pass / Fail / Pending. Record defects with report, filter URL, expected number, actual number and screenshot. The 19 October audit exercised all ten real output components with synthetic localhost responses (screen, print, XLSX and true 390px captures). This complete authenticated walkthrough, including role sign-in, admin uploads and live loading/error interactions, has not been executed as an end-to-end browser session. See issue-79-audit.md for the exact automated and component checks.

M9 vehicle picker: search by VIN/registration, select results across searches, load further pages, and verify All clears selection. Local integration explicitly checks a 1,001-vehicle cohort and cross-branch selection denial. M10 default options produce eleven section sheets, including headers for empty sections.
