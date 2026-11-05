# Masters

How the legacy **Masters** menu maps to the new system. Each used legacy field has a home here and keeps its
legacy code, so migrating the masters is a straight copy.

## Simple code lists

All simple legacy code lists share the `WorkshopMaster` table (kind + code + description + optional parent) and
one screen: **Settings → Workshop Masters**. Pick the list from the grouped dropdown. Records are never deleted;
untick **Active** instead, so old documents keep their codes.

Each record also has a **short description** (legacy `shortdesc`). Extra legacy fields for a kind are stored in
`attributes` and validated per kind in `server/src/modules/workshop/master-kinds.ts`. The client mirror is
`client/features/settings/components/master-kinds.ts`. Add a list or a field in both files.

| Legacy screen | Kind | Parent | Extra fields |
| --- | --- | --- | --- |
| Product | PRODUCT | Make (fixed) | include in reports |
| Model | MODEL | Product (fixed) | model ID, basic model, product line, fuel, AC, warranty days / km |
| Variant | VARIANT | Model (fixed) | fuel, gearbox, AC, features |
| Miscellaneous → Colour type | COLOUR_TYPE | — | — |
| (model colours) | COLOUR | Model (fixed) | colour type code |
| Miscellaneous → Tyre / Battery make | TYRE_MAKE, BATTERY_MAKE | — | — |
| Vehicle System | VEHICLE_SYSTEM | — | — |
| Vehicle Group | VEHICLE_GROUP | Vehicle system (required) | — |
| Service | SERVICE_TYPE | — | multi-service; see [Service master](#service-master) |
| Service Checklist Master | CHECKLIST | — | see [Service checklists](#service-checklists) |
| Bay Master | BAY | — | bay category: PDI, Service & Repair, Accidental |
| Defect | COMPLAINT | Vehicle group (optional) | major defect, used in (warranty / beyond / both) |
| Miscellaneous → Employee group | TEAM | — | — |
| (employee department) | DEPARTMENT | — | — (legacy only stores the letter E, P, C or M; name them here) |
| Designation | DESIGNATION | — | hierarchy, department code, belongs to a group, can receive / deliver vehicles |
| Salutation | SALUTATION | — | reference in letters |
| (customer segment) | SEGMENT | — | segment type |
| Zone / State / City | ZONE, STATE, CITY | zone → state → city (optional, as in legacy) | — |
| Unit of Measurement | UOM | — | decimal quantities allowed |
| Tax Category | TAX_CATEGORY | — | — |
| Tax Form | TAX_FORM | — | applicable against local sale, form required |

Catalogue parents (product, model, variant, colour) are fixed once saved because vehicles and rates point at them.
Other parents (for example a state's zone) can be changed.

Legacy fields that are empty in all three databases (AutoEnhancer, CPDAutoEnhancer, ABJAutoEnhancer) are not
carried over: variant specifications (class, cc, weights, seats, body type), state permit, city STD code, vehicle
group mileage limit / % variation, tax form start / end numbers.

## Employee master

**Workshop → Employees** (`/employees`, API `/api/employees`, permissions `employee:read` / `employee:manage`).
Legacy jobs name mechanics (up to three per labour line), the main mechanic and the employee group by employee
code, but most of those people never log in. So employees are their own master, and a login user can be linked
to an employee when the person also uses the system.

| Legacy field | New field |
| --- | --- |
| employee | `code` (unique per branch, upper case, fixed once saved) |
| name | `name` |
| designation, department, empgroup | `designationId`, `departmentId`, `teamId` (DESIGNATION, DEPARTMENT, TEAM masters) |
| emptype O / C | `employeeType` OWN / CONTRACT |
| majororminor S / J | `grade` SENIOR / JUNIOR |
| dateofbirth, qualification, Blood_Group, experience | same names |
| block, street, district, city, state, pin, phone | same names |
| empjoindate, empleftdate | `joinDate`, `leftDate` |

An employee with a left date on or before today drops out of the current list (and pickers) but stays on old
documents.

Each job-card labour line records its **mechanic** (`JobCardLabour.mechanicId`, legacy `joblabordetail.mechanic`):
a current employee of the job card's branch. In 2025 legacy filled it on 99 % of labour lines, across 32 (Lagos)
and 14 (Abuja) people. When the employee has a login, it is also stored as the line's technician. Lines entered
before this keep their technician; the migration fills their mechanic when that login is linked to an employee.
`mechanic2` / `mechanic3` were never used, so one mechanic per line. The job-level main mechanic was a single
default person per branch on almost every legacy job; it stays the optional job technician. Salary (filled for a handful of rows) is not kept: payroll is not part of this system.

## Service master

A service is a SERVICE_TYPE record: code, description, short description, charged to customer or company
(legacy `chargefrom` C / E), display sequence, multi-service and active (legacy `InActiveService`). Edit a service
to maintain its per-model settings (legacy `servicedetail`):

| Legacy field | New field |
| --- | --- |
| intnewamt, intoldamt, inteffdate | `serviceCharge`, `previousCharge`, `effectiveFrom` |
| hours_reqd | `hoursRequired` |
| MileageLimit, MileageVariation | `mileageLimit`, `mileageVariation` (km) |
| dayslimit, daysvariation | `daysLimit`, `daysVariation` |
| ChecklistFollowed | `checklistFollowed` |

A service is due at the mileage or days limit, plus or minus the variation.

## Service checklists

**Settings → Service Checklists** (`/settings/service-checklists`, API `/api/service-checklists`). The checklist
code is a CHECKLIST master (legacy `ChecklistMaster`).

- **Checklist definition** (legacy `ChecklistDefinitionMaster`): part lines (part + quantity, priced at the
  part's retail rate) and labour lines (labour + amount) per checklist and model, for one variant or all variants
  (legacy "All Variant"). A variant follows its own lines plus the all-variant lines. Estimated part, oil (parts
  of type O) and labour amounts are calculated, as in legacy.
- **Mileage-wise checklists** (legacy `MileageChecklistDefinition`): the checklist to follow at a mileage for a
  model and variant, with the same estimates.

Each item appears once per checklist, model and variant; each mileage once per model and variant.

## Labour master

**Operations → Labour Catalogue**. A labour (legacy `labourhead`) has code, description, vehicle system and group
(picked from the VEHICLE_SYSTEM / VEHICLE_GROUP lists, stored as codes) and the legacy flags in the row's
**Options** dialog: major labour, insured, approval required, external labour, under AMC, include in follow-up
analysis, labour amount can be edited and include in top-N reports. Defaults follow most legacy codes (the last
three on, the rest off). Deactivating a labour records the date (legacy `inactivedate`).

Per-model time / amount (legacy `labour`: model, time required, amount or time) is the model labour rate
(**Settings → Model labour rates**). The labour Part and Defect tabs are not carried over: `partlabour` and
`troublelabour` are empty in all three databases.

## Part master

**Inventory → Parts**. On top of the fields the part already had (number, name, UOM, purchase source / part flag,
part type, dealer and retail rate, part category, tax category / form, min / max / reorder, warranty), the form's
**Classification and ordering** section keeps the remaining legacy `partmast` fields:

**Part category** is legacy `partmast.partcategory` (A, C, E…, from the Part Category master); its multiplier
derives the retail rate. In the code it is `priceCategoryCode`. The free-text "Category" (Engine, Brakes…) the
first version of Part Master had is removed: no legacy database has such a field and nothing used it. The stock
taking **Part type** filter, which wrongly used it, now uses the legacy part type (S spare part, O oil, A accessory).

**Part description** is legacy `partmast.partdesc`, the part's only text (in the code `name`). The separate free-text
description is removed, for the same reason.

**Location** is not on the part. Legacy `partmast` has no bin or store; legacy keeps each part's location per store
(`PARTBAL.location` and `bincard`), and every legacy bin change (`PartBinHistory`) belongs to a store. Here that is the
branch stock record's **rack location** and **bin card**, shown in Part Query and the branch stock, and set from
**Inventory → stock location** or a stock taking's **Update bins**. The part-level bin and store location are removed,
so pickings, CPOs, vendor receipts, reports and stock taking always show the branch's own bin.

| Legacy field | New field |
| --- | --- |
| vehiclesystem, vehiclegroup | `vehicleSystem`, `vehicleGroup` (codes; suggested from the masters) |
| partmodel, allmodelpart | `applicableModels` (model codes; empty = all models) |
| MOQ, ConversionFactor | `moq`, `conversionFactor` |
| basicrate | `basicRate` (supplier base price in foreign currency) |
| NSPDATE, NCADATE | `nspDate`, `nlaDate` |
| blockreserve, TOP350, topnparts, UnderAMC | `blockReserve`, `topMover`, `includeInTopN`, `underAmc` |

UOM, tax category and tax form inputs suggest the codes from their master lists. `salerate` (set on under 1% of
parts and not on the Part screen) is not carried over. The Part screen's Labours and Defects tabs are not carried
over: `partlabour` and `troublepart` are empty in all three databases.

### Mobis catalogue and Part Enquiry

Legacy CPD had two part tables. `partmast` is Part Master, the parts the business uses. `FullpartList` is the
Mobis catalogue, every part Mobis supplies, loaded in bulk from the Mobis price list (over 500,000 parts in 2019,
45,000 more in 2025). Legacy **Part Query** searched `partmast` only, so a part missing from it was "not found".
Legacy **Part Enquiry** searched `partmast`, then `FullpartList`, showed the catalogue's type, unit and rates,
and its **Create Part** button copied the catalogue row into `partmast`. Example: 473004G350 (TRANSFER ASSY) was
in `FullpartList` only.

The new system has one screen for both. **Inventory → Part Query** answers from Part Master as before. A part
not in Part Master is looked up in the catalogue (`PartCatalogueItem`) and shown with its flag, type, part
category, unit and rates. A user with `sparepart:create` clicks **Create part**, as in legacy, with nothing to fill in.
The name, flag, type, unit, tax status, part category, dealer rate and retail rate are copied, and the query then
shows the new part with its (empty) stock grids. Parts are never created from an MIT, so this is how a new Mobis
part gets into Part Master.

**Inventory → Mobis Catalogue** shows how many parts the catalogue holds and when it was last loaded. A user with
`sparepart:create` and `sparepart:update` loads the Mobis price list there (.xls, .xlsx, .csv or tab-separated
text). Columns are found by header: part no., part name and dealer rate (`DR` / `FINALDR`) are required; flag,
part category and retail rate (`RR` / `NEW RR (NAIRA)`) are optional, matching the legacy price list layout.

- New part numbers are added; known ones take the list's name, flag, category and rates. Part Master is not
  changed: re-rating Part Master parts is a separate job.
- Retail rate is the list's own, else dealer rate × the part category multiplier, as on `FullpartList`.
- Rows with an unknown or inactive part category, an unreadable rate or a part number already listed in the file
  are left out and listed before loading.
- The browser sends the list in batches of 2,000 parts, each saved whole or not at all. If a batch fails, the
  batches before it are kept, and loading the file again is safe.

### Part sources and source records

The part flag codes double as **part sources**: O Mobis (original part), A authorised source, F FOC item,
L local purchase, plus two new ones, **U second-hand / used** and **R repaired**. No legacy code was removed.

The system matches the physical stock: a used shock absorber and a new Mobis one are different items on the
shelf. So a local, used or repaired version of a part is its own Part Master record, a **source record**, linked
to its main part (`sourceOfPartId`). It has its own part number, stock, dealer rate, retail rate, bin and history;
its source is its part flag. This link is separate from alternates (supersession and replacement options).

- **Sources card.** The part page lists the main part and its source records with the stock at the current branch,
  the dealer rate and the retail rate. **Add source record** (`sparepart:create`) takes the source, the part number
  (suggested as main part number + `-` + code, e.g. `54651-U`), the dealer rate and a part category, and copies the
  name, UOM, tax and classification from the main part. A source record's page shows the part it is a source of.
  API: `GET`/`POST /api/inventory/parts/:id/sources`.
- **Price.** Retail = dealer rate × part category multiplier, as for Mobis parts. New local, used and repaired
  records default to category **L** (local consumable, 1.5×), which is how legacy prices local purchases; the
  Mobis general category C is 3.33×. Other sources default to the main part's category. A vendor receipt sets the
  dealer rate to the received cost and recalculates retail the same way (see
  [mobis-receiving.md](./mobis-receiving.md#vendor-receipts-non-mobis-purchases)).
- **Rules.** One record per source per main part; a source record's flag differs from its main part's; source
  records have no source records, are not alternates and are never warranty-applicable. A main part with source
  records, or a source record, cannot change its part flag. The database enforces the structural rules too.
- **Estimates** offer only records that exist. After a part is picked, the line's source dropdown lists the main
  part and its source records with price and branch stock; changing the source swaps the line's part. Each record
  may appear once per estimate. For example: a workshop manager quotes all Mobis parts; the customer finds it too
  expensive; the advisor creates a revised estimate, switches some lines to the local, used or repaired records
  and sends it for approval again.
- **Issue, job card and bill.** The storekeeper issues the exact record from branch stock, and stock comes off that
  record. It must be the record on the approved estimate. The job card line and the bill charge that record's
  retail rate. Estimate, issue, job card and bill lines keep the record's flag in `partSource` for reporting.
- **Internal only.** The source is never on the printed estimate, the customer portal or the printed bill.
- **Kept out of transfers.** CPD supplies Mobis parts: source records and L, U and R parts cannot be indented,
  picked as alternates or sent on a direct STN (legacy has no L indent since 2022). Mobis MIT lines match Part
  Master by part number and are refused if they match a source record.
- **Stock taking.** Count sheets list each record with its own part number and value it at its own dealer rate.
  There is no bin rule per source: local parts share racks with Mobis parts, as in legacy.

The first version (per-source prices on one part, `SparePartSourcePrice`) was retired by migration
`20261016120000_part_source_records`. Existing estimate, issue, job card and bill lines were left as they were:
lines priced from another source of the same part (demo data only) cannot be mapped to a source record
automatically, so their `partSource` stays as a snapshot.

## Part category master

**Settings → Part Categories** (`/settings/part-categories`; API `/api/inventory/part-categories`, permissions
`sparepart:create` / `sparepart:update`). Legacy `Category`:

| Legacy field | New field |
| --- | --- |
| category, categorydesc | `code`, `description` |
| multiply | `markupMultiplier` (retail rate = dealer rate × multiplier) |
| discountper, handlingper, DirectCostPer, OperationalCostPer | `PartCategoryBranchSetting` per branch |

The percentages differ between the three legacy databases (for example discount 50 % at Lagos, 45 % at Abuja,
0 % at CPD), so they are kept per branch. Reorder / min / max level factors, reserve, reserve months and the
conversion factor hold the same default (1 or 0) for every category in all three databases and are not carried
over.

## Vehicle master

**Vehicles → edit → Sale, stock and fitment** keeps the legacy `vehiclemaster` fields from the Vehicle screen's
three tabs that the vehicle lacked:

| Legacy field | New field |
| --- | --- |
| CTYPE | `colourType` (COLOUR_TYPE code) |
| parkedat R / Y / S | `parkedAt` SHOWROOM / STOCKYARD / SOLD |
| PurchaseAmount | `purchaseAmount` |
| invno, invdate, SaleAmount | `saleInvoiceNumber`, `saleInvoiceDate`, `saleAmount` |
| WcoNo, WCOdate | `wcoNumber`, `wcoDate` |
| PPLInvoice, PPLInvdate | `principalInvoiceNumber`, `principalInvoiceDate` |
| theft | `theft` |
| Manufacturingmonth, manufacturingyear | `manufactureMonth`, `manufactureYear` |
| tyremake1–5, tyreno1–5, BatteryMake, batteryno | `tyres` [{ makeId, make, number }], `batteryMake`, `batteryNumber` (same shape as the job card snapshot) |

`InstallationDate` equals `SaleDate` on most rows and stands in for it when `SaleDate` is blank, so it maps to
`saleDate`. The vehicle-sales stock columns (VRN / SRN / STN numbers and dates, reservation, booking, FSC code,
FOC amounts) belong to the vehicle sales module, which this system does not replace. The Sale Details discount
percentages and "Company Vehicle" are empty in all three databases.

## Customer / vendor master

The customer type (individual, corporate, government, vendor) already covers legacy `custtype` and
`CustomerCategory`. The profile form adds the remaining legacy `Customer` fields:

| Legacy field | New field |
| --- | --- |
| salutation | `salutation`, any code from the SALUTATION master (was a fixed list of six, which legacy PROF., MAJ., REV. would not fit) |
| Segment | `segment` (SEGMENT code) |
| district | `district` |
| comptype | `companyType` (legacy code) |
| VendorType, MRNRatetype | `vendorType` (LOCAL / IMP), `mrnRateType` (D dealer / R retail), shown for vendors |
| govt_vehicle, own_comp_vehicle | `governmentVehicle`, `ownCompanyVehicle` |
| CreditLimit | `creditLimit` |
| Organization | `organizationId` (the corporate group customer); moves to the survivor on a customer merge |

Zone, state and city inputs suggest values from the geography masters. The consignee address (`reg*` columns) is
filled on a handful of rows and maps to the registered name and address already on the customer.

### Customer merge (legacy Customer Correction Utility)

Admins merge a duplicate customer into the one to keep (`POST /api/customers/:id/merge`, body
`{ targetId, keep? }`). In one serializable transaction, every record that points at the duplicate moves to the
survivor:

- Vehicles and ownerships, appointments, job cards, estimates, customer approvals and warranty cases.
- Invoices, receipts, CPOs, counter-sale returns, and vendor receipts (MRNs) where the customer was the vendor.
- Party notes, adjustment batches, credit transactions and applications, outstanding letters, documents and service
  history.
- Members of a corporate group (`organizationId`).
- Customers merged into the duplicate earlier: their `mergedIntoId` now points at the survivor.

**Corporate group.** The survivor keeps its own group. If it has none, it joins the duplicate's group, so the group
does not lose a member. If both had different groups, the duplicate's group is dropped, and the audit entry records
it (`droppedOrganizationId`, or `joinedOrganizationId` when the survivor joined). If the survivor was a member of
the duplicate, it takes the duplicate's own group, because a customer cannot belong to itself.

Two things stay with the duplicate on purpose. Its portal login is disabled and its sessions are revoked, so the
login is not transferred. Its portal notifications stay with that disabled login. The duplicate is kept with
`mergedIntoId` set, and it drops out of lists and searches.

The `CUSTOMER_MERGE` audit entry records both ids and how many records of each kind moved.
`customer-merge.test.ts` reads `schema.prisma` and fails if a relation to Customer is neither moved nor listed as
kept. So a new customer-linked table cannot be forgotten.

**Which details survive** (`keep`, from the duplicate's page). Per group of fields, the survivor keeps its own
(`TARGET`, the default) or takes the duplicate's (`SOURCE`). The merge card shows the two values side by side for
each group that differs. Groups (`MERGE_FIELD_GROUPS` in `customer-merge-extras.ts`):

| Group | Fields |
| --- | --- |
| name | type, salutation, first and last name, company name, registered name, contact person |
| phone | phone, mobile 2, office 1 and 2, residence phone, STD code, fax |
| email | email (the duplicate gives it up first: email is unique) |
| address | address, house, street, zone, city, district, state, postal code, country |

The audit entry also stores `kept` and both records as they were (`before.source`, `before.target`: code, name,
phones, email, address).

**Merge history.** The surviving customer's page lists every customer merged into it, newest first: the
duplicate as it was, who merged it and when, what moved, and the details taken from it
(`GET /api/customers/:id/merge-history`, `customer:read`). Merges into a record that was later merged here are
included and marked. Merges made before 5 Nov 2026 have no "before" details; the duplicate is shown as it is now.

**Duplicate customers** (Customers → Duplicates, `/customers/duplicates`). Replaces the legacy utility's Bulk (XLS)
mode. Active customers are grouped by the same phone (last 10 digits, at least 7), the same name, or the same
company (`GET /api/customers/duplicate-groups?by=phone|name|company`), largest groups first, each member with its
vehicles, jobs and bills. In each group the record with the most history is proposed as the one to keep. Tick the
duplicates in as many groups as needed and merge them in one go (`POST /api/customers/merge-batch`, up to 100
pairs, Admin/SuperAdmin). Each pair is its own transaction: one failure (e.g. different Tally accounts) does not
stop the rest, and the result lists each failure. Bulk merges keep the survivor's own details; to take a
duplicate's details, merge that pair from the duplicate's page.

The legacy PDI correction mode (used once, in 2011) has no screen.

## Defect master

Legacy defects (`troublehead`) are the COMPLAINT list: code, description, vehicle group (which implies the vehicle
system), major defect and used in warranty / beyond warranty / both. The Kia warranty defect codes
(`WarrantyDefectCode`) are a separate list, entered on warranty claim lines.

On a job card the customer request text is what is recorded; the defect code is optional. Legacy staff typed the
request under the catch-all code `9999999` on about 97 % of 2025 requests, so those migrate as requests with no
code. Picking a defect (`/api/job-cards/defect-codes?vehicleId=`) fills an empty description and, when the
request has no amounts yet, the defect's estimate for the vehicle's workshop model.

The legacy "Estimate (user entered)" grid (`trouble`) is `DefectModelEstimate`: part, oil and labour amounts per
defect and model. Edit a defect on **Settings → Workshop Masters** to maintain it
(API `/api/workshop-masters/{defectId}/model-estimates/{modelId}`). The "Estimate (calculated)" grid and the
defect Part / Labour tabs are not carried over: their link tables (`troublepart`, `troublelabour`) are empty in
all three databases.

## Store location

A legacy store location (`storelocation`) is a branch: `code` (store code), `shortName` (legacy `ShortName`,
e.g. VI-2), name, address, and `parentBranchId` for a store within another branch's premises (legacy
`withinsamepremises`). VAT / RC numbers and stock-transfer-to/from are empty or unused.

## Terms and conditions

**Settings → Terms & Conditions** (`/settings/document-terms`, API `/api/document-terms`). One record per document
(job estimate, job card, job bill, parts quotation / order, counter sale, payment receipt) for the whole company,
and optionally one per branch that overrides it. Each holds numbered terms (up to 20) and a footer message.

| Legacy source | Document |
| --- | --- |
| Quotation Terms and Conditions Master (document "Job Estimate", per location) | JOB_ESTIMATE (per branch) |
| Control → Terms & Conditions: parts quotation 1–5, counter sale 1–4 | PARTS_QUOTATION, COUNTER_SALE |
| Control Freeze 3: job card 1–9, job bill 1–4 | JOB_CARD, JOB_BILL |
| Control Information: footer messages JC, JB, CS, Rcpt | footer of JOB_CARD, JOB_BILL, COUNTER_SALE, RECEIPT |

The effective terms and footer show at the end of the job estimate, job bill, counter sale and part-sale order
views and print with them.

## Not carried over

| Legacy screen | Reason |
| --- | --- |
| FA Codes Identification, Tally Control, Tax account tabs | Tally ledger mapping. Tally posting is deferred |
| Control: Freeze 1/2, Modification of Data | Desktop record locks. Document statuses and role permissions do this |
| Control: Control Status | "Last number" seeds. `DocumentSequence` does this |
| Control: Calculations Formula, Other charges 1–5 | Only the default formula chain and unnamed placeholder charges were ever set |
| Control: organisation / workshop information, service identification, margins, print settings | Company details live on branches; service roles are flags on the service master (free service, pre-delivery); print layout settings belong to the desktop reports |
| Colour Cost Master | Holds only 0 / 1 values; vehicle sales pricing, not workshop |
| Model Assembly Names | A handful of test values |
| Service Booking | One model only, every number 1 |
| Miscellaneous → Course, Employee course / labour tabs | Link tables are empty in all databases |
| Customer Banker/Financer, Contact Persons, Other Vehicles tabs | No real data in any database |
