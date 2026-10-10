# Parts Reports

The legacy Parts module report menus (part sale, part purchase, stock and MIS reports), rebuilt as one screen: **Operations → Parts Reports**.
Pick a report, set its filters, then **Run report**. Each run shows on screen, with **Print**
(A4 landscape) and **Export Excel**. Both follow the legacy register layout: report title, branch
and period, an S.No. column, group headings with subtotals, and a total line. The Excel file is a
real `.xlsx` with numbers, dates and number formats intact.

All reports share one API, `GET /api/parts-reports/:kind`, and one generic screen. Each report's
title, filters, options and columns are defined once, in
`server/src/modules/parts-report/partsReport.definitions.ts`.

## Reports

| Legacy report | Kind | What it shows |
|---|---|---|
| Counter Sales Register | `counter-sales` | Bill lines: part, qty, rate, cash discount, VAT, net (filters: customer, part filters) |
| Counter Sales Register Summary | `counter-sales-summary` | One line per bill, with round-off, outstanding and status |
| Counter Sales Tax Register (Datewise) | `counter-sales-tax-datewise` | Day totals of taxable and exempt value, VAT and net |
| Counter Sales Tax Register (Annexure) | `counter-sales-tax-annexure` | Bill-wise VAT with customer address; can list cancelled bills, which are never totalled |
| Counter Sales Return Register | `counter-sales-returns` | Returned lines at the bill's discount and VAT, with the credit note number |
| Counter Sales Cancellation Register | `counter-sales-cancellations` | Cancelled bills: All, Counter sales, or FOC (a 100% cash discount) |
| Counter Sale Revenue | `counter-sales-revenue` | Sales less returns by price category against dealer cost, with margin; optionally by customer |
| Sales Executive Wise Counter Sales Register | `sales-executive-register` | Bills grouped by sales executive, with subtotals |
| CPO Register | `cpo-register` | CPO lines with ordered, picked, billed, cancelled and pending; Pending, Cancelled or Executed (and only fully executed) |
| MRN Register | `mrn-register` | Vendor (Mobis) MRN lines grouped by vendor with subtotals, or **Summary (invoice wise)**: one line per MRN and supplier invoice (filters: vendor, MRN no., part filters) |
| Material In Transit Report | `mit-register` | Mobis MIT lines by case and order number: invoiced, received, damaged, short and still in transit, valued at the conversion rate; **All** or **Pending** (no MRN yet) |
| Checklist for Receipts | `receipt-checklist` | Every part received (vendor and branch-transfer MRNs) in bin order, for the store to check against the shelves |
| MRN / SRN Shortage Report, MIT and MRN Mismatch Report, BIT and SRN Mismatch Report | `receipt-shortage` | Receipt lines with damaged or short quantities: **MRN** (vendor receipts, with invoice, MIT and case) or **SRN** (branch transfers, with STN, packing list and case), valued at the receipt rate. Filter by vendor, and find a receipt by its MRN/SRN, MIT or STN number |
| Picking List Register | `picking-register` | Parts picked for indents, with bin, picker and any alternate supplied |
| STN/SRN Register | `stn-register` | STNs sent from the branch, or stock receipts (transfer MRNs) into it |
| Store Wise STN Register | `store-wise-stn` | STNs grouped by receiving branch, with subtotals |
| Branch Stock Indent Inward Register | `indent-inward-register` | Indents raised on the branch, line by line; Pending, Cancelled or Executed |
| Branch Stock Indent Outward Register | `indent-outward-register` | Indents the branch raised on other branches, with the same columns and order filter as the inward register |
| Branch In Transit Report | `branch-in-transit` | STN lines dispatched to the branch: sent, received, damaged, short and still on the way; **All** or **Pending** |
| Consumption Report (Consolidated), Consumption Summary (Consolidated) | `consumption` | Part-wise issued and transferred quantities, less returns (optional), at dealer rate. **Only summary** totals them by part category |
| Checklist for Issues | `issue-checklist` | Every issue in bin order, for the store to check against the shelves |
| SAN Register | `stock-adjustments` | Stock adjustments: Addition, Subtraction or All |

### Stock reports

The legacy **Stock Reports** menu. Reports marked *as on* take one date; *now* reports show today's stock.

