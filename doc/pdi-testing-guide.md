# PDI: manual testing guide

Step-by-step checks for the PDI feature (`doc/pdi.md`). Expected numbers assume a fresh database with the
base seed and the PDI demo seed, as below. Never run migrations or seeds against the shared dev database.

## 0. Set up a local database

1. Start a local Postgres and create an empty database whose name contains `demo` (e.g. `dana_demo_pdi`).
2. In `server/`, point `DATABASE_URL` at it for these commands only (do not edit the shared `.env` value):
   ```bash
   export DATABASE_URL="postgresql://<user>:<password>@localhost:<port>/dana_demo_pdi"
   npx prisma migrate deploy
   npx ts-node prisma/seed/seed.ts                                   # base data, includes the PDI reference data
   npx ts-node prisma/seed/demo/index.ts --second-branch="Abuja Branch" --pdi-only
   ```
   The last command prints:
   ```
   PDI-1 VIN KNADEMOPDI0000001: P2026000001 OPEN
   PDI-2 VIN KNADEMOPDI0000002: P2026000002 READY
   PDI-3 VIN KNADEMOPDI0000003: P2026000003 READY
   PDI-4 VIN KNADEMOPDI0000004: P2026000004 BILLED, bill P2026000001
   PDI-5 VIN KNADEMOPDI0000005: no PDI yet (open one in the UI)
   ```
   Running it again changes nothing. (The full demo seed without `--pdi-only` currently stops at JC-01 on an
   unrelated deposit rule from main.)
3. Start the API (`npm run dev` in `server/`, same `DATABASE_URL`) and the client (`npm run dev` in `client/`).
4. Sign in as the seeded super admin (`superadmin@danamotors.com`, local seed password) on **Main Branch**.

### Demo data at a glance

| Job | Vehicle | State | What it is for |
|---|---|---|---|
| P2026000001 | Rio · VIN …0000001 | OPEN | Edit, defects, tyres, work done |
| P2026000002 | Sportage · …0000002 | READY | Cash or invoice bill (chargeable mat and polish) |
| P2026000003 | Sorento · …0000003 | READY | Zero bill (all FOC/warranty) |
| P2026000004 | Rio · …0000004 | BILLED (zero) | PDI done on the vehicle, bill print |
| — | Sportage · …0000005 | no PDI | Open a PDI from scratch |

PDI demo parts (Main Branch, 20 each at the start): `DM-PDI-BULB-H4` (warranty rate ₦3,800, retail ₦4,500),
`DM-PDI-WIPER-24` (₦6,000), `DM-PDI-MAT-SET` (₦18,000). Labour: `DM-PDI-INSP` (1 h × ₦8,000), `DM-PDI-POLISH` (1.5 h × ₦6,000).

## 1. Menu, list and separation from service jobs

1. Open **Workshop → PDI → PDI Job Cards**. Expect 4 jobs, tiles Open 1 · Ready to bill 2 · Billed 1.
2. Filter **Vehicle ready**: P2026000002 and P2026000003. Type `0000003` in the VIN box: only P2026000003.
3. Open **Workshop → Job Cards**. No `P…` job appears there (service jobs only).
4. Open a normal **New job card** for any sold vehicle: the service type list has no `PD` / `BD`.

## 2. Open a PDI (vehicle without PDI)

1. **PDI → Open PDI**. Type `0000005` in the VIN search; pick `KNADEMOPDI0000005` ("No PDI yet").
2. Expect PDI registration prefilled `000005`; service type list only `BD` and `PD`.
3. Click **Open PDI job card** without filling anything: the summary lists what is missing.
4. Fill: service `PD`, mileage `12`, bay, group, engineer, received by, promised date tomorrow.
5. Defects: line 1 pick `PDI-PAINT`, labour `6,000`; line 2 type "Rear bumper scratch", spare `2,500.50`, oil `0`, labour `1,500`.
   Expect line totals ₦6,000.00 and ₦4,000.50; grid total ₦10,000.50 (the sidebar shows the same).
6. Clear the description and defect of a line, submit: "Every defect line needs a defect or a description".
7. Tyres: Front left `MICHELIN` / `T-001`, Front right `MICHELIN` / `T-002`. Battery `VARTA` / `B-001`.
8. Submit. Expect a new job **P2026000005**, status Open, PDI reg. `000005`.
9. Open the vehicle (**Vehicles → KNADEMOPDI0000005**): registration still empty; PDI section shows the tyres
   and battery; PDI job P2026000005 listed; **Service History** does not show it.

### New vehicle

1. **Open PDI**, type a VIN that does not exist (e.g. `KNATESTPDI0000099`), click **Create …**.
2. Choose variant (e.g. Rio automatic petrol), colour, engine no. Create: the vehicle is selected; registration "Not registered".

## 3. Requisition (IPO), return and labour on P2026000005

1. **Requisitions** tab → type **Non-warranty**, part `DM-PDI-MAT-SET`, qty 1/1 → Add → **Issue parts**.
   Expect `P2026000002`, amount ₦18,000, approved ₦0. Stock of the mat: 19 → 18.
