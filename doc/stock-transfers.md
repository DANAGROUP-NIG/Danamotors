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
| 3. Dispatch | Supplying branch | `PATCH /api/inventory/indents/:id/dispatch`, or `POST /api/inventory/stn/dispatch` for several indents | Creates the STN, cases and packing list cum gate pass in one transaction. It deducts source stock once and records `TRANSFER_OUT`. The goods are now in transit on the STN. |
| 4. Generate MRN | Requesting branch | `POST /api/inventory/stn/:id/receive` (or `PATCH /api/inventory/indents/:id/receive` with `stnId`) | Generates an MRN against the STN, posts good quantities to the requesting branch as `TRANSFER_IN`, and records damaged and short quantities. Every indent on the STN is updated. |

CPD works this way in the legacy data (CPDAutoEnhancer, 2024 to 2026), and the workflow follows it:

- **Split deliveries.** 38% of indents ship over two or more STNs as stock arrives, on average 70 days
  apart. Whatever is not picked or not shipped stays on the indent's back order. **Pick back order**
  (`PATCH /indents/:id/pick`) reserves it again, and the next dispatch creates another STN. When stock
  arrives at the supplier (Mobis MRN or transfer receipt), the supplier is told which back orders it can now pick.
- **Cancel lines.** Data Management → **Indent From / To Branch Cancellation** cancels what is still to
  supply on chosen lines, across several indents, with one reason (legacy `cancelledQty`). The line
  records the cancelled quantity, who and why; see [data-management.md](./data-management.md).
- **Close back order.** `PATCH /indents/:id/close` with a reason stops supplying the rest of a partly
  shipped indent. Any open pick is released, and the indent completes once its STNs are received.
- **Several indents on one STN.** 30% of CPD STNs carry two or more indents of the same branch (legacy
  Pick List "Fill Orders"). **Dispatch to branch** ships every picked indent you tick on one STN, in one
  case, with one gate pass.
- **Direct STN.** 10% of CPD STNs have no indent, such as the monthly Microcat Live recharge, and Kia Plaza
  and Abuja send direct STNs only. `POST /api/inventory/stn/direct` sends free stock from any branch to any
  branch with a stated purpose. The branch is notified and receives it with an MRN like any other STN.
  **Any part source can go on a direct STN**, including local (L), used (U) and repaired (R) records: Kia Plaza
  sent 1,996 local-part lines on direct STNs since 2021 (to VI, QS, UG and CPD). The direct STN part search
  passes `allSources=true`; indents to CPD still refuse branch-bought sources (CPD supplies Mobis parts).
- **Cases.** Every dispatch (single indent, Dispatch to branch, Direct STN) can split the goods into several
  cases with a weight each (legacy Case Creation; 23 of 4,776 CPD STNs since 2021). Left alone, everything
  goes in one case. The packer is chosen from the supplying branch's current employees (the handheld picker
  list, `GET /api/handheld/pickers`), or typed.

## Tax form and VAT

Each STN carries a legacy tax form, chosen per STN from a dropdown: **X** (transfer without VAT, the default;
99.8% of legacy STNs), **L**, **Z**, **Y** or **P**. Under **L** and **Z** the STN charges 7.5% VAT on taxable
parts, as legacy did (ABJ 2021000132 and 2025000027, CPD 2023000616); X, Y and P carry none. The STN keeps
`totalValue` (goods at the dealer rate) and `taxAmount` separately, and prints the net amount. The receiving
branch's MRN books the goods **without** the VAT, as legacy did: CPD received ABJ's VAT STN 2025000027 at
₦78,477.11 on form X. The rule matches legacy's tax master (`ctaxmast`) in all three databases. STN VAT is printed
only; nothing posts it to accounts yet (Tally is deferred).

## Cancel or change an STN (before any MRN)

Legacy let the sending branch cancel or edit an STN until it was received (cancelled: CPD 2022 and 2024, Lagos
2022, Abuja 2021; edited: Lagos 13 times in 2025). Both need `transfer:dispatch` at the sending branch, and
both are refused once the receiving branch has generated any MRN.

