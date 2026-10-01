# Warranty, Warranty Cases & Campaigns

This feature tells the workshop which vehicles are under manufacturer warranty, and checks
before a job card is created. It gives warranty officers a claim workflow, records who pays
for every part and labour line, and runs recall and free-fix campaigns targeted by VIN.

## Warranty coverage

Coverage is **calculated, never typed in** (`server/src/modules/warranty/warranty.logic.ts`, `computeCoverage`).

- The policy is set per vehicle model (`VehicleModel.warrantyDays`, `warrantyKm`, `warrantyCovered`).
  Manage it under **Warranty → Settings → Model policies**.
- Warranty starts on the vehicle's sale date (`Vehicle.warrantyStartDate`). Only `warranty:update` holders can set it.
- A vehicle is covered while `today <= start + warrantyDays` **and** `mileage <= warrantyKm`, whichever limit comes first.
  Dates are calendar days in Africa/Lagos.
- The mileage checked is the reading entered at check-in or on the job card, otherwise the last recorded reading.

| Status | Meaning |
|---|---|
| `ACTIVE` | Inside both limits (or an in-date goodwill override) |
| `EXPIRED_DATE` | The period has ended (also used when both limits have passed) |
| `EXPIRED_MILEAGE` | Over the km limit |
| `NOT_COVERED` | The model is flagged as not covered |
| `UNKNOWN` | No start date, no mileage, or no model policy. **Never treated as covered.** |

A known expiry wins over missing data. For example, a vehicle over the km limit is `EXPIRED_MILEAGE` even without a sale date.

**Overrides** (`warranty:settings`) are set per vehicle, with a reason:

- **Extended warranty** replaces the date and/or km limit, and also covers models not normally covered.
- **Goodwill** covers until its date, regardless of the policy.

**Odometer.** `Vehicle.lastRecordedMileage` only goes up. A lower reading is rejected unless the job card says the
odometer was replaced, with a reason. The reason is kept in the job card's warranty snapshot.

## Before the job card is created

`GET /api/vehicles/:id/warranty?mileage=` returns the coverage and the vehicle's **open campaigns** (active, in date,
work not done). The new job card page (`/job-cards/new`) and the appointment **Check in vehicle** dialog both call it
and show a banner for each finding.

- If the vehicle is covered or has open campaigns, the adviser must tick the acknowledgement.
- **The server enforces this, not just the UI.** `POST /api/service/job-cards` recomputes coverage inside a transaction,
  with the vehicle row locked. It returns `409` with `code: "WARRANTY_ACK_REQUIRED"` and the check in `details` unless:
  - `warrantyAcknowledged` is true for a covered vehicle, and
  - every open campaign ID is in `acknowledgedCampaignIds`.
- Check-in (`PUT /api/service/appointments/:id` with `status: "Checked In"` and `mileage`) enforces the same rule
  and records the odometer.

When the job card is created, one transaction:

1. Stores a **snapshot**: `mileage`, `warrantyStatusAtCreation`, reasons, expiry, km limit and `warrantySnapshot`
   (the policy, override and campaigns used). Later policy changes never rewrite it.
2. Updates the vehicle's last recorded mileage.
3. Links the open campaigns (`JobCardCampaign`) and marks those campaign vehicles `SCHEDULED`.
4. Opens a **warranty case** if the vehicle is covered (one case per job card).

After commit, warranty officers are notified (branch officers, or all officers if the branch has none). The adviser is
notified of any open campaign.

## Warranty cases

Warranty cases live under **Warranty** in the sidebar (`/warranty`); the role is `WarrantyOfficer`.

```
OPEN → IN_REVIEW → SUBMITTED → APPROVED | PARTIALLY_APPROVED | REJECTED | RETURNED
RETURNED → IN_REVIEW          (manufacturer asked for corrections)
APPROVED | PARTIALLY_APPROVED → SETTLED → CLOSED
REJECTED → CLOSED
OPEN | IN_REVIEW | RETURNED → CLOSED   (withdrawn; reason required)
```