2. Type **Warranty**, part `DM-PDI-BULB-H4`, qty 2/2, picking list `PL-1` → issue.
   Expect `PW2026000002`, rate ₦3,800, amount ₦7,600, approval 100% / ₦7,600, customer ₦0. Bulb stock 19 → 17.
3. Type **Free of cost**, part `DM-PDI-WIPER-24`, qty 1/1 → issue (no campaign needed on a PDI).
4. Try a part not warranty-applicable (`DM-PDI-MAT-SET`) as **Warranty**: refused.
5. **Returns** tab → pick `PW2026000002`. "Can return" is 2. Enter 3: "At most 2". Enter 1 → **Save return**.
   Expect return `P2026000002`, net quantity 1, ₦3,800; bulb stock 17 → 18. Requisition grid shows Qty ret. 1.
6. **Labour** tab → W/T/Q **Warranty**, code `DM-PDI-INSP`, technician → Add; **Non-warranty**, `DM-PDI-POLISH` → Add → Save.
   Expect totals: warranty ₦8,000, non-warranty ₦9,000, FOC ₦0, total ₦17,000.
7. Print a requisition: the print shows "PDI requisition · Warranty" with the footer totals.

## 4. Work done, vehicle ready, bill

1. **Work done** → status Work done (QC). **Vehicle ready** → status Vehicle ready; banner "Vehicle ready for billing".
2. Requisitions/labour remain allowed until billed (a change after ready sends it back to work in progress).
3. **Bill PDI**. Expect chargeable parts ₦18,000 and labour ₦9,000; bulb and inspection shown "no charge".
   **Zero bill** is disabled. Choose **Cash memo**, discount 0 / 0: VAT ₦675, round off −₦5, net ₦27,670.
   Set spares discount 10: spares discount −₦1,800, net ₦25,870.
4. Choose **Invoice (credit)** without a credit company: button disabled. Enter "Fleet Leasing Ltd", create.
5. Bill page: title **PDI INVOICE**, credit company shown, voucher type Sales. The vehicle shows PDI done = Yes, today.

### Zero bill and cash memo on the demo jobs

1. Open P2026000003 → **Bill PDI**: chargeable ₦0; only **Zero bill** is allowed; net ₦0.00. Create.
   Expect title **PDI CASH MEMO**, status Paid, "Not posted (zero bill)"; vehicle …0000003 PDI done.
2. Open P2026000002 → **Bill PDI**: Zero bill disabled ("only allowed when nothing is chargeable"); cash net ₦27,670.
3. **Cancel bill** on one of them (reason required): job goes back to Vehicle ready; the vehicle's PDI done goes back to No.

## 5. Settings: freeze dates, print rules, titles, history

Open **Settings → PDI Settings** (needs `pdi:settings`).

1. Set **PDI job card** freeze date to today, save. Edit P2026000001: "PDI job cards dated on or before … are frozen".
   Clear the date, save; the edit works.
2. Set **PDI requisition** freeze date to today: issuing a new requisition is refused. Clear it.
3. On the open job P2026000001, issue a non-warranty requisition (e.g. 1 × `DM-PDI-MAT-SET`), click its
   **Print**, close the print dialog, then **Cancel requisition**: "cannot be changed after it has been printed".
   Tick **Allow change after print** for PDI requisition, save, cancel again: works; stock comes back.
4. Change **Cash memo print title** to `PDI CASH MEMO (TEST)`: an existing cash/zero bill shows the new title.
5. Tick **Include PDI in vehicle history**, save. The vehicle page **Service History** now lists the PDI jobs,
   and the vehicle history card report includes them. Untick it again (default).

## 6. Permissions

Use **Settings → Users & Roles** to check roles, or sign in as seeded users:

| Role | Expect |
|---|---|
| Service adviser | PDI menu; open PDI, requisitions, labour; no **Bill PDI**; settings read-only |
| Technician | PDI menu read-only (no Open PDI, no forms) |
| Billing officer | Can bill and cancel PDI bills; no PDI forms |
| Admin | Everything, including PDI settings |

## 7. Accounts (Tally)

1. **Finance → Tally**, account mapping: document type **PDI bill**, roles `PARTY` (PDI party) and `SALES` (PDI account)
   to ledgers. VAT and round-off use the job bill mapping unless PDI ones are set.
2. Export job bills for the PDI bill date: the PDI invoice/cash memo appears, with the PDI party; zero bills do not.
3. Untick **Post PDI bills to Tally** in PDI settings: PDI bills no longer appear for export.

## 8. Customer-facing views

Sign in to the customer portal as the PDI customer or the fleet buyer: no PDI job or PDI bill is listed.

## Automated checks

```bash
cd server
npx jest src/modules/pdi                      # unit tests (logic, rules)
TEST_DATABASE_URL=postgresql://…/dana_test_pdi npx jest src/modules/pdi/pdi.integration.test.ts
cd ../client && node --test test/pdi-logic.test.mjs
```
