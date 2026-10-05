# Stock Transfers (CPD and inter-branch)

This is the workflow for moving existing stock from CPD or another branch to a requesting
branch. It replaces the legacy indent, picking list, STN, case, packing list, BIT and SRN
screens. Mobis purchasing (purchase request, MIT upload, MRN) is a separate process and is
not covered here. See issue #62.

**MIT is only for Mobis.** A transfer does not create a material-in-transit record: the goods
travel on the STN. When they arrive, the receiving branch generates an **MRN**, the same receipt
document used for Mobis, marked as a branch transfer.

The legacy system asked users to re-enter the same order at each stage. Here, users take
four actions and the system creates every document in between.

| Step | Who | Endpoint | What the system does |
| --- | --- | --- | --- |
| 1. Request | Requesting branch | `POST /api/inventory/indents` | Creates the indent with a number, prefills rate, amount and current stock from Part Master, fills vehicle details from a job card, and notifies the supplying branch and general store manager. |
| 2. Approve | Supplying branch | `PATCH /api/inventory/indents/:id/approve` | Records the approval, creates the picking list, reserves available stock, and puts the rest on back order. The general store manager is told about missing parts. |
| 3. Dispatch | Supplying branch | `PATCH /api/inventory/indents/:id/dispatch` | Creates the STN, cases and packing list in one transaction. It deducts source stock once and records `TRANSFER_OUT`. The goods are now in transit on the STN. |
| 4. Generate MRN | Requesting branch | `PATCH /api/inventory/indents/:id/receive` | Generates an MRN against the STN, posts good quantities to the requesting branch as `TRANSFER_IN`, and records damaged and short quantities. |

Every request body is optional except the indent itself and a rejection reason. An empty
approve, dispatch or receive call handles the common case: approve everything, ship
everything in one case, and receive everything in good condition.

## Statuses

```
DRAFT → SUBMITTED → APPROVED → PICKED → IN_TRANSIT → COMPLETED
                                              └──→ PARTIALLY_RECEIVED → COMPLETED
SUBMITTED → REJECTED
DRAFT | SUBMITTED | APPROVED | PICKED → CANCELLED   (reserved stock is released)
```

The status history also records the stages that happen inside dispatch and receipt:
`STN_CREATED`, `PACKED`, `DISPATCHED`, `MRN_CREATED` and `RECEIVED`. `GET /indents/:id`
returns a `progress` array built from that history, ready for a stepper.

An indent stays `APPROVED` when nothing was available to pick. `PATCH /indents/:id/pick`
retries picking once stock arrives.

## Stock rules

- **Reserve at picking.** Picked quantities move into `reservedQuantity`. Part issuance and
  the older transfer dispatch now check available stock, so they cannot use reserved units.
- **Deduct once at dispatch.** The indent status is claimed with a conditional update before
  any stock is touched. A second or concurrent dispatch fails with 409 and changes nothing.
- **Post once at receipt.** Receipts lock the indent row. Each STN line keeps running received,
  damaged and short totals, and a database check constraint stops a line from ever being
  received for more than was dispatched.
- **Partial receipts.** Each receipt generates its own MRN. The indent stays
  `PARTIALLY_RECEIVED` until everything is accounted for.
- **Shipping less than picked.** The unshipped difference is released and added to the
  line's back order.
- **Damaged items** are recorded on the MRN but not added to stock. `closeShort: true`
  records anything still outstanding as missing and closes the transfer.

## Alternate parts

On approve or pick, set `supplyPartId` on a line to send an alternate from the same
main-and-alternate family. The picking list and STN lines both keep
`requestedPartId` and the supplied `partId`, plus an `isAlternate` flag.
`GET /indents/part-lookup` lists the alternates with their stock at the supplying branch.

## Documents

Documents are created only by the four actions. These endpoints are read-only:
`/picking-lists`, `/stn`, `/cases/:id`, `/packing-lists/:id` and `/transfer-mrns`.
A transfer MRN has `source = BRANCH_TRANSFER` and points to the STN and the supplying branch;
a Mobis MRN has `source = MOBIS` and points to its MIT. A database check keeps the two apart.

Document numbers follow the legacy format: the year followed by six digits, such as
`2026000132`. Each document type has its own counter in `DocumentSequence`. When legacy
documents are migrated, set each counter to the highest migrated number for that year so
new numbers do not collide.

## Notifications

Dashboard notifications only. There is no XLS download and no email step. Each person gets
one notification per event, even if they qualify through more than one role.

| Event | Recipients |
| --- | --- |
| Indent submitted | Supplying branch store managers, general store managers |
| Indent approved or rejected | Requester, requesting branch store managers |
| Missing parts (back order) | General store managers |
| Picking list ready | Supplying branch store managers |
| Dispatched (STN, cases, packing list and MIT in one message) | Requester, requesting branch store managers |
| MRN generated or transfer received | Supplying branch store managers, general store managers |
| Damaged or short quantities | General store managers |
| Indent cancelled | Requester, and supplying branch store managers if it was already submitted |

## Permissions and branch access

The existing transfer permissions apply: `transfer:create`, `transfer:approve`,
`transfer:reject`, `transfer:cancel`, `transfer:dispatch`, `transfer:receive` and
`transfer:read`. Branch users can create, submit and receive only for their own branch.
They can approve, pick, reject and dispatch only when their branch is the supplier. Users
with `inventory:cross-branch` and super admins can act on any branch.

## Legacy mapping

| Legacy | New |
| --- | --- |
| `BranchIndentDetail` (orderid, UrgentQty, Qty, BackOrdQty, Rate, VIN, Registrationno, Model, Jobno, JobDate, AuthorisedBy, ApprovalDate, partflag) | `BranchIndent` and `BranchIndentLine` |
| `PickingHead`, `PickingDetail` | `PickingList`, `PickingListLine` |
| `countersale` with trantype `M`, and `csissue` (parts STN) | `StockTransferNote`, `StockTransferNoteLine` |
| `CaseHeader` and `CaseDetail` with trantype `CB` | `TransferCase`, `TransferCaseLine` |
| `CaseHeader` with trantype `PB` (PackId, WayBillNo, CourierName, ConsignmentWeight) | `PackingList` |
| `branchInTransithead`, `branchInTransitDetail` (PartOrdered vs PARTNO, QTYRECIEVED, QtyRejected) | The STN and its lines: the received, damaged and short totals on `StockTransferNoteLine` |
| SRN number on the BIT tables | `MaterialReceiptNote` with `source = BRANCH_TRANSFER` (the legacy system used SRN; this project uses MRN for every receipt) |

The legacy `STN` and `SRN` tables hold vehicle transfers (VIN, engine and key numbers), not
parts, so they are not part of this mapping.

## Tests

`stockTransfer.logic.test.ts` covers the business rules without a database. The database
tests in `stockTransfer.integration.test.ts` run the full flow, including races and partial
receipts. They are skipped unless `TEST_DATABASE_URL` points at a separate, migrated
database:

```bash
cd server
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest
```