- **Cancel** (`PATCH /api/inventory/stn/:id/cancel`, `{ reason }`): the stock goes back to the sender, indent
  lines go back on back order (the indent returns to Approved and can be picked again), and the cases, packing
  list and gate pass become void. The STN keeps its number with status Cancelled. A positive `TRANSFER_OUT`
  movement offsets the dispatch, so stock and consumption reports net to zero. The receiving branch and the
  requesters are notified.
- **Change** (`PATCH /api/inventory/stn/:id/edit`, `{ reason, taxForm?, lines?: [{ stnLineId, quantity }] }`):
  the legacy edit of the issued quantity and tax form. Extra units come from the indent line's back order (or
  free stock on a direct STN); fewer go back to it. A line set to 0 leaves the STN; every line at 0 is refused
  (cancel instead). Cases follow: extra units go into the first case holding the part, removed units come out
  of the last case first, and an emptied case is removed. VAT is worked out again. Each change is kept in
  `StockTransferNoteEdit` (legacy `CSSTNEditLog`) and shown on the STN.
- After a **closed back order**, cancelling or reducing the STN puts those units back on back order (the indent
  reopens); the units written off when the back order was closed stay closed.
- An edit and a handheld pick of the same indent lock the indent row and run one after the other.

## Printed documents

The STN page prints the **STN** (the paper that travels at Kia Plaza and Abuja: both branches with addresses,
indents, tax form, lines at the dealer rate, VAT, net amount in words, signatures) and the **packing list cum
gate pass** (CPD: gate pass number, courier, waybill, courier date, weight, and each case with its packer and
contents). The indent page prints the **pick list** in bin order with a blank Picked column, the paper fallback
when the handheld is not used. A cancelled STN prints as cancelled and its gate pass as void. All three use the
shared print pieces in `client/components/print/`.

Every request body is optional except the indent itself and a rejection reason. An empty
approve, dispatch or receive call handles the common case: approve everything, ship
everything in one case, and receive everything in good condition.

On the Stock Transfers list, **To supply** shows the indents other branches raised on your branch (legacy
Branch Indent From Other Branches) and **Requested** the ones your branch raised.

## Statuses

```
DRAFT → SUBMITTED → APPROVED → PICKED → IN_TRANSIT → PARTIALLY_RECEIVED → COMPLETED
                                    │   ▲
                                    ▼   │ pick back order
                             PARTLY_DISPATCHED ──(close back order)──► IN_TRANSIT / COMPLETED
SUBMITTED → REJECTED
DRAFT | SUBMITTED | APPROVED | PICKED → CANCELLED   (only before anything ships; reserved stock is released)
```

The status history also records the stages that happen inside dispatch and receipt:
`STN_CREATED`, `PACKED`, `DISPATCHED`, `MRN_CREATED` and `RECEIVED`. `GET /indents/:id`
returns a `progress` array built from that history, ready for a stepper.

After approval the status follows the quantities: `PICKED` while a picking list is open,
`PARTLY_DISPATCHED` while part of the approved quantity is still to ship, then `IN_TRANSIT`,
`PARTIALLY_RECEIVED` and `COMPLETED` as the STNs are received. An indent stays `APPROVED` when
nothing was available to pick. `PATCH /indents/:id/pick` retries once stock arrives.

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
  line's back order, to go on a later STN.
- **One open pick per indent.** A partial unique index allows only one `OPEN` picking list per
  indent. Each indent line tracks `dispatchedQuantity`, and a check keeps it within the approved quantity.
- **Damaged items** are recorded on the MRN but not added to stock. `closeShort: true`
  records anything still outstanding as missing and closes the transfer.

## Alternate parts

On approve or pick, set `supplyPartId` on a line to send an alternate from the same
main-and-alternate family. The picking list and STN lines both keep
`requestedPartId` and the supplied `partId`, plus an `isAlternate` flag.
`GET /indents/part-lookup` lists the alternates with their stock at the supplying branch.

## Documents

