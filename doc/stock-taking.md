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

The handheld is a Motorola MC3190 (Windows CE 6.0, .NET Compact Framework 3.5). Two programs in
`dana_projects/hhdc/` (a sibling of this repo, not inside it) replace the legacy PC side (PSTbatch / PhysicalStock) and `HHDC.exe`, with **no server
changes**. They use the same two calls as the web count sheet:

- `GET /api/stock-takes/:id/sheets/:sheetId`: the sheet's parts (bin, part, description, and
  system stock if `showSystemStock`).
- `POST /api/stock-takes/:id/sheets/:sheetId/upload`: `{ uncounted: "ZERO" | "RELEASE", entries:
  [{ partNumber, binLocation, quantity, damagedQuantity, remarks, countedAt }] }`, one entry per
  part per bin (up to 50,000). The server **adds counts up**, so a sheet is uploaded once.

| Program | Where it runs | What it does |
| --- | --- | --- |
| **Danamotors Count** (`hhdc/device`) | The handheld, offline | The checker picks a sheet, scans or types bin then part, enters quantity, damaged and remark. Each entry is saved at once to an append-only file. Review (edit, delete) and **Finish sheet** (locks it). |
| **HHDC Link** (`hhdc/link`) | The store PC with Windows Mobile Device Center | Signs in with a Danamotors account, lists issued sheets not yet uploaded, **Send to device**, **Receive from device** (summary, ZERO or RELEASE, upload once, clear the device), **Install / update app**. `HhdcLinkCli.exe` does the same on a command line. |

How it works:

- **Sending.** The sheet is written to `\Application\Danamotors\sheets\<sheet>.sheet` on the device
  (plain text ending in a line count, so a copy cut short by a dropped USB link is detected). The PC's
  time is written in it, because the device clock can read 2009. A sheet that has counts on the device
  is never overwritten. System stock goes to the device only if the sheet allows it; an audit sheet is
  always blind.
- **Counting.** A scan arrives as keystrokes (DataWedge). Enter, Tab, or a burst of fast characters
  followed by a short pause ends a scan. The same part in two bins is two entries. The same part and
  bin again asks **add** or **replace**. A part not on the sheet asks first and is marked; a bin that
  differs from the sheet's bin warns (and beeps) but is allowed (the Update bins step uses it). A battery
  pull loses at most the entry being typed. **Scan modes** (Esc menu): the checker types the quantity,
  or each scan of a part adds 1 (or removes 1) in the current bin, saved at once, as the legacy Qty+1 and
  Qty-1 did. **F1** lists the sheet's parts for the current bin that are not counted yet, and finds a
  part by the start of its number. The bin of the last entry is restored when a sheet is reopened; a part
  label scanned into the Bin box is questioned; the bin `UNDEFINED` is refused. A 38,723-part sheet (the
  legacy maximum) opens in about 3 seconds on the device.
- **Receiving.** HHDC Link needs the sheet **finished**. It shows entries, quantity, damaged, parts not
  on the sheet and parts not counted, and requires a choice for the uncounted parts (`ZERO` or
  `RELEASE`) before it uploads. It checks the server first (sheet still open), writes `Uploading` to its
  own record (`%APPDATA%\Danamotors\HHDC Link\uploads.log`), posts, writes `Uploaded`, then clears the
  sheet from the device. If the answer is lost, the next attempt asks the server before sending again.
  A sheet already uploaded, from this PC or from the web, is refused (the server also answers 409).
- **Times.** An entry's device time is used only if it falls between when the PC sent the sheet and
  now; otherwise `countedAt` is the time the PC received the sheet.
- **Who may upload.** The upload needs `stocktake:manage` (`stockaudit:manage` for an audit), so
  whoever signs in to HHDC Link needs it. Whether checkers get it or a supervisor runs HHDC Link is not
  decided; HHDC Link works either way.

Build and test (no Visual Studio; only the free `csc.exe` of .NET Framework 4):