**Guards** (`planTransition`):

- **Submit** needs at least one line, exactly one **causal** part, a defect code on every part line, and a complaint.
- **Partial approval** needs an approval % per line, with at least one line below 100%.
- **Reject** needs a reason code. **Return** needs remarks. **Settle** needs a settlement reference.

**Recording.** Every transition takes a row lock and a conditional update, so two officers cannot double-apply it (the
second gets `409`). It is recorded in `WarrantyCaseStatusHistory` with the user, time and remarks. The job card's
adviser and the branch workshop manager are notified.

**Claim lines** follow the legacy claim form:

- **Causal part**: the part that failed.
- **Consequential parts**: parts damaged as a result.
- **Labour.**

Each line has defect and position codes, batch no., quantity or hours, rate, approval %, and claimed and approved
amounts (computed on the server). Only `SparePart.warrantyApplicable` parts can be claimed, and the default rate is
`warrantyRate`. **Import job card lines** copies the job card's `WARRANTY` lines onto the claim.

Lookups (complaint, defect, position and reject reason) are maintained under **Warranty → Settings**. They are seeded
from the legacy `warrcomp`, `warrdef`, `warrpos` and `warrrej` tables.

## Job card lines and who pays

Every priced line on a job card has a `chargeType`:

| Charge type | Legacy code | Meaning |
|---|---|---|
| `CUSTOMER` | N | The customer pays; the line goes on the invoice |
| `WARRANTY` | W | Claimed from the manufacturer |
| `GOODWILL` | G | Absorbed by the dealer |
| `FREE` | F | Charged to a campaign |

- **Parts** get a line automatically, one per stock issuance (`partIssuanceId` is unique). Quantities follow approved
  part returns. Reading the lines creates any that are missing, which also backfills older job cards.
- **Labour** lines are added on the job card (`jobcard:line:update`).
- **Defaults:**
  - `FREE` when a linked campaign's covered items include the line. Part numbers ending in `x` or `*` match a prefix.
  - `WARRANTY` when the vehicle was covered at creation and the part is warranty-applicable.
  - Otherwise `CUSTOMER`.
- **Changing a line:**
  - `WARRANTY` needs coverage at creation (or a warranty case) and a warranty-applicable part.
  - `GOODWILL` needs `warranty:update` and asks for a reason.
  - `FREE` must name a linked campaign.
  - Lines that are invoiced, or on a submitted claim, are locked.

**Invoices.** `POST /api/finance/invoices/from-job-card/:jobCardId` bills **only `CUSTOMER` lines**, adds VAT on taxable
lines (`VAT_RATE` env, default 7.5%), and snapshots them as `InvoiceLine`s. A job card with priced lines can no longer
get a hand-typed invoice.

## Campaigns

**Campaigns** in the sidebar (`/campaigns`).

- **Types:** `RECALL`, `FREE_FIX`, `SERVICE_CAMPAIGN`.
- **Status:** `DRAFT → ACTIVE → CLOSED`. Activation needs at least one vehicle, and notifies service advisers and
  reception managers at the branches with affected vehicles.
- **Affected vehicles are stored by VIN.** Manufacturer lists often include vehicles never serviced here; they are
  tracked by VIN and link automatically when the vehicle is registered.
- **Adding vehicles:** paste VINs, upload an `.xlsx`/`.csv` file (a column headed VIN or Chassis), or select by criteria
  (model, model years, VIN range). The dialog validates live with `dryRun`: invalid, duplicate and not-in-system counts.
- **Vehicle status:**
  ```
  PENDING → CONTACTED → SCHEDULED → COMPLETED   (or NOT_REACHABLE / NOT_APPLICABLE)
  ```
  - A contact attempt that reaches the customer moves the vehicle to `CONTACTED`.
  - **Schedule** books a service appointment.
  - Opening a job card for the vehicle marks it `SCHEDULED`.
  - **Completing that job card marks it `COMPLETED`** in the same transaction, from either the job card update or the
    workshop progress update.