Documents are created only by the actions above. These endpoints are read-only:
`/picking-lists`, `/stn`, `/stn/:id`, `/cases/:id`, `/packing-lists/:id` and `/transfer-mrns`.
Each packing list carries a gate pass number from the shared gate pass series (legacy "Packing
List cum Gate Pass"), the courier, waybill, consignment weight and courier date (legacy Courier Date; the
dispatch date when left blank). The picking list records the picker's name.
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
| Dispatched (STN, cases, packing list and gate pass in one message, naming every indent on the STN and any back order still to come) | Requesters, receiving branch store managers |
| Direct STN dispatched | Receiving branch store managers |
| Stock arrived for a back order | Supplying branch store managers, general store managers |
| Back order closed | Requester, requesting branch store managers |
| MRN generated or transfer received | Supplying branch store managers, general store managers |
| Damaged or short quantities | Users who may approve the shortage (see [Shortage / damage approval](#shortage--damage-approval-legacy-se-approval)) |
| Indent cancelled | Requester, and supplying branch store managers if it was already submitted |
| STN cancelled or changed before receipt | Requesters, receiving branch store managers |

## Shortage / damage approval (legacy S/E approval)

Legacy let only users with **Can Approve Shortage/Excess in MIT/BIT** approve the shortage on a receipt
(`SEApprovedBy`). The branch used it on 47 of 862 BIT receipts, Abuja on 51 of 108, and CPD on 21 MITs.

- An MRN for a Mobis MIT or a branch STN that records damaged or short units starts as **awaiting approval**
  (`discrepancyStatus = PENDING`). Stock is posted at receipt as before; approval accepts the shortage, it does
  not hold the goods. Receipts cannot exceed what was invoiced or sent, so there is no excess to approve.
  Vendor receipts are not included.
- Users with `stock:discrepancy:approve` for the receiving branch (or with `inventory:cross-branch`) are notified.
  They approve from the MRN card on the MIT or STN page, or from **Inventory → Shortage Approvals**, with an
  optional remark. The MRN then shows who approved it and when. Audited as `STOCK_DISCREPANCY_APPROVED`.
- Granted by default to Admin and General Store Manager (and every SuperAdmin).
- `GET /api/inventory/discrepancies` lists pending receipts; `PATCH /api/inventory/mrn/:id/approve-discrepancy`
  (`{ remark? }`) approves one. Only a pending receipt can be approved, so two approvers cannot both approve it.
- Existing Mobis and transfer MRNs with damaged or short units were set to pending by the migration.

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
| `countersale` with trantype `M`, and `csissue` (parts STN; `OrderNo` = indent, empty on a direct STN) | `StockTransferNote` (linked to its indents), `StockTransferNoteLine` |
| HHDC `BI` picking downloads (one indent each; picker recorded) | `PickingList` with `pickerName`; picking on the handheld: [handheld.md](./handheld.md) |
| `CaseHeader` and `CaseDetail` with trantype `CB` | `TransferCase`, `TransferCaseLine` |
| `CaseHeader` with trantype `PB` (PackId, WayBillNo, CourierName, ConsignmentWeight) | `PackingList` |
| `branchInTransithead`, `branchInTransitDetail` (PartOrdered vs PARTNO, QTYRECIEVED, QtyRejected) | The STN and its lines: the received, damaged and short totals on `StockTransferNoteLine` |
| SRN number on the BIT tables | `MaterialReceiptNote` with `source = BRANCH_TRANSFER` (the legacy system used SRN; this project uses MRN for every receipt) |

The legacy `STN` and `SRN` tables hold vehicle transfers (VIN, engine and key numbers), not
parts, so they are not part of this mapping.

## Tests

`stockTransfer.logic.test.ts` covers the business rules without a database. The database
tests in `stockTransfer.integration.test.ts` run the full flow, including races and partial
receipts. `stnChanges.integration.test.ts` covers VAT (reproducing ABJ STN 2025000027), local parts on a
direct STN, cancel and change before receipt, split cases on a direct STN and the courier date. They are skipped unless `TEST_DATABASE_URL` points at a separate, migrated
database:

```bash
cd server
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest
```
