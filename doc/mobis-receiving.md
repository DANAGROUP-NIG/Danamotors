# Mobis Receiving (MIT → MRN)

How parts bought from Mobis are received into CPD stock. This is Process B of issue #62.

The Mobis invoice file is the only file ever uploaded in the app. The legacy system also
exchanged XLS files between branches because each branch had its own database. Here every
branch shares one database, so internal transfers need no files. See
[stock-transfers.md](./stock-transfers.md).

## Steps

| Step | Screen | What happens |
| --- | --- | --- |
| 1. Upload MIT | Operations → MIT → **Upload MIT** | Choose the invoice file. It is read in the browser and previewed: invoice number (prefilled), lines, totals, and which parts already exist in Part Master. Vendor is Mobis, the conversion rate is the one Finance set ([Mobis pricing](./mobis-pricing.md)) and cannot be changed here, physical receipt date defaults to today, received mode is Air, Ship or Road, and the receiving branch defaults to CPD. Save creates the MIT. |
| 2. Generate MRN | MIT detail → **Generate MRN** | Confirm what physically arrived. By default everything is received in good condition; enter damaged or missing quantities only when needed. Tax form defaults to P. Good units are added to the receiving branch stock as `RECEIVED` transactions. |

Between the steps the MIT can be checked on the handheld as the cases are unpacked. The MIT then shows
**Verified** and Generate MRN is filled in from the counts. See [handheld.md](./handheld.md).

Both steps send a dashboard notification to the general store managers and the receiving
branch's store managers.

## The MIT file format

```
Invoice Detail
Invoice No:      A6EA0567A
Order No  L / I  Part No       Part Name            QTY  Unit Price  Amount Extended  Case No.      INT  WEIGHT  HS CODE
AV10K6Q01R 0001  84710Q6020WK  CRASH PAD ASSY-MAIN  1    165.08      165.08           SPD2APE00210
```

- `.xls`, `.xlsx`, `.csv` and tab-separated text are all read. This includes the tab-separated
  "xls" files Mobis sends.
- Columns are found by header name, so their order and any extra blank columns do not matter.
- Padding around part numbers and case numbers is trimmed. Part and line numbers keep their
  leading zeros.
- Each line's amount must equal quantity × unit price. Unreadable rows are listed in the
  preview and left out.

## Rules

