# Part Sale (CPD counter sales)

How CPD sells parts to customers. This replaces four legacy Part Sale screens in
CPDAutoEnhancer: Customer Purchase Order, Pick List for Counter Sale/Challan, Counter Sale and
Counter Sale Return.

The legacy system asked users to retype the order on each screen. Here, users take three
actions and the system carries the order through:

| Step | Screen | What happens |
| --- | --- | --- |
| 1. Customer purchase order | Part Sale → Customer Orders → **New CPO** | Choose the customer and parts. Rates come from the Part Master retail rate. "Pick free stock now" reserves what is available. |
| 2. Pick | CPO detail → **Pick free stock** | Reserves free stock for open lines at any time. **Release picked** gives it back. |
| 3. Bill | CPO detail → **Bill**, or Counter Sales → **New counter sale** | Bills ticked lines from one or more of the customer's open CPOs. Picked units are issued first, then free stock. |
| 4. Return | Bill detail → **Sale return** | Puts the parts back into stock and credits the customer. |

## Pricing

The legacy CPD bills and returns use the following formula. The unit tests check it against
real CPD bills.

```
line gross     = quantity × retail rate
cash discount  = gross × cash discount %         (one % for the whole bill)
VAT            = (gross − discount) × 7.5%       (taxable parts only)
net amount     = Σ (gross − discount + VAT), rounded DOWN to the nearest ₦10
```

- The cash discount can be entered as a percentage or as an amount. An amount is converted to
  the percentage it represents (legacy `CashDiscAmtorPer`), because CPD often sells at a
  negotiated price. A 100% discount gives a free-of-charge bill.
- Handling charges are not applied. Every CPD bill since 2022 has 0% handling.
- A return is priced like the bill line it reverses, with the same discount % and VAT, and
  the same ₦10 rounding.

## How it fits the rest of the system

- **The bill is an `Invoice`** with no job card, numbered `CS` + year + six digits (for example
  `CS2026000010`). The prefix keeps it apart from job bills, which share the invoice number
  space. Receipts, outstanding, party ledgers, outstanding letters and the invoice screen all
  treat it as an ordinary bill. `reportBranchId` is the selling branch (CPD is a branch like any
  other), so receipts are taken at that branch, and the invoice list, payments, finance summary,
  invoice report and dashboard all count the bill there (`branchScope` in `finance.repository.ts`).
  Receipts for counter-sale bills go in the Service and parts register, as for job bills (legacy
  "Service and Parts" receipts). The legacy parts module had no receipt logic of its own: it
  shared the Service receipt screens, and CPD took no receipts in the legacy system.
- **Tally**: counter-sale bills are exported as Sales vouchers. They use the job-bill
  mappings: `PARTS_SALES`, `PARTS_DISCOUNT`, `VAT` and `ROUND_OFF`.
- **Returns** create a credit note with type `SALE_RETURN`. The credit note is set off
  against the bill's outstanding through a party adjustment with source `SALE_RETURN`. If the
  credit is larger than what is still due, the rest stays as customer credit. These credit
  notes are not yet exported to Tally (`tallyExcluded`); see "Not yet built".
- **Stock**: picking increases `reservedQuantity`. Billing deducts stock and writes an `ISSUED`
  transaction. Returns and bill cancellations add stock back and write a `RETURNED`
  transaction.

## Rules

- **One customer and one selling branch per bill.** A bill may combine lines from several CPOs.
- **Sales executive** (legacy Counter Sale dropdown, filled on most CPD bills): chosen from the
  active staff of the selling branch. It defaults to the user who bills.
- **No overselling.** A line can be billed only up to its picked quantity plus free stock.
  Database checks stop a CPO line from picking, billing or cancelling more than was ordered,
  and stop a bill line from being returned more than once.
- **CPO status** follows the lines: Open, then Partly billed, then Billed. Cancelling a CPO
  cancels whatever is still open and releases any picked stock. Lines already billed stay
  billed. Data Management → **CPO Cancellation** cancels chosen lines across several CPOs
  with one remark (see [data-management.md](./data-management.md)).
- **Cancelling a bill** is allowed only when it has no receipts, allocations, returns or Tally
  posting. The stock goes back, and the CPO lines can be billed again.
- **Who can sell to whom**: any active party can buy, whichever branch registered it.
  Users without `inventory:cross-branch` can work only at their own branch.

## Permissions

| Permission | Allows | Default roles |
| --- | --- | --- |
| `partsale:read` | View CPOs, counter sales and returns | Admin, store managers, Accountant, Billing Officer |
| `partsale:order` | Create, pick, release and cancel CPOs | Admin, General and Branch Store Managers |
| `partsale:bill` | Create and cancel counter-sale bills | Admin, store managers, Accountant, Billing Officer |
| `partsale:return` | Record sale returns | Admin, store managers, Accountant, Billing Officer |

## API

