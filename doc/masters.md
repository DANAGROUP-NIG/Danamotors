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
documents. Salary (filled for a handful of rows) is not kept: payroll is not part of this system.

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
part type, dealer and retail rate, price category, tax category / form, min / max / reorder, warranty), the form's
**Classification and ordering** section keeps the remaining legacy `partmast` fields:

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

## Defect master

Legacy defects (`troublehead`) are the COMPLAINT list: code, description, vehicle group (which implies the vehicle
system), major defect and used in warranty / beyond warranty / both. Legacy jobs (`jobtrouble`) reference these
codes. The Kia warranty defect codes (`WarrantyDefectCode`) are a separate list for warranty claims.

The legacy "Estimate (user entered)" grid (`trouble`) is `DefectModelEstimate`: part, oil and labour amounts per
defect and model. Edit a defect on **Settings → Workshop Masters** to maintain it
(API `/api/workshop-masters/{defectId}/model-estimates/{modelId}`). The "Estimate (calculated)" grid and the
defect Part / Labour tabs are not carried over: their link tables (`troublepart`, `troublelabour`) are empty in
all three databases.

## Not carried over

| Legacy screen | Reason |
| --- | --- |
| FA Codes Identification, Tally Control, Tax account tabs | Tally ledger mapping. Tally posting is deferred |
| Control: Freeze 1/2, Modification of Data | Desktop record locks. Document statuses and role permissions do this |
| Control: Control Status | "Last number" seeds. `DocumentSequence` does this |
| Control: Calculations Formula, Other charges 1–5 | Only the default formula chain and unnamed placeholder charges were ever set |
| Colour Cost Master | Holds only 0 / 1 values; vehicle sales pricing, not workshop |
| Model Assembly Names | A handful of test values |
| Service Booking | One model only, every number 1 |
| Miscellaneous → Course, Employee course / labour tabs | Link tables are empty in all databases |
| Customer Banker/Financer, Contact Persons, Other Vehicles tabs | No real data in any database |