- **New parts.** Parts are never created from an invoice. Invoice parts missing from Part Master
  are refused unless the user chooses to proceed without them, which leaves their lines off the
  MIT. To receive them, create them first from **Part Query** (they are found in the Mobis
  catalogue, see [masters.md](./masters.md#mobis-catalogue-and-part-enquiry)), then upload again.
- **No double import.** The same Mobis invoice number cannot be imported twice unless the
  earlier MIT was cancelled.
- **No double posting.** An MIT has at most one MRN. The MIT row is locked while the MRN is
  created, a unique key backs it up, and a database check stops any line being received beyond
  its invoiced quantity.
- **Closing the MIT.** The MRN closes the MIT. Anything not entered as received or damaged is
  recorded as short.
- **Value.** The MRN value is received quantity × unit price × conversion rate.
- **Received mode.** Courier, Air, Sea (ship) or Road. Legacy codes since 2021: 3 courier (DHL, 181), 2 air (AWB,
  87), 1 sea (5); road never used but kept.
- **Cancelling.** An MIT can be cancelled only before its MRN.
- **Shortage approval.** An MRN with damaged or short units waits for approval by a user with
  `stock:discrepancy:approve`. See [stock-transfers.md](./stock-transfers.md#shortage--damage-approval-legacy-se-approval).
- **Permissions.** Uploading and generating the MRN need `stock:update` and access to the
  receiving branch. Viewing needs `stock:read`.

## API

`POST /api/inventory/mobis/mit/match-parts`, `POST /api/inventory/mobis/mit`,
`GET /api/inventory/mobis/mit`, `GET /api/inventory/mobis/mit/:id`,
`POST /api/inventory/mobis/mit/:id/mrn`, `PATCH /api/inventory/mobis/mit/:id/cancel`,
`GET /api/inventory/mrn`, `GET /api/inventory/mrn/:id`. These list Mobis MRNs only; MRNs for
branch transfers are under `/api/inventory/transfer-mrns`. Request and response examples are in
Swagger under "Mobis Purchase".

## Vendor receipts (non-Mobis purchases)

**Inventory → MRN** (material receipt note, `/inventory/mrn`) receives parts bought from any vendor other than
Mobis: the local, second-hand and repaired parts the branches buy (legacy: about 600–850 local-vendor MRNs a year
per branch), and CPD's direct non-Mobis purchases. Each receipt is an MRN with source `VENDOR` for one vendor
invoice, numbered like every MRN. Reviewed against legacy on 2026-11-25
(`dana_projects/part_purchase_screens_review_2026-11-25_recheck.md`).

- Pick the branch (or a location such as QS), the vendor (a party of type VENDOR), the vendor's invoice number and
  date, then the lines: part record, quantity and invoice price. Any active part can be received; legacy branches
  also buy some Mobis O parts from local vendors.
- **Tax form** (legacy `mrnhead.formtype`), chosen per MRN: Y purchase local (no VAT), Z purchase local with VAT,
  P imported, X transfer without VAT. It defaults from the vendor type (IMP → P, LOCAL or none → Y) and can be
  changed. **Only Z charges VAT**: 7.5% on taxable parts (legacy taxed MRNs: ABJ 2021000231 and 2025000002, all Z).
- **Conversion rate** for an invoice in another currency (CPD: Dongfeng, GIT, Sparemate at 1,900–2,700). The line
  price is in the invoice currency; the cost is price × rate. 1 for a naira invoice. This is the store's per-invoice
  rate, not Finance's Mobis rate.
- **Round-off**: branches with **Round vendor MRN totals** (branch setting, legacy `control1.roundmrn`; on at CPD
  and Abuja, off at Kia Plaza; a location follows its parent) round the amount payable to the naira and show the
  round-off. The MRN shows goods value, VAT, round-off and net purchase amount.
- **Prices.** Posting adds the stock. A **branch-bought record (L/U/R)** takes the cost as its dealer rate and its
  retail is recalculated from its price category (legacy updated L parts this way). **Mobis records (O/A/F) keep
  Finance's price**: local vendors sell them at about 0.6× the Mobis price, and legacy did not re-price them.
- **Same invoice twice**: refused unless a reason is given (e.g. second part of a delivery); the reason is kept.
- A vendor whose name contains "Mobis" is refused: Mobis invoices come in through the MIT upload above.
- **Correct MRN** (`PATCH`, button on the MRN): change invoice no./date, tax form, rate, remarks or the lines (add,
  change, remove). Stock moves by the difference. Units come off only while still in stock, and never below what was
  returned to the vendor. Each change is logged with the reason and shown under Corrections. (Legacy users changed
  lines after saving on about 8% of Abuja MRNs; no MRN was ever deleted, so there is no cancel.)
- The receipt page prints the MRN and staff-only shelf labels (part number, name, source, bin), one per unit or
  one per line. Vendor MRNs are on the MRN register report with the Mobis ones.

### MRN returns (return to vendor)

Legacy MRN Return: Lagos 51 and Abuja 47 returns since 2021, CPD none since 2017. On an MRN, **Return to vendor**
(`/inventory/mrn/{id}/return`) sends parts back:

- Quantity per MRN line, or **Full return** (everything still returnable). Each line is capped at received less
  already returned (`MaterialReceiptLine.returnedQuantity`) and at the stock on hand.
- Rate, VAT and tax form come from the MRN; round-off follows the branch setting. The vendor defaults to the MRN's
  and can be changed (Lagos returned Royal Iyke MRNs to Seun Nigeria).
- Stock goes out as a `VENDOR_RETURN` movement ("MRN return" in the stock ledger). It is not consumption and the
  dealer rate is not touched. Numbered like other documents (year + 6 digits); printable return note.
- **Inventory → MRN Returns** (`/inventory/mrn-returns`) lists them.
- All legacy data is to be migrated, MRNs included, so returns always start from an MRN in ours (the migration must
  carry `mrndetail.QtyReturned` into `returnedQuantity`).

API: `GET /api/inventory/vendor-receipts/vendors` (with `defaultTaxForm`), `GET /api/inventory/vendor-receipts/parts`,
`GET /api/inventory/vendor-receipts/settings?branchId=`, `POST`/`GET /api/inventory/vendor-receipts`,
`GET`/`PATCH /api/inventory/vendor-receipts/:id`, `POST /api/inventory/vendor-receipts/:id/returns`,
`GET /api/inventory/vendor-returns`, `GET /api/inventory/vendor-returns/:id` (permissions `stock:read`;
`stock:update` to post, correct or return). Values, VAT and net amounts are hidden without `sparepart:cost:read`.
Closed books lock MRNs and MRN returns (`doc/books-closed.md`).

## Not yet built

Tally posting of vendor receipts and MRN returns is not built yet
(see `tally_requirements_part_purchase.md` outside the repo).

Purchase requests do not yet feed Mobis orders. There is no request stepper and no
back-order-to-order link. The Mobis order number from the invoice is stored on each MIT line,
ready for that link.
