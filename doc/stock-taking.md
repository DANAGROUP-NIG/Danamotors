# Stock Taking (physical stock)

How a branch counts its parts and corrects system stock from the count. This replaces the
legacy Physical Stock Taking screens used in AutoEnhancer and CPDAutoEnhancer: Batch Creation
for Physical Stock Taking, Physical Stock Taking (Download / Upload for the handheld), Upload
Physical Stock Data, Upload/Download Status, Stock Increase/Decrease Detail, S/E Confirmation,
Not Required Part and Bin Location Updation. It also replaces the Stock Audit screens (Internal
Audit, Audit by Audit Head, Audit by Visiting Management); see [Stock audit](#stock-audit).

| Step | Screen | What happens |
| --- | --- | --- |
| 1. Batch | Inventory → Stock Taking → **New batch** | Choose **Annual** or **Perpetual**, select parts (part or bin range, source, part type, part category, dealer rate, only with stock, top N consumed in the last M months with or without STNs), **Load parts**, untick any, create. |
| 2. Count sheets | Batch → **Issue count sheet** | Give a checker a bin or part range (legacy HHDC download). Optionally show system stock to the checker. |
| 3. Count | Sheet → enter counts → **Upload counts** | Good and damaged quantity and the bin each part was found in. Add parts found that are not on the sheet. Parts left blank are counted as zero, or left for another sheet. |
| 4. Check | Batch detail | Correct a count (logged), **Add count** without a sheet, set aside part numbers not in Part Master (**Not required**), review stock movements since the batch was created. |
| 5. Complete | Batch → **Complete** | Needs every sheet uploaded and every unknown part number resolved. Parts nobody counted are taken as zero or removed from the count. |
| 6. S/E confirmation | Batch → **Confirm S/E** | Posts each part's shortage or excess as a stock adjustment (SAN). Needs `stocktake:confirm`. |
| 7. Bins | Batch → **Update bins** | Sets the branch bin of parts found somewhere other than their recorded bin. Allowed once per count. |

## Rules

- **Discrepancy** = (good + damaged) − system stock when the part was first counted (legacy
  `QTY + DamageQty − CurrStock`). Damaged stock counts as stock. It stays in stock and appears
  on the Damaged parts report.
- **Same part, several bins or checkers.** The counts add up, and the bins are kept as
  `N-3D3/QSB` (legacy merge, `FinalBin`).
- **Annual freeze.** While an annual count is in progress, stock of its parts cannot move at the
  branch. Legacy blocked this with "Part No. X is under Stock taking process vide Batch No. Y".
  A trigger on `InventoryStock` enforces it for every module, and the API returns 409
  `STOCK_TAKE_FREEZE`. The freeze ends when the count is completed or cancelled. Perpetual
  counts never freeze stock.
- **One open count per part.** A part can be in only one counting or completed count at a
  branch. Only one annual count can be open per branch.
- **Adjustment.** On S/E confirmation, the discrepancy is added to today's stock, so stock that
  moved after the count stays. If any part would fall below zero or below its reserved stock,
  nothing is posted. Adjustments are `StockTransaction` type `ADJUSTMENT` with the count as
  `referenceId`, so they appear in the SAN Register, the stock ledger and the MIS reports. The
  dealer rate is saved on each line at confirmation.
- **Unknown part numbers.** These are kept on the count. When the count is completed, any
  number since created in Part Master joins its part. The rest must be marked not required.

## Handheld (HHDC)

The web count sheet stands in until the handheld is integrated. The device should use the same
two calls:

- `GET /api/stock-takes/:id/sheets/:sheetId`: the sheet's parts (bin, part, description, and
  system stock if `showSystemStock`).
- `POST /api/stock-takes/:id/sheets/:sheetId/upload`: `{ uncounted: "ZERO" | "RELEASE", entries:
  [{ partId | partNumber, binLocation, quantity, damagedQuantity, remarks, countedAt }] }`. Send
  one entry per scan (part and bin). The upload accepts up to 50,000 entries.

## Legacy findings (AutoEnhancer and CPDAutoEnhancer)

- Annual counts run every year: November/December at the branch, December/January at CPD.
  Each count uses about 7 checkers and 10 to 15 handheld downloads. The final download usually
  covers every remaining part.
