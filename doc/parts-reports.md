# Parts Reports

The legacy Parts module report menus (part sale, part purchase and stock reports), rebuilt as one screen: **Operations → Parts Reports**.
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
| MRN / SRN Shortage Report | `receipt-shortage` | Receipt lines with damaged or short quantities: **MRN** (vendor receipts, with invoice, MIT and case) or **SRN** (branch transfers, with STN, packing list and case), valued at the receipt rate |
| Picking List Register | `picking-register` | Parts picked for indents, with bin, picker and any alternate supplied |
| STN/SRN Register | `stn-register` | STNs sent from the branch, or stock receipts (transfer MRNs) into it |
| Store Wise STN Register | `store-wise-stn` | STNs grouped by receiving branch, with subtotals |
| Branch Stock Indent Inward Register | `indent-inward-register` | Indents raised on the branch, line by line; Pending, Cancelled or Executed |
| Branch Stock Indent Outward Register | `indent-outward-register` | Indents the branch raised on other branches, with the same columns and order filter as the inward register |
| Branch In Transit Report | `branch-in-transit` | STN lines dispatched to the branch: sent, received, damaged, short and still on the way; **All** or **Pending** |
| Consumption Report (Consolidated) | `consumption` | Part-wise issued and transferred quantities, less returns (optional), at dealer rate |
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
- **Permissions:** counter-sale and CPO reports need `partsale:read`. Picking, STN, indent and
  branch-in-transit reports need `transfer:read`. The purchase reports, consumption, issue checklist,
  SAN and the stock reports need `stock:read`. The menu lists only the reports the user can run.
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

## Tests

`stockReport.logic.test.ts` covers FIFO and dealer-rate valuation without a database, using the CPD ball
joint ledger (an STN taken from receipts at ₦39,258 and ₦37,314). `stockReport.integration.test.ts` builds
opening stock, a Mobis MRN, an indent shipped on an STN and received as an SRN, a billed CPO, a back-ordered
indent and a negative SAN, and checks every stock report.

`partsReport.integration.test.ts` builds counter sales (including a return and a cancelled FOC
bill), CPOs, two Mobis MITs (one received with a damaged and a short line, one still in transit),
an indent with its STN, an SRN and stock adjustments, and checks every report's rows and totals. It needs `TEST_DATABASE_URL` (see [stock-transfers.md](./stock-transfers.md#tests)).
