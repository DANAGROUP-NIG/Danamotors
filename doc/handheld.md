# Handheld picking and MIT receiving

The handheld (Motorola MC3190, legacy HHDC) does three jobs besides stock taking: pick a branch indent, pick a
customer purchase order (CPO), and check a Mobis MIT as it is unpacked. Stock taking is in
[stock-taking.md](./stock-taking.md). The device app and HHDC Link, the PC tool that moves files to and from the
device over USB, are kept outside this repository.

In the legacy data only CPD uses these, and still does: about 1,000 indent picks a year, a few dozen CPO picks, and
every Mobis MIT since 2021 checked line by line on the device before its MRN.

## Flow

| Step | Who | What happens |
| --- | --- | --- |
| 1. Send | Store manager or supervisor, in HHDC Link | Choose an open picking list, a picked CPO or an MIT in transit, and the picker (an employee). The server snapshots the lines: part, bin, case (MIT) and the reserved or invoiced quantity. Lines come in bin order; an MIT comes in case order. A source can be on only one handheld at a time. |
| 2. Pick or check | Picker, on the device | Scan and count. Picking may not exceed the reserved quantity, and a short line needs a reason. An MIT line takes received and damaged quantities, which may not exceed the invoice. |
| 3. Upload | Store manager or supervisor, in HHDC Link | Once only. The upload time is the server's; the device clock is not trusted. |

What the upload does:

| Document | Effect |
| --- | --- |
| Indent pick | Each reservation drops to what was picked. The short goes back to the indent line's back order, the same rule as dispatch. If nothing at all was picked, the picking list is cancelled and the indent can be picked again. |
| CPO pick | Each reservation drops to what was picked. The short goes back to free stock. |
| MIT check | The MIT becomes **Verified**. Nothing goes into stock. The store opens Generate MRN, which is filled in from the device counts, checks it and posts it. Lines the checker never reached start at the invoice quantity. |

A picker who scans a different part (a supersession or another flag) does not pick it in its place. The device records
the scanned part as a note on the line. The store decides, and supplies it as an alternate on the web if it should go.
A part found in an MIT case that is not on the MIT is recorded as an exception for the store and never posted.

The device does not show rates.

## When the web gets there first

If the source changes on the web while its document is on a handheld, the document is cancelled with a remark, so a
stale result can never be uploaded over the change. This applies when the picking list is dispatched or its lines are
cancelled, when the CPO is billed or released, and when the MIT gets its MRN or is cancelled. An upload is also refused
if a reserved quantity changed after the document was sent. A document can also be cancelled by hand from the indent,
CPO or MIT page; reservations are not touched.

## Short reasons

`NOT_FOUND`, `DAMAGED`, `LESS_IN_BIN`, `OTHER`. A picking line the picker never saved counts as not picked, with the
reason HHDC Link sends (`NOT_FOUND` by default).

## Permissions

Each document type uses the permissions of the web screen it stands in for:

| Type | Read | Send, upload, cancel |
| --- | --- | --- |
| `INDENT_PICK` | `transfer:read` | `transfer:dispatch` |
| `CPO_PICK` | `partsale:read` | `partsale:order` |
| `MIT_RECEIVE` | `stock:read` | `stock:update` |

Pickers do not sign in. They are chosen from employees when the document is sent.

## API

`GET /api/handheld/sources?type=`, `GET /api/handheld/documents` (filters `type`, `status`, `branchId`, `sourceId`,
`indentId`), `POST /api/handheld/documents`, `GET /api/handheld/documents/:id`,
`POST /api/handheld/documents/:id/upload`, `PATCH /api/handheld/documents/:id/cancel`. See Swagger (`/api/docs`,
tag Handheld).

## Legacy mapping

| Legacy | New |
| --- | --- |
| `HHDCDownloadHead` / `HHDCDownloadDetail` with `DownloadType` BI or CPO (`Picker`, `QtyAllotted`, `QtyUploaded`, `PartOrdered` vs `Part`, `PickDate`) | `HandheldDocument` (`INDENT_PICK`, `CPO_PICK`) and `HandheldDocumentLine` (`expectedQuantity`, `quantity`, `scannedPartNumber`) |
| Cancelling a download (`CancelledDt`; `allottedcancel` keeps the allotment) | `PATCH .../cancel`; reservations stay with the picking list or CPO, which have their own release |
| MIT `pctohhdc` / `hhdctopc`, `Downloadno`, `AllottedTo`, `RCVDQTY`, `DMGDQTY`, `Newpart` on `MATERIALINTRANSITDETAIL` | `HandheldDocument` (`MIT_RECEIVE`): lines carry received and damaged; `extra` lines are the legacy new parts |
| MIT "Update Bin" (`Newlocation`) | Not carried over: never used (the new bin always equals the old one) |
| BIT receiving on the device (`AEBIT.sdf`) | Not carried over: no use since 2014; branches receive the STN on the web |
| "Load Parts from HHDC" on the Pick List for Countersale/Challan | The counter-sale bill takes picked CPO lines first |