All endpoints are under `/api/part-sale`: `GET /customers`, `GET /parts`, `GET /sales-executives`,
`GET|POST /orders`, `GET /orders/:id`, `PATCH /orders/:id/pick|release|cancel`,
`GET|POST /counter-sales`, `GET /counter-sales/:id`, `PATCH /counter-sales/:id/cancel`,
`POST /counter-sales/:id/returns` and `GET /returns`. Request examples are in Swagger under
"Part Sale".

## Legacy mapping

| Legacy (CPDAutoEnhancer) | New |
| --- | --- |
| `CUSTOMERORDERHEAD` / `customerorderdetail` with OrderType `C` | `CustomerOrder`, `CustomerOrderLine` |
| `QtyPicked`, HHDC `CPO` picking downloads, `PickingHead` | `CustomerOrderLine.pickedQuantity` and reserved stock; picking on the handheld: [handheld.md](./handheld.md) |
| `countersale` with trantype `C` | `Invoice` + `CounterSale` (despatch mode, transporter, GR no./date, cases, sales executive) |
| `csissue` with trantype `C` (`OrderNo` = CPO) | `InvoiceLine` with `customerOrderLineId` and `vatPercent` |
| `csrethead` / `csretdetail` | `CounterSaleReturn`, `CounterSaleReturnLine`, and a `SALE_RETURN` credit note |

The rest of the legacy data is covered elsewhere or not included:

- OrderType `I` CPOs and counter-sale trantypes `M` and `R` are branch orders and STNs. The
  [stock transfer](./stock-transfers.md) workflow covers them.
- **Dispatch Challan** and **Challan Return** are built as their own module; see
  [Dispatch challans](#dispatch-challans) below.

## Dispatch challans

Legacy AutoEnhancer **Dispatch Challan** and **Dispatch Challan Return** (`challanhead`/`challandetail`,
`ChallanRetHead`/`ChallanRetDetail`). A challan is an unbilled issue of fuel and consumables to an
internal cost centre. Kia Plaza issues about 1,100 a year from stores A and QS: petrol and diesel
make up 90% of them, then software, cotton waste, oil and gloves. They go to the KP associate vehicles,
customer vehicles, PDI, KP1 admin, Allen 5, VI showroom, the workshop groups, UVAL, Dana Air and the gensets.
In all three legacy databases, one challan was ever billed (CPD, 2016).

Group units that Lagos used to "bill" on a counter sale without VAT (tax form X: diesel engine oil
to Allen 5, Ilupeju and Dana Air) are issued on a dispatch challan instead. Counter sales stay
customer sales with VAT.

| Step | Screen | What happens |
| --- | --- | --- |
| Issue | Part Sale → Dispatch Challans → **New challan** | Choose the cost centre (a party, searched by code or name) and the parts. Each line takes free stock (on hand less reserved) out of the branch at the part's retail rate. The challan gets a number (`2026000001`) and a gate pass from the shared series. |
| Return | Challan detail → **Challan return** | Return chosen quantities, or **Full return** for everything still out. The stock goes back at the challan's rate. |

- **API**: `/api/dispatch-challans`: `GET|POST /`, `GET /:id`, `POST /:id/returns`, `GET /returns`,
  and the pickers `GET /cost-centres` and `GET /parts`.
- **Permissions**: `challan:read` (Admin, store managers, Accountant, Auditor), `challan:issue` and
  `challan:return` (Admin, General and Branch Store Managers).
- **Stock**: the challan writes `ISSUED` stock transactions and the return `RETURNED`, with the
  challan or return id as the reference. A database check stops a line returning more than it issued.
- **Reports**: the **Dispatch Challan Register**; a **Challans** section on the Checklist for Issues
  (legacy CHALLAN section); the Consumption Report's consumable issue column, at the challan's rate.
- **Migration**: no challan history is migrated. The cost centres on challans from the last five
  years are migrated as parties, so they can be chosen at go-live.
- **Not built**: cancelling a challan (legacy never cancelled one; a full return undoes it), the
  and the pick list for challans.
- **Print**: the challan prints as a formal document (company and branch header, challan number,
  date and gate pass, the cost centre, lines, returns so far, and signature lines for the store,
  the receiver and security). `ChallanPrint.tsx`.

## Printing

Print on a counter sale prints the bill (`CounterSalePrint.tsx`): company name, TIN and RC number
(Settings → Company) with the branch address and phone; bill number, date, gate pass and due date;
the customer; CPO, customer reference, sales executive and despatch details; the lines with VAT %;
gross, cash discount, VAT, round-off and net amount, with the amount in words; the COUNTER_SALE terms
(Settings → Terms & Conditions); and signature lines. A cancelled bill prints as cancelled. On screen
the page is unchanged; the print layout shows only on paper. The header, amount in words and
signatures are shared in `client/components/print/`.

## Not yet built

- Tally export of sale-return credit notes. Someone in accounts needs to decide which ledger
  a sale return posts to.

## Tests

`partSale.logic.test.ts` reproduces legacy CPD bill 2026000010 and returns 2025000003–5 to the
naira. `partSale.integration.test.ts` runs the full flow against a database. It is skipped
unless `TEST_DATABASE_URL` is set (see [stock-transfers.md](./stock-transfers.md#tests)).