| Legacy report | Kind | What it shows |
|---|---|---|
| Stock Ledger (Revised) | `stock-ledger` | Per part: opening balance, every receipt and issue with document, party and invoice, and the running balance. FIFO or dealer rate. An issue taken from receipts at different rates prints one line per rate, as on the legacy ledger |
| Stock Summary (Revised), Stock Value (On FIFO Basis) | `stock-summary` | Per part: opening, receipts, issues and closing, quantity and value. FIFO or dealer rate |
| Current Stock Balance, List of Opening Balances | `current-stock` | *As on.* Parts in stock with rate and value, at dealer rate (default) or FIFO. Run as on 31 December for the next year's opening balances |
| List of Zero Balance Items | `zero-balance` | *As on.* Parts the branch stocks with nothing in stock, and their consumption in the 12 months before the date |
| List of Slow Moving Items | `slow-moving` | *As on.* Parts in stock not issued for the given days (default 90), with the last issue date, at dealer rate |
| Ageing of Stock | `stock-ageing` | *As on.* Stock and value in six age bands from five day limits (default 1 to 5 years), at dealer rate (default) or FIFO |
| Negative Stock Balance Between Two Dates | `negative-stock` | Movements that left a balance below zero, with the shortfall at dealer rate |
| Inventory to Sales Ratio | `inventory-sales-ratio` | Per part: opening and closing stock value against sales at cost, and closing value ÷ sales. FIFO or dealer rate |
| Branch Wise Stock Report, Store Location Wise Current Stock | `branch-stock` | *Now*, every branch and store location: **Branch wise part value** (a line per branch, grouped by part) or **Total part value** (a line per part), with blocked and available stock, at dealer rate |
| BIN Location Wise Stock Report | `bin-location-stock` | *Now.* Stock in bin order; filter by bin |
| List of Parts Blocked | `parts-blocked` | Stock picked for CPOs (until billed) or branch indents (until the STN is made): **Document wise** with picker, or **Part wise** with stock, blocked and available |
| Item Unavailability Report | `item-unavailability` | Demand the branch could not supply: CPO quantities still unpicked and indent back orders, against free stock now |

**Not included:**

- The purchase order reports: **Pending Order (Vendor Wise / Order Wise, Part Wise)**, **Purchase Order
  List** and **Order History**. There are no purchase orders in the new system, and the legacy screen was
  not in use: the branches last raised a PO in 2009 and CPD raised one, in 2013. Mobis orders are placed
  outside the app; the Mobis order number on each MIT line is shown on the Material In Transit Report.
- **Receipt Summary (Invoice Wise)** is the MRN Register's **Summary (invoice wise)** option, not a
  separate report.
- The **Dispatch Challan Register**. Dispatch challans (internal fuel and consumable
issues) are not built yet; see [part-sale.md](./part-sale.md).

Stock reports merged or left out, so that no report repeats another:

- **Stock Value (On FIFO Basis)** has the same columns as the Stock Summary, so it is the Stock Summary on FIFO.
- **List of Opening Balances** is the Current Stock Balance as on 31 December. The legacy year-end
  opening (`PARTBAL.opnstock`/`opnamt`) is the closing stock carried forward, so the two match.
- **Branch Wise Stock Report** and **Store Location Wise Current Stock** were two copies of one list: the
  first read branch stock uploaded to CPD (`BranchStock`), the second the godowns in the same database.
  With one database, both are the Branch Wise Stock report.
- **Only Top Movers** (ledger and summary) is left out: it filtered on the part master's top-N flag, which
  the new part master does not have.
- **Part Type** is not a filter, as on the other reports (see below).

The legacy SAN register's **Only Deleted Records** option is also left out. No legacy SAN was
ever deleted (391 at the branches and 4 at CPD, none cancelled), and stock adjustments here
cannot be deleted.

### MIS reports

The legacy **MIS Reports** menu.

