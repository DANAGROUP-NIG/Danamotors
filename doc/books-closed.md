# Books closed (year end)

Settings → **Books closed** (`/settings/books-closed`) sets the date up to which finance and stock entries
are locked. It replaces legacy **Year End**, which froze each closed year (`Fayear.FinancialYearFreezed`).

- **Financial year: January–December.** Legacy writes the year as `20252026`, but in all three databases that
  year holds documents dated 2 January to 31 December 2025.
- **No carry-forward.** Legacy Year End also created next year's number series and opening stock and party
  balances. Here numbering restarts each calendar year by itself, and balances are computed from
  transactions, so only the lock is needed.

## The dates

| Date | Where | Effect |
| --- | --- | --- |
| Company | `FinanceSetting` key `booksClosedUpTo` = `{ "date": "2025-12-31" }` | Every branch is closed up to it |
| Branch (optional) | `BranchSettings.booksClosedUpTo` | A later date for one branch, e.g. one that finishes its year end first |

A branch is closed up to the **later** of the two (`books_closed_up_to(branchId)` in SQL). Dates are
Africa/Lagos calendar dates: 31 Dec 23:30 UTC is already 1 January in Lagos.

## Who

`books:close`, held by SuperAdmin only. It is admin-level, so only a SuperAdmin can grant it to another user
(see [roles-and-permissions.md](./roles-and-permissions.md)). Any signed-in user can read the dates
(`GET /api/books-closed`).

- **Closing** (a later date): only past days, never today. Before saving, the screen lists what is still
  open on or before the date: STNs not fully received, MITs not fully received, stock takes in progress,
  bills and receipts not posted to Tally. They can still be completed after closing, but not cancelled or
  edited.
- **Reopening** (an earlier date, or none): needs a reason.
- Both write an event in Settings → Audit log → Events: `BOOKS_CLOSED` or `BOOKS_REOPENED`, with scope
  (company or branch), old and new date, and the reason. The dates themselves are also in the change log
  (FinanceSetting, BranchSettings).

## What is refused

Database triggers (`books_closed_guard()`, migration `20261105160000_books_closed`) check every write, so no
screen, script or import can get round them except as below. On a row dated on or before its branch's
closed date:

- **insert**: refused (no back-dated entry);
- **delete**: refused;
- **update**: refused if it changes the date, branch, party, amounts or cancellation (the columns listed per
  table below); other columns still change;
- an open row cannot be re-dated into a closed period.

| Table | Document date | Locked columns |
| --- | --- | --- |
| Invoice (job bills, counter sale bills) | `issuedDate` | date, customer, all totals, discounts, VAT, round-off, `cancelledAt` |
| Receipt | `issuedAt` | date, branch, customer, invoice, amount, mode, category, bank, cheque, `cancelledAt` |
| Payment | `paymentDate` | date, invoice, amount, method |
| PartyNote (debit / credit notes, openings) | `date` | date, branch, customer, direction, type, amount, `cancelledAt` |
| PartyAdjustmentBatch | `date` | date, branch, customer, amount, `reversedAt` |
| ReceiptAllocation | `adjustedAt` | date, amount, what it settles, `reversedAt` |
| StockTransaction (the stock ledger) | `createdAt` | everything that moves stock |
| PartIssuance | `issuedAt` | date, branch, part, quantity, job card |
| PartReturn | `returnedAt` | date, issue, quantity, rate, amount |
| CounterSaleReturn | `returnDate` | date, branch, all amounts |
| MaterialReceiptNote (MRN) | `receiptDate` | date, branch, received / damaged / short, value |
| StockTransferNote (STN) | `documentDate` | date, branches, quantity, value, cancelling |
| MaterialInTransit (MIT) | `transitDate` | date, branch, quantity, amount, `cancelledAt` |
| PartRequisition | `requisitionDate` | date, branch, charge type, `cancelledAt` |
| PartReturnSlip | `returnDate` | date, branch, `cancelledAt` |

**Still allowed** on closed documents, because open-period work touches them: an invoice's outstanding
amount and status (a new receipt settles an old bill), receiving an STN or MIT, approving an MRN shortage,
Tally posting fields, notes. Line tables (invoice lines, MRN lines) have no trigger of their own: every
change to lines also changes the locked totals on the head.

Not covered: job cards, estimates, labour slips, customer orders and indents (service and ordering
documents, not books), and stock takes (their adjustments are stock ledger rows, which are covered).

## The error

The trigger raises `BOOKS_CLOSED: The books are closed up to 31 Dec 2025. This receipt is dated 15 Dec
2025; a closed period cannot get new entries.` The error handler returns it as **409** with
`code: "BOOKS_CLOSED"` and that sentence as the message, so every screen shows it as it does other errors.

## Maintenance scripts

A script (never the API) may run `SET LOCAL app.books_closed_bypass = 'on'` in its transaction, for example
to load legacy history into closed years. The change log records such changes as made outside the app.
Prefer reopening with a reason.

## Not built

- A frozen year-end snapshot (closing stock value and party balances saved as files when closing). The
  reports can be run for 31 December at any time, because they are computed from transactions that the
  lock now keeps unchanged.
