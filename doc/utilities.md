# Utilities

How the legacy Utilities screens map to the new system. All five were XLS uploads. None of them is
needed as a new screen. Each one is either already in the system, done better by an existing screen,
or was never used. So there is no Utilities menu.

| Legacy screen | New |
| --- | --- |
| SRN Upload Utility | Not needed. The receiving branch receives the STN directly. See [SRN and STN upload](#srn-and-stn-upload) |
| STN Upload Utility | Not needed. STNs come from picking. See [SRN and STN upload](#srn-and-stn-upload) |
| Counter Sale Upload Utility | Not built. Never used. See [Counter sale upload](#counter-sale-upload) |
| SAN Upload Utility | Stock Taking → S/E confirmation posts the adjustments. See [SAN upload](#san-upload) |
| Part Deletion Utility | Inventory → Parts: tick parts, then **Delete** or **Block part**. See [Part deletion](#part-deletion) |

The only file upload in the system is the Mobis invoice (MIT) in
[mobis-receiving.md](./mobis-receiving.md), because Mobis is outside the system.

## SRN and STN upload

In legacy, each branch had its own database. CPD made the STN (`countersale.trantype = 'M'`) and
exported it as a file such as `STN000185-1.xls`. The receiving branch loaded that file with the
**SRN Upload Utility**, which made its SRN (`trantype = 'R'`, `FromXls = 1`, with the file name in
`UPDWXlsFileName`). The branches did this every year up to 2026: about half of AutoEnhancer's SRNs and
most of ABJAutoEnhancer's came from a file. The rest were typed in.

The new system has one database for all branches. The receiving branch sees the dispatched STN and
receives it, and it is told by notification. No file is exported or loaded
([stock-transfers.md](./stock-transfers.md)).

The **STN Upload Utility** made an STN from a file. No STN was ever made this way: `FromXls` is never
set on an STN in AutoEnhancer, CPDAutoEnhancer or ABJAutoEnhancer. At CPD, STNs come from the picking
list, and the new system does the same.

## Counter sale upload

The screen made a counter-sale bill from a file, with the customer, tax type, cash discount, dispatch
mode and delivery address. No counter-sale bill (`trantype = 'C'`) was ever made from a file in any
of the three databases: `FromXls` and `UPDWXlsFileName` are always empty, and `TmpCounterSale` is
empty. Counter sales are entered on the bill, usually from a CPO ([part-sale.md](./part-sale.md)).

## SAN upload

The screen loaded a stock adjustment note (SAN) from a file, with the SAN type, dealer or retail rate
and a remark. Legacy SANs (`StockAdjustHead`) stopped in 2013 in all three databases. The last busy
years were 2004–2007, at the branch and at Abuja.

Shortages and excesses found in a stock count are now posted as adjustments by the S/E confirmation in
Stock Taking ([stock-taking.md](./stock-taking.md)). The adjustments appear in the SAN register and
the stock ledger.

## Part deletion

The screen deleted the parts listed in a file, after the user had backed up the database. Legacy kept a
copy of each deleted part in `partdel`. Only CPD used it: 690 parts, all created in or before 2009.
No part created since 2010 was ever deleted. The branch databases have no `partdel`.

The parts table already does this, more safely:

- Tick one or more parts (or filter the list first) and choose **Delete**. You need
  `sparepart:delete`.
- A part that is used by stock transactions, transfers, issues or purchase requests cannot be deleted,
  because that would break its history. Delete stops and says so. Choose **Block part** instead. A
  blocked part stays in the history and reports, but cannot be sold, indented or put on an STN.
- A part with alternates cannot be deleted until its alternates are deleted or reassigned.
- Each delete is recorded in the part's change history, so no backup is needed first.
