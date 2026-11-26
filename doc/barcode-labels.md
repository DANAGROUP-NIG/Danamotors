# Barcode labels

Part labels printed on a Zebra label printer plugged into a handheld station PC (legacy AutoEnhancer
**Barcode Printing**, `BarCode.dll`). Built 2026-10-28.

## What the store does

- **Inventory > Barcode Labels** (`/inventory/barcode-labels`): add parts (scan, number or name), set copies
  (1-100 each, up to 200 parts), **Print**. The page shows the branch's printer and the last 30 prints; a failed
  or cancelled print can be printed again, a waiting one cancelled.
- **Print label** on a part's page: copies of that part's label.
- Permission `labels:print` (granted to every role with `stock:update`, and Admin). Users print at their own
  branch; `inventory:cross-branch` users choose the branch.

## The label

2" × 2" (406 × 402 dots at 203 dpi), direct thermal, gap media: the stock loaded in the store's ZTC S4M. Laid out
like the Kia Genuine Parts box labels (user photos, 2026-11-23): description (2 lines) top left, the Kia logo and
"Genuine Parts" top right, the part number large (a plain 10-13 character Kia number split after the fifth
character, "96610 H9100", as Kia prints it), the Code 128 barcode of the number as stored, then the bin
(`InventoryStock.rackLocation` of the printing branch) and the print date, and along the bottom a QR code of the
part number, the black Kia badge, and the dealer and branch short name. Template:
`server/src/modules/labels/labels.zpl.ts`.

- Left out: QTY (user decision 2026-10-28), and "Made in", the Mobis lot codes (e.g. LC31 / SRL4) and the serial
  under the QR code, for which we hold no data (user, 2026-11-23).
- The logo graphics (`labels.logo.ts`, ZPL `^GFA`) are generated from `client/public/logo.webp` by
  `hhdc/res/make_label_logo.py`; do not edit them by hand.
- Proofing a layout on a station PC without the web: `HhdcLinkCli printer file LABELS.zpl`.
- Bars are 2 dots wide up to 13 characters, 1 dot from 14 (quiet zone kept); the legacy labels used 1 dot from 9
  characters and scanned for years. Printed and scanned on the MC3190 on 2026-10-28: 10, 12 and 20 characters
  (spaces, lowercase). The handheld matches scans on letters and digits only, so hyphens and spaces do not matter.
- No media type is set: legacy's 4" × 4" format forced `^MTT` (thermal transfer), which faults a printer with no
  ribbon.
- A part number with characters outside printable ASCII is refused (Code 128 subset B cannot carry it).

## How it prints

```
web Print ─► LabelPrintJob QUEUED (ZPL rendered now) ─► station claims (2-min lease, only while READY)
          ─► HHDC Link sends the ZPL to the USB printer ─► done: PRINTED, or FAILED with the reason
```

- HHDC Link in station mode looks for a Zebra (USB vendor 0A5F) on the USB printer interface every 5 s. No Windows
  print queue, driver or admin rights are needed. It asks `~HI~HS` and reports `READY`, `PAUSED`, `PAPER_OUT`,
  `HEAD_OPEN` or `ERROR` in the heartbeat (`printer`, null = none), shown on Settings > HHDC and on the page.
- Any station of the branch with a ready printer takes the job (`FOR UPDATE SKIP LOCKED`). If the station cannot
  tell the server a job printed, it keeps the answer and sends it later. It never reprints that job.
- ZPL is rendered on the server, so a layout change needs no new HHDC Link.
- Endpoints: user `/api/labels/*` (tag Barcode Labels), station `/api/handheld/station/prints/*`.

## Not built

- Bin location labels (legacy `PrintBinBarcode22/44`) and the 4" × 4" size.
- Printing from an MRN / MIT receipt (one label per unit received).
- Legacy's "print from Excel" (no Excel uploads except Mobis data).

## Testing

- `npx jest labels`: template; with `TEST_DATABASE_URL`, the flow (claim race, failures, retry, heartbeat).
- HHDC: `tests/LabelTests.cs` (status parsing from the store printer's real reply, print once, lost answers).
- Without a printer: `HhdcLinkCli station once --printer-file DIR` writes each job's ZPL to `DIR`.
- At the printer: `HhdcLinkCli printer status` and `HhdcLinkCli printer test`.
