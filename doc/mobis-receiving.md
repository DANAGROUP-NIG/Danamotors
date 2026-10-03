# Mobis Receiving (MIT → MRN)

How parts bought from Mobis are received into CPD stock. This is Process B of issue #62.

The Mobis invoice file is the only file ever uploaded in the app. The legacy system also
exchanged XLS files between branches because each branch had its own database. Here every
branch shares one database, so internal transfers need no files. See
[stock-transfers.md](./stock-transfers.md).

## Steps

| Step | Screen | What happens |
| --- | --- | --- |
| 1. Upload MIT | Inventory → Mobis Receipts → **Upload MIT** | Choose the invoice file. It is read in the browser and previewed: invoice number (prefilled), lines, totals, and which parts already exist in Part Master. Vendor is Mobis, conversion rate defaults to 2700, physical receipt date defaults to today, received mode is Air, Ship or Road, and the receiving branch defaults to CPD. Save creates the MIT. |
| 2. Generate MRN | MIT detail → **Generate MRN** | Confirm what physically arrived. By default everything is received in good condition; enter damaged or missing quantities only when needed. Tax form defaults to P. Good units are added to the receiving branch stock as `RECEIVED` transactions. |

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

- **New parts.** Invoice parts missing from Part Master are refused unless "create new parts"
  is ticked, which it is by default. Created parts get the invoice name, part code = part number,
  category "Mobis import", and a dealer rate of unit price × conversion rate. Complete their
  details in Part Master afterwards. The MIT marks them as NEW.
- **No double import.** The same Mobis invoice number cannot be imported twice unless the
  earlier MIT was cancelled.
- **No double posting.** An MIT has at most one MRN. The MIT row is locked while the MRN is
  created, a unique key backs it up, and a database check stops any line being received beyond
  its invoiced quantity.
- **Closing the MIT.** The MRN closes the MIT. Anything not entered as received or damaged is
  recorded as short.
- **Value.** The MRN value is received quantity × unit price × conversion rate.
- **Cancelling.** An MIT can be cancelled only before its MRN.
- **Permissions.** Uploading and generating the MRN need `stock:update` and access to the
  receiving branch. Viewing needs `stock:read`.

## API

`POST /api/inventory/mobis/mit/match-parts`, `POST /api/inventory/mobis/mit`,
`GET /api/inventory/mobis/mit`, `GET /api/inventory/mobis/mit/:id`,
`POST /api/inventory/mobis/mit/:id/mrn`, `PATCH /api/inventory/mobis/mit/:id/cancel`,
`GET /api/inventory/mrn`, `GET /api/inventory/mrn/:id`. These list Mobis MRNs only; MRNs for
branch transfers are under `/api/inventory/transfer-mrns`. Request and response examples are in
Swagger under "Mobis Purchase".

## Not yet built

Purchase requests do not yet feed Mobis orders. There is no request stepper and no
back-order-to-order link. The Mobis order number from the invoice is stored on each MIT line,
ready for that link.