```powershell
cd ..\hhdc             # dana_projects\hhdc, next to this repo (not inside it)
.\build.ps1            # builds both programs and runs the unit tests
.\build.ps1 -UiTest    # also drives the real device exe through a counting session on this PC
```

The device app is compiled against the device's own .NET CF 3.5 libraries, which are not in the repo
(`dana_projects/hhdc_integration/tools/probe/refs`; pass `-CfRefs` if they are elsewhere). The same exe
runs on a PC: `DanamotorsCount.exe --data <folder>` shows the 318x269 screen. HHDC Link can use a folder
in place of a device (`--folder <dir>`, or the "Test folder" box). See `hhdc/README.md`. What cannot be
proven without the device is in `dana_projects/hhdc_integration/device_checklist.md`.

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

Parts Reports → **Physical Stock Taking** (`physical-stock`) and **Stock Audit** (`stock-audit`) replace
the legacy Physical Stock Taking and Stock Audit MIS menus. Enter a batch (audit) number for one count;
otherwise the report covers counts created in the period. Filter by **Annual / Perpetual** (audits: the
audit type) and by part. **Only parts having remarks** and **Include parts identified as not required**
work as on the legacy screens. The batch screen's **Report** button opens the report for that batch. The
physical stock report leaves audits out.

| Option | Legacy report | What it shows |
| --- | --- | --- |
| Shortage / excess | Stock Taking Report (Detail) | Parts counted above or below system stock, at dealer rate |
| Part wise | Part Wise Physical Stock Taking, Part Wise Stock Audit | Every part counted: system and physical quantity and value, damaged, excess, shortage |
| Remarks wise (audits) | Remarks Wise Stock Audit Report | Parts under each remark |
| Audit history (audits) | Stock Audit History | Each part with every audit of it in the period |
| Bin location wise | BIN Location Wise Physical Stock Taking | Parts under each bin they were found in |
| Damaged parts | Damage Parts Report (Stock Taking) | Damaged quantity and value |
| Checker wise / Auditor wise | Stock Taking Report (Checker Detail) | Parts under the checker who counted them |
| Summary | Stock Taking Report (Summary, Combined Summary) | One line per count: parts, counted, system, physical, damaged, excess and shortage value, net, and who approved the S/E (audits: the auditors). **All branches** lists every branch together |
| Part numbers not in Part Master | List of Not Defined Parts | Part numbers counted that are not in Part Master, to resolve or set aside |
| Parts not counted yet | List of Batch Parts Not Uploaded | Parts in an open count with no count yet, and the sheet each is on |
| Bins over 40 characters (counts only) | Parts Having Bin Location Exceeds Defined Limit | Parts found in so many bins that the merged bins (`29B3/63A3/...`) are too long for one bin location. On **Update bins** the store enters one bin for each; the field starts empty |

**Stock Taking Log** (`stock-take-log`) and **Stock Audit Log** (`stock-audit-log`) list events by date:
**Count sheets** (issued, checker, selection, parts, uploaded or cancelled, by whom; legacy HHDC
downloads and uploads), or **Corrections and added counts** (every count changed or entered on screen,
with the change, remarks and user, including the zero counts made when a count is completed).

Legacy findings: 209 AutoEnhancer and 2,895 CPD count lines had merged bins over the 40-character
`PARTBAL.bincard` limit, up to 395 characters (CPD 2024 count: `0K20133065A` in nine bins). 147 and 97
lines were wrong part numbers (`wrongpart`).

## Code

- Server: `server/src/modules/stock-take/` (`stockTake.logic.ts` for the rules,
  `stockTake.service.ts`, `stockTake.report.ts`), migration `20261011120000_stock_taking`
  (tables, freeze trigger, permissions), migration `20261012120000_stock_audit` (type `AUDIT`, audit
  level and auditors, `stockaudit` permissions).
- Client: `client/features/stock-taking/`, routes under `/inventory/stock-taking` and
  `/inventory/stock-audit`. The same components serve both. `KINDS` in
  `lib/stock-taking-format.ts` holds what differs.
