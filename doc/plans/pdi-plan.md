# PDI (pre-delivery inspection): plan and progress

Branch `feature/pdi` from `Jayking`. PDI is a **job card type**, built on the existing job card,
requisition, return, labour slip and billing engines. No copies of those flows.

## Decisions (user, 2026-11-19)

| Topic | Decision |
|---|---|
| Numbering | Own counters per PDI document, stored with a prefix because job/bill numbers are globally unique: `P` + `YYYY######` (job, requisition, return, labour slip, bill); `PW` + `YYYY######` for PDI warranty requisitions. |
| Estimate gate | PDI jobs skip the signed-estimate gate on requisitions and billing. The defects grid is the internal estimate. `TODO(confirm)` |
| Charge types | On a PDI job, WARRANTY needs no warranty case (part must still be warranty-applicable) and FREE needs no campaign. `TODO(confirm)` |
| Ready flow | "Work done" records the work and moves the job to QC. "Vehicle ready" records QC passed and moves to READY. Status history is kept. |

## What already exists and is reused

- Service type PDI flag: `WorkshopMaster.preDelivery` (PD, BD).
- Tyre and battery make masters: `WorkshopMaster` kinds `TYRE_MAKE`, `BATTERY_MAKE`.
- Vehicle `pdiDone`, `pdiDate`, `tyres` (JSON).
- Defect lines with spare/oil/labour: `JobComplaint`.
- Requisition with type, rate snapshot, approval/customer split and footer: `PartRequisition(Line)`.
- Return with limit and stock-back: `PartReturnSlip` + `PartReturn`.
- Labour slip with charge lines: `LabourSlip` + `JobCardLabour`.
- Bill totals engine: `calculateBillWithPartsVat`.
- `pdi:read` permission and report-side PDI exclusion by service type.

## Data model (migration `20261119100000_pdi`, additive and idempotent)

- `enum JobCardType { SERVICE, PDI }`; `JobCard.jobType` (default SERVICE), `JobCard.pdiRegistration`, `JobCard.printedAt`.
- `PartRequisition.pickingListId`, `mileage`, `printedAt`; `PartReturnSlip.printedAt`; `LabourSlip.mileage`, `printedAt`.
- `Invoice.creditCompany`, `cardNumber`, `printedAt`.
- `PdiSettings` (single row): freeze date and edit-before/after-print per document, round bill,
  default customer, include in history, post to Tally, print titles.
- New master kind `PDI_DEFECT` (parent `VEHICLE_GROUP`). Variant attributes `frontTyreSize`, `rearTyreSize`.
- Tally: `TallyAccountMapping` rows for document type `PDI_BILL` (SALES and PARTY ledgers).

## Backend (`server/src/modules/pdi`)

- `pdi.logic.ts` (pure, unit tested): VIN last-6, defect totals, service type vs job type, labour
  totals by charge type, bill type rule, freeze and print locks, history filter.
- `pdi.settings.service.ts`, `pdi.service.ts` (open, list, detail, work done, vehicle ready, print marks),
  `pdi-bill.service.ts` (preview, create, cancel), `pdi.validation.ts`, `pdi.routes.ts`, Swagger.
- Existing services branch on `jobType`: job opening (number, service type rule, no warranty case),
  requisition (number series, charge rules, estimate gate, picking list, mileage), return, labour slip,
  job transitions (freeze, print lock), billing (service bill refuses PDI jobs), Tally.
- History: PDI excluded from vehicle history tab, history card print, customer portal, repeat-job
  candidates, warranty claim history; `pdi:read` users get a PDI tab.

## Frontend (`client/features/pdi`)

- PDI menu: PDI job cards, requisitions, returns, labour slips, bills.
- Open PDI: VIN search or new vehicle, defects grid with live totals, tyres and battery.
- PDI detail: summary card, status stepper, tabs for defects, requisitions, returns, labour, bill.
- Requisition, return, labour slip forms: entry row on top, grid, footer totals.
- Bill page: type, read-only lines, discounts, live server totals, print (PDI INVOICE / PDI CASH MEMO).
- Settings: PDI settings page; PDI defects and tyre makes in the masters screen.
- Vehicle page: PDI done/date, tyres, PDI tab.

## Progress

- [x] Phase 1: schema, migration, logic + unit tests (migration applied twice on local Postgres: idempotent)
- [x] Phase 2: services, routes, history filters, Tally, seed (`prisma:seed:pdi`, `prisma:seed:demo -- --pdi-only`)
- [x] Phase 3: integration tests on a local Postgres (`pdi.integration.test.ts`, 5 passing)

Pre-existing on main, found while seeding: the demo seed's part fixtures still set `description`,
`binLocation` and `category` (dropped from parts in a4a93f8), and the MIS stock vehicle has no plate.
Fixed minimally. The service-job demo scenarios still stop at JC-01 ("Record the required upfront
deposit before starting work"); that is outside PDI, so `--pdi-only` runs the PDI demo on its own.
- [x] Phase 4: frontend (`client/features/pdi`, routes under `/pdi` and `/settings/pdi`, vehicle PDI section,
      PDI menu, PDI defect and tyre size masters, PDI bill in the Tally mapping screen)
- [x] Phase 5: docs (`doc/pdi.md`, `doc/pdi-testing-guide.md`), checks: server tsc + build, all server unit
      tests (vehicle-catalog routes test times out only under full-suite load, passes alone), PDI integration
      tests (5), client tsc, lint (0 errors), `next build`, client `node --test test/pdi-logic.test.mjs`,
      HTTP smoke test of `/api/pdi` on the local demo database.

Not done: a browser click-through of the screens.
