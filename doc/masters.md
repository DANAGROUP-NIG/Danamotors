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
| Service | SERVICE_TYPE | — | see the service screen |
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
