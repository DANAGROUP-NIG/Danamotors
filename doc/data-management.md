# Data Management

How the legacy Data Management screens map to the new system. Two of the five are needed as
screens: the three cancellation screens share one page, and Part List is an existing report.
Parts Posting is not needed.

| Legacy screen | New |
| --- | --- |
| Customer Purchase Order Cancellation | Data Management → **CPO Cancellation** (`/data-management/cpo-cancellation`) |
| Branch Indent From Other Branch Cancellation | Data Management → **Indent From Branch Cancellation** (`/data-management/indent-inward-cancellation`) |
| Branch Indent To Other Branch Cancellation | Data Management → **Indent To Branch Cancellation** (`/data-management/indent-outward-cancellation`) |
| Part List | Data Management → **Part List** opens Parts Reports → Current Stock Balance |
| Parts Posting | Not built. See [Parts Posting](#parts-posting) |

## Order cancellation

The legacy screens work the same way, and so does the page:

1. Choose the branch, and optionally the customer (CPO) or the other branch (indent), the document
   number and an order date range. Then choose **Fill orders**.
2. The page lists every order that still has something pending, with its lines: part, ordered quantity,
   pending quantity and picked quantity.
3. Tick lines. You can tick lines from several orders. Ticking an order ticks all of its lines, and
   **Select all** ticks every line on the page.
4. Enter a remark and choose **Cancel lines**. Confirm.

The whole pending quantity of each ticked line is cancelled. The legacy screens worked the same way.

| Screen | Whose orders | Pending quantity | Permission |
| --- | --- | --- | --- |
| CPO Cancellation | Open CPOs of the selling branch | Ordered − billed − cancelled | `partsale:order` |
| Indent From Branch Cancellation | Indents other branches raised on this branch (it supplies) | Before approval: requested − cancelled. After approval: approved − shipped | `transfer:cancel` |
| Indent To Branch Cancellation | Indents this branch raised on others | As above | `transfer:cancel` |

Branch users see only their own branch. Users with `inventory:cross-branch` choose the branch. For
CPOs and indents from other branches, the page starts at CPD.

### What a cancellation does

- **Picked stock is released.** On a CPO line, the picked quantity goes back to free stock. On an
  indent line, its lines on the open picking list are released and removed. If nothing is left on
  the picking list, the list is cancelled. Picks for other lines are not touched.
- **The line records the cancellation.** `cancelledQuantity` goes up by the pending quantity, and the
  line keeps `cancelledAt`, `cancelledBy` and `cancelRemark`, as legacy did with `cancelledQty`,
  `CancelDate`, `CancelBy` and `CancelRemark`. On an approved indent line, `approvedQuantity` drops to
  what has shipped, and the back order is cleared.
- **The order follows its lines.**
  - A CPO with nothing left to bill closes. If nothing was billed, it becomes Cancelled. If some was
    billed, it becomes Billed.
  - An indent with nothing shipped and nothing left becomes Cancelled.
  - Any other indent keeps or derives its status from its quantities: Picked, Approved, Partly
    dispatched, In transit or Completed. A note is added to its history.
- **The other side is told.** For indents, the requester and the store managers of both branches get
  a notification for each indent.
- A line cancelled before approval cannot be approved later. Approval allows at most requested −
  cancelled.

The existing single-document actions now use the same code. **Cancel** on a CPO, and **Cancel** and
**Close back order** on an indent, cancel every line. So their lines also record the cancelled
quantity, and the registers show it.

### Reports

- **CPO Register** already showed cancelled quantities. With the **Cancelled** filter, it lists lines
  with a quantity cancelled.
- **Branch Stock Indent Inward / Outward Register** now have a **Cancelled** column. With the
  **Cancelled** filter, they list lines with a quantity cancelled as well as cancelled and rejected
  indents.
- The indent screen has a **Cancelled** column. Hovering over the figure shows the remark.

### API

| Endpoint | Body / query |
| --- | --- |
| `GET /api/part-sale/orders/pending-lines` | `branchId`, `customerId?`, `from?`, `to?` (YYYY-MM-DD), `search?` (CPO number) |
| `PATCH /api/part-sale/orders/pending-lines/cancel` | `{ lineIds, remark }` |
| `GET /api/inventory/indents/pending-lines` | `direction` (`INWARD` / `OUTWARD`), `branchId`, `otherBranchId?`, `from?`, `to?`, `search?` (indent number) |
| `PATCH /api/inventory/indents/pending-lines/cancel` | `{ lineIds, reason }` |

Both lists return the same shape:
`{ orders: [{ id, number, date, status, party, lines: [{ id, partNumber, description, ordered, pending, picked }] }] }`.
A cancellation runs in one transaction. It locks the orders in ID order, so two users who cancel the
same orders at the same time do not deadlock.

### Legacy usage

- **CPO cancellation** is a CPD feature. CPDAutoEnhancer cancelled CPO lines every year from 2011
  to 2023, with bursts in 2012 and 2021. The branch database (AutoEnhancer) used it once, in 2013.
- **Indents from other branches** (`BranchIndentDetail.Ordertype = 'I'`, carrying `INDENTRECNO`):
  CPD cancelled lines every year up to 2024. Mostly whole lines that had not shipped, sometimes after
  part of the line had shipped or been picked. Typical reasons: "Purchased under PL-1", "Duplicate
  indent", "Wrong part indent", HHDC upload failures and "Manually issued". Legacy set `Qty` to 0
  and moved it to `cancelledQty`.
- **Indents to other branches** (`Ordertype = 'B'`): CPD cancelled 71 lines in 2013. The branches
  never used this screen. It is kept because it is the requesting side's way to withdraw what it no
  longer needs.
- ABJAutoEnhancer never used any of the three.

## Part List

The legacy Part List printed its **Current Stock List** from `PARTBAL` (current balance, category,
source, part range, "only those parts having stock"). Its quarterly **Physical Stock List** came from
the `physicalstock` table. That table was last filled in 2008 at the branch and never used at CPD.
**Computer Balances to be Printed** left the balance column blank so the list could serve as a count
sheet.

| Legacy option | New |
| --- | --- |
| Current Stock List | Parts Reports → **Current Stock Balance**, as on today: part category, purchase source (part flag), part, rate and value |
| Only those parts having stock unticked | **List of Zero Balance Items** for the parts without stock |
| Physical Stock List (quarterly), blank balances for counting | Stock Taking count sheets ([stock-taking.md](./stock-taking.md)), with or without system stock shown |

## Parts Posting

Legacy kept part balances in `PARTBAL`: one row per part per financial year, with the current stock
and the balances for each month (`q01`–`q12`). Each transaction updated these balances, but not
always: see the MRN store-code fault, where 2026 receipts never reached `PARTBAL`. Parts Posting
(from part, to part) rebuilt the balances from the transactions. **Update next year balances** carried
the closing stock into the next year's opening.

The new system has nothing to rebuild:

- Each stock change (receipt, issue, transfer, return, adjustment) updates `InventoryStock` and
  writes a `StockTransaction` in the same database transaction. The two cannot drift apart.
- Nothing is stored for each year or month. The stock reports work out the balance on any date from
  the transactions. Current Stock Balance as on 31 December is the next year's opening balance list.