| Legacy report | Kind | What it shows |
|---|---|---|
| Minimum / Maximum Level Report, Items Falling Below Min. Level, Re-order Calculated vs Entered | `stock-levels` | *As on.* **Minimum / maximum level**: every part with levels, its stock and whether it is below minimum, above maximum or within. **Items falling below minimum level**: the shortfall and the quantity to order up to the maximum, at dealer rate. **Re-order calculated vs entered**: what was consumed over the given days (default 90) against the re-order quantity in Part Master |
| Maximum Consumed Parts | `max-consumed` | The top N parts (default 10) by quantity consumed: counter sales, workshop jobs and STNs, less returns, at dealer rate, with workshop issues split into five mileage bands. **Consumed by** one kind only, or all |
| Model Wise Mileage Wise Part Issue | `model-mileage-issue` | Workshop issues less returns, by vehicle model, split into five mileage bands |
| Profitability Statement, Profitability Statement Revised | `profitability` | Sale value against cost, by kind: counter sales, FOC bills, workshop jobs, PDI jobs, STNs and SANs; cost FIFO or at dealer rate. **Only summary** totals by part category |
| Percent Fill Report | `percent-fill` | Ordered against supplied, part by part: CPO quantities billed and branch indent quantities sent on STNs. **Order type** CPO, branch indent or all |
| Part Rate History | `part-rate-history` | Every dealer and retail rate set in Part Master, with date, time and user. **Changed retail rate**, **Changed dealer rate**, **Both**, or **Only deleted records** (parts deleted from Part Master) |
| Part BIN Location History | `part-bin-history` | Every bin change, with date, time and user: the branch's rack location, the Part Master bin, or both |
| Packing List Cum Gate Pass Report for STN | `packing-list-register` | Packing lists for STNs sent from the branch, **Branch**, **Courier name**, **Packing list date** or **Packing list no.** wise: each case and part, or with **Only summary** one line per packing list (gate pass, STN, mode, courier, waybill, cases, quantity, weight and value) |

MIS reports merged or left out, so that no report repeats another:

- **Items Falling Below Min. Level** and **Re-order Calculated vs Entered** had the same filters as the
  **Minimum / Maximum Level Report**; they are its options.
- **Profitability Statement Revised** had the same screen as the **Profitability Statement**.
- **MIT and MRN Mismatch** and **BIT and SRN Mismatch** are the MRN / SRN Shortage Report, and
  **Consumption Summary (Consolidated)** is the Consumption Report's summary (see above).
- **STN and Case Items Mismatch** is left out: an STN cannot be dispatched unless its cases hold exactly
  its quantities, so there is never a mismatch to list.
- **Log Report of Counter Sale / STN Editing** is left out: bills and STNs cannot be edited once posted.
  A bill can only be cancelled, and cancellations are on the Counter Sales Cancellation Register.
- **Part Enquiry** is Part Query (**Inventory → Part Query**), which also shows alternates and other branches.
- **Data Downloading** and **Data Uploading** (full part list and part master files between CPD and the
  branches) are left out: every branch works in the one database.
- **Only Top Movers** is left out, as on the stock reports, and so are the profitability's **With / without
  other cost** options: the legacy handling and other charge percentages were not in use (zero on every
  STN and job issue, and on all but a few branch counter-sale lines).

## Filters and rules

- **Purchase reports and vendors.** Today every vendor receipt is a Mobis MRN raised from its MIT at
  CPD. Direct vendor MRNs (CPD's non-Mobis vendors and the branches' local vendors) and MRN returns are
  not built yet. When they are, their MRNs appear on the MRN Register, the shortage report and the
  receipt checklist without changes, because these reports read every MRN that is not a branch transfer.
  Branch-transfer MRNs stay on the STN / SRN register.
- **Shortage, not excess.** A receipt line cannot be posted above the invoiced or sent quantity, so
  the shortage report shows damaged and short quantities only. In the legacy system, stock found over
  the invoice was received on a separate "EXCESS MRN" vendor MRN.

- **Dates** are Lagos calendar days. Every report defaults to 1 January of the current year
  through today.
- **Branch:** users with `inventory:cross-branch` can pick any branch or all branches. Everyone
  else always gets their own branch. CPD is a branch like any other.
- **Part filters**, matching the legacy filters:
  - **Part:** a single part
  - **Purchase source:** the legacy part flag (O, A, L, F)
  - **Part category:** the price category
  
  Legacy "part type" (spare, accessory, oil) is not a filter: 35,212 of the 35,233 CPD parts are
  spares, and oil is price category O.
- **Counter-sale values** are priced exactly as the bill was: cash discount first, then VAT on
  taxable parts. Line totals therefore equal the bill before its round-off to ₦10 below, and
  the round-off is shown on the summary and datewise reports.
- **Revenue and margin** use the dealer rate recorded on each bill line when it was billed
  (`InvoiceLine.unitCost`). Bills made before this field existed use the part's current dealer rate.
- **Permissions:** counter-sale and CPO reports need `partsale:read`. Picking, STN, indent,
  branch-in-transit and packing list reports need `transfer:read`. The purchase reports, consumption,
  issue checklist, SAN, the stock reports and the other MIS reports need `stock:read`. The menu lists only the reports the user can run.