- Perpetual counts were used regularly until 2016 (CPD until 2018). Since then most perpetual
  batches were created and later cancelled ("to give room for AST").
- From 2013 onward, legacy never adjusted stock from a count. `PSTADJUSTMENT` (adjustments by
  STN, SRN or SAN after S/E confirmation) was used only in 2011–2012. Lock (`L`) only froze the
  document, so system stock kept every discrepancy. For example, in the 2024 annual count part
  1864421058N was counted at 18 against a system stock of 57, and the 57 was never corrected.
  The new system posts the adjustment.
- Not carried over: the Excel upload of batch parts (`XLUpload`, last used 2015).

## Stock audit

Inventory → **Stock Audit**. An audit is an independent check of a branch's stock. It uses the
same batch, count sheets and counts as a physical count (type `AUDIT`). Legacy did the same: its
Batch Creation form served both, and an audit was PSTBatchHead `TranType = S`.

| Step | Screen | What happens |
| --- | --- | --- |
| 1. Audit | Stock Audit → **New audit** | Choose **Internal audit**, **Audit by audit head** or **Audit by visiting management**, enter the auditor(s), then select and load the parts as for a batch. |
| 2. Sheets and counts | Audit detail | As steps 2 to 4 above. Audit sheets never show system stock: the auditor counts blind. |
| 3. Complete | Audit → **Complete** | Final. The audit reports shortage and excess at dealer rate, and stops there. |

How an audit differs from a physical count:

- **It never changes stock.** There is no S/E confirmation and no bin update, and a completed
  audit cannot be cancelled. To correct stock after an audit, the store runs its own perpetual
  count.
- **It never freezes or holds parts.** Stock keeps moving. A part in an open physical count can
  be audited, and a part under audit can still join a physical count. The discrepancy is
  measured against system stock when each part was counted, as for any count.
- **Auditors are names, not users** (legacy `Auditormast`). Visiting management may have no login.
  A sheet's checker (optional) is whoever enters the counts.
- Audits share the batch number series with physical counts.

Legacy usage: AutoEnhancer ran one audit, batch 2012000001 on 22 March 2012 (Internal Audit, 26
parts, auditors set up that day). It found shortages, for example 5172002000 counted 41 against
47, and posted nothing. CPDAutoEnhancer and ABJAutoEnhancer have no audits, and audit head and
visiting management were never used. The legacy "Prepare Device for Stock Audit" option is
handheld-only (`Preparedevice` was never set) and waits for the HHDC integration.

## Permissions

| Permission | Roles | Allows |
| --- | --- | --- |
| `stocktake:read` | Admin, General/Branch Store Manager, Accountant | View counts, sheets, movements; Physical Stock Taking report |
| `stocktake:manage` | Admin, General/Branch Store Manager | Create batches, issue/cancel sheets, record and correct counts, complete, cancel, update bins |
| `stocktake:confirm` | Admin, General Store Manager | S/E confirmation (adjusts stock) |
| `stockaudit:read` | Admin, General/Branch Store Manager, Accountant | View stock audits; Stock Audit report |
| `stockaudit:manage` | Admin, General Store Manager, Accountant | Create audits, issue/cancel sheets, record and correct counts, complete, cancel |

A Branch Store Manager can read audits but not run them, so a branch never audits itself.

## Reports

Parts Reports → **Physical Stock Taking** (`physical-stock`). Enter a batch number for one
count; otherwise the report covers counts created in the period. Options: Shortage / excess,
Part wise, Bin location wise, Damaged parts. The batch screen's **Report** button opens it for
that batch. Stock audits have their own report, Parts Reports → **Stock Audit** (`stock-audit`),
with the same options. The physical stock report leaves audits out.

## Code

- Server: `server/src/modules/stock-take/` (`stockTake.logic.ts` for the rules,
  `stockTake.service.ts`, `stockTake.report.ts`), migration `20261011120000_stock_taking`
  (tables, freeze trigger, permissions), migration `20261012120000_stock_audit` (type `AUDIT`, audit
  level and auditors, `stockaudit` permissions).
- Client: `client/features/stock-taking/`, routes under `/inventory/stock-taking` and
  `/inventory/stock-audit`. The same components serve both. `KINDS` in
  `lib/stock-taking-format.ts` holds what differs.
