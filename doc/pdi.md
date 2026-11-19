# PDI (pre-delivery inspection)

A PDI is the inspection of a **new vehicle** before it is delivered. In the app it is a **job card type**
(`JobCard.jobType = PDI`) that runs on the same job card, requisition, return, labour slip and bill engines
as service jobs, but with its own numbers, rules and screens. PDI jobs never appear in a vehicle's service
history.

Menu: **Workshop → PDI** (PDI job cards, Open PDI, requisitions, returns, labour, bills).
Settings: **Settings → PDI Settings**. Masters: **Settings → Workshop Masters → PDI defect / Tyre make / Variant**.

## Flow

1. **Open** (`pdi:create`): find the vehicle by VIN or create it from the catalogue (variant, colour, engine no.;
   no plate). Choose a PDI service type (PD, BD), mileage, bay, group, engineer, received by, promised date,
   at least one defect line, tyres and battery.
2. **Requisition (IPO)** (`pdi:update`): issue parts; type non-warranty, warranty, free of cost or goodwill.
3. **Return**: return parts from one of the job's requisitions.
4. **Labour slip**: labour codes with W/T/Q charge type; standard hours and model rate from the masters.
5. **Work done** → status `QC`; **Vehicle ready** → QC passed, status `READY`.
6. **Bill** (`pdi:bill`): CASH, INVOICE (credit company) or ZERO. Billing sets **PDI done** and **PDI date** on the vehicle.

## Rules

| Rule | Where |
|---|---|
| Numbers: `P` + `YYYY######` per document (job, requisition, return, labour slip, bill); `PW` + `YYYY######` for PDI warranty requisitions. The prefix keeps them apart from service numbers, which are unique across all documents. | `pdi.logic.ts` (`PDI_DOCUMENTS`) |
| PDI registration defaults to the last 6 letters/digits of the VIN; stored on the job card (`pdiRegistration`), never on the vehicle. | `pdiRegistrationFromVin` |
| A PDI job offers only PDI service types (`preDelivery` or category `PDI`); a service job card rejects them. | `assertServiceTypeForJob`, `service-type.repository.ts` |
| PDI defects come from the `PDI_DEFECT` master (code, description, group) or free text; per-model estimates fill spare/oil/labour. | `job-card-complaints.ts` |
| No warranty case is opened for a PDI; open campaigns must still be acknowledged. | `job-card-workflow.service.ts` |
| On PDI jobs, warranty needs no warranty case (part must be warranty-applicable) and free of cost needs no campaign. `TODO(confirm)` | `assertChargeChange({ pdi })` |
| No signed-estimate gate on PDI requisitions, labour or bill; the defects grid is the internal estimate. `TODO(confirm)` | requisition / labour slip services |
| Return quantity ≤ issued − already returned; stock goes back in the same transaction. | existing return-slip engine |
| Bill lines come only from the job's requisitions (net of returns), labour and service charge. Only non-warranty (`CUSTOMER`) charges are chargeable; a COMPANY service type pays its own service charge. | `pdiBillLines` |
| ZERO only when nothing is chargeable; CASH/INVOICE only when something is; INVOICE needs a credit company. INVOICE is stored as bill type `CREDIT`. | `assertPdiBillType` |
| Freeze date per document: no create or edit dated on or before it (Lagos day). Edit before/after print per document; the first print is recorded. | `assertPdiDocumentChange` |
| The service job card screens, service billing and warranty cases refuse PDI jobs. | workflow, `job-billing.service.ts`, `warrantyCase.service.ts` |

## History and customer views

PDI jobs are excluded from: the vehicle page service history, the vehicle history card report, the customer
portal (jobs and bills), repeat-job candidates and warranty cases. The company-wide setting **Include PDI in
vehicle history** (default off) adds them to the vehicle page history and history card only; customer views
never show PDI. Users with `pdi:read` see a vehicle's PDI jobs in the PDI section of the vehicle page.

## Accounts (Tally)

PDI bills are exported as job bills but post to the **PDI_BILL** ledger mapping: `PARTY` (PDI party) and
`SALES` (PDI account) or a per-amount account (`PARTS_SALES`, `LABOUR_SALES`, …). VAT and round-off fall back to
the job bill mapping. Zero bills are never posted. **Post PDI bills to Tally** (PDI settings) switches posting off.

## Permissions

`pdi:read`, `pdi:create`, `pdi:update`, `pdi:bill`, `pdi:settings` (migration `20261119100000_pdi` and
`ROLE_PERMISSIONS`): Admin all; ServiceManager, WorkshopManager, ServiceAdviser read/create/update; Engineer
read/update; Technician and Auditor read; BillingOfficer read/bill.

## API

`/api/pdi` (see Swagger, tag **PDI**): list/open/detail/edit, `work-done`, `vehicle-ready`, `cancel`,
`settings`, `service-types`, `defects`, `vehicles`, `requisitions`, `returns`, `labour-slips`, `bills`
(`preview`, create, cancel), `print/{kind}/{id}`. `/api/service/job-cards?jobType=SERVICE|PDI|ALL|HISTORY`.

## Data

Migration `20261119100000_pdi` (additive, idempotent): `JobCardType` enum and `JobCard.jobType`,
`pdiRegistration`, `printedAt`; requisition `pickingListNumber`, `mileage`, `printedAt`; return and labour slip
`printedAt` (+ labour `mileage`); bill `creditCompany`, `cardNumber`, `printedAt`; `PdiSettings`; pdi permissions.
Seeds: `npm run prisma:seed:pdi` (PDI defects, tyre and battery makes, internal PDI customer, settings);
`npm run prisma:seed:demo -- --pdi-only` (demo PDI jobs, see `doc/pdi-testing-guide.md`).

## Known limits

- Old PDIs opened as service jobs keep `jobType = SERVICE`; they stay out of history through their PDI service type.
- The picking list number on a requisition is free text (job picking lists are print-only).