- **Size limit:** the screen shows up to 5,000 lines, and the totals always cover every line.

### Stock reports

- **Stock movements** are what changes a branch's stock: MRNs, SRNs, returns, stock adjustments,
  counter sales, workshop issues and STNs (`StockTransaction`). Each is dated when it was posted.
- **Opening stock with no movement on record** (migrated or seeded stock) is taken to have been there
  before the first movement. It is valued at dealer rate and is the oldest stock for ageing.
- **FIFO**: the oldest units are issued first, so the stock left is always the newest receipts. Vendor
  MRNs come in at their receipt rate (invoice price × conversion rate), SRNs at the STN rate, and
  returns, additions and opening stock at the dealer rate. Issues are valued at cost. An issue with no
  stock to cost against goes out at value 0 ("All values in Issue are at Cost"), and the next receipt
  makes it good first.
- **Dealer rate**: every unit at the part's current dealer rate. There is no dealer-rate history, so a
  past date is valued at today's rate.
- **Include alternate parts**, with a part chosen, adds its main part and all its alternates.
- **Only transacted parts** (ledger and summary) leaves out parts with no movement in the period.
- **All branches** (cross-branch users) lists each branch under its own heading with subtotals. The
  ledger heads each part with its branch instead. Branch Wise Stock always covers every branch, as Part
  Query does.
- **Blocked stock** is stock picked for a CPO or an indent (`InventoryStock.reservedQuantity`). Indent
  back orders and unpicked CPO quantities are the unavailable demand.


### MIS reports

- **Stock levels.** A branch's own minimum and maximum (set on its stock location) are used where set;
  otherwise Part Master's. The re-order quantity is Part Master's. "Below minimum" is stock less than the
  minimum. The calculated re-order is what the period consumed (issues and STNs less returns; SANs are not
  consumption); the legacy default was three months, hence 90 days.
- **Mileage** is the job card's odometer reading. Five increasing limits make six bands (default 10,000,
  20,000, 40,000, 60,000 and 100,000 km); jobs with no mileage recorded have their own column. Counter
  sales and STNs have no mileage. The model is the vehicle's catalogue model, else the model typed on it.
- **Profitability.** Sale value is net of cash discount and before VAT: the bill rate for counter sales
  (a 100% discount bill is FOC), the job card line rate for workshop jobs (PDI jobs are those whose service
  type is pre-delivery), and the STN rate for STNs. SANs have no sale value. Cost is the stock ledger's, FIFO
  or dealer rate. Returns and stock additions reverse quantity, sale and cost; a return comes back into
  stock at dealer rate, as on the stock ledger. An issue with no bill or job behind it (seeded stock)
  is listed as **Other issue**, with no sale value.
- **Percent fill** counts CPOs and indents raised in the period on the branch. Supplied is what was billed
  (CPO) or sent on STNs (indent, including alternates). Quantities still open (an open CPO, or an indent
  still being approved, picked or back-ordered) are shown but not counted; fill % is supplied ÷ (supplied
  + not supplied).
- **Rate and bin history** start when this system went live: Part Master records each part added,
  re-rated or deleted, and each bin change, including parts created from a Mobis invoice. The rate history
  covers every branch (rates are the same everywhere). A Part Master bin change shows on every branch's bin
  history.

## Tests

`stockReport.logic.test.ts` covers FIFO and dealer-rate valuation without a database, using the CPD ball
joint ledger (an STN taken from receipts at ₦39,258 and ₦37,314). `stockReport.integration.test.ts` builds
opening stock, a Mobis MRN, an indent shipped on an STN and received as an SRN, a billed CPO, a back-ordered
indent and a negative SAN, and checks every stock report.

`misReport.integration.test.ts` re-rates a part and moves its bins, deletes a part, receives a Mobis MRN, ships
an STN with its packing list, bills one CPO and cancels another, issues to a workshop job (with a return) and a
PDI job, and writes off stock, then checks every MIS report.

`partsReport.integration.test.ts` builds counter sales (including a return and a cancelled FOC
bill), CPOs, two Mobis MITs (one received with a damaged and a short line, one still in transit),
an indent with its STN, an SRN and stock adjustments, and checks every report's rows and totals. It needs `TEST_DATABASE_URL` (see [stock-transfers.md](./stock-transfers.md#tests)).