- **Progress** is shown overall and by branch; the branch is the vehicle owner's branch.

## Permissions

| Permission | Allows | Granted to |
|---|---|---|
| `warranty:read` | See coverage and cases | WarrantyOfficer, Admin, ServiceAdviser, WorkshopManager, Receptionist, ReceptionManager, Accountant |
| `warranty:update` | Edit cases and lines, set sale date or model, charge goodwill | WarrantyOfficer, Admin |
| `warranty:claim` | Open cases and move them through the workflow | WarrantyOfficer, Admin |
| `warranty:settings` | Model policies, claim codes, extended warranty or goodwill overrides | WarrantyOfficer, Admin |
| `campaign:read` | See campaigns | WarrantyOfficer, Admin, ServiceAdviser, WorkshopManager, Receptionist, ReceptionManager |
| `campaign:create` / `campaign:update` | Create, edit, activate or close campaigns; add vehicles | WarrantyOfficer, Admin |
| `campaign:vehicle:update` | Outreach: contacts, scheduling, status | WarrantyOfficer, Admin, Receptionist, ReceptionManager |
| `jobcard:line:update` | Add labour, change charge types | WarrantyOfficer, Admin, ServiceAdviser, WorkshopManager |

SuperAdmin has everything. Grants are in `ROLE_PERMISSIONS` (seed) and in migration
`20260930090100_warranty_permissions` (existing databases).

## Migrations and seeds

- `20260930090000_warranty_and_campaigns` adds the schema. It is additive and idempotent, with check constraints on
  amounts, approval % and mileage.
- The old free-text `Vehicle.warrantyProvider/Status/ExpiresAt` columns are kept but no longer used. The customer
  portal shows the calculated coverage in their place. Drop them in a follow-up migration once no deployed build reads them.
- `npm run prisma:seed:warranty` seeds Kia model policies, sample claim codes, a demo Kia Sportage under warranty, and
  a draft recall `RC-2026-014` that includes it. Activate it to see the banners.

## Legacy data migration

`server/prisma/legacy/warranty-migrate.ts` reads CSV exports of the legacy tables:

| File | Maps to |
|---|---|
| `model.csv` | `VehicleModel` |
| `vehiclemaster.csv` | `Vehicle.warrantyStartDate` and model, matched by VIN / ChassisNO |
| `partmast.csv` | `SparePart.warrantyApplicable` and `warrantyRate` |
| `warrcomp.csv`, `warrdef.csv`, `warrpos.csv`, `warrrej.csv` | The claim code lookups |

```bash
# Dry run: writes a Markdown + JSON report, changes nothing
npx ts-node prisma/legacy/warranty-migrate.ts --dir ./legacy-export
# Import (idempotent; safe to re-run)
npx ts-node prisma/legacy/warranty-migrate.ts --dir ./legacy-export --apply
```

The report lists:

- missing columns
- VINs not in the new system
- vehicles with no sale date (they will be `UNKNOWN`)
- sale-date conflicts (never overwritten unless `--overwrite-dates` is passed)
- vehicles with no matching model
- parts not in Part Master
- a "not migrated / lossy" section to sign off, covering legacy claims, the old free-text fields, historical charge
  codes and servhead campaigns.

## Tests

```bash
npx jest warranty campaign jobCardLine legacyImport         # pure logic
TEST_DATABASE_URL=postgresql://… npx jest warranty.integration   # database flows (never a shared database)
```

The integration tests cover:

- acknowledgement enforcement, the snapshot, the automatic case and officer notification
- odometer rules and `UNKNOWN` handling
- a full recall: VINs, activation, check-in flag, scheduling, completion and later VIN linking
- charge types and invoices that bill only customer lines
- the claim workflow, including concurrent decisions and partial approval or rejection
