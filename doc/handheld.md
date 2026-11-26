# Handheld jobs: count sheets, picking and MIT receiving

The handheld (Motorola MC3190, legacy HHDC) does four jobs: count a stock-taking sheet, pick a branch indent, pick a
customer purchase order (CPO), and check a Mobis MIT as it is unpacked. Counting rules are in
[stock-taking.md](./stock-taking.md). The device app (Kia Motors Handheld, KMHH) and the PC program (HHDC Link) are in
[`hhdc/`](../hhdc/README.md) in this repository.

In the legacy data only CPD uses picking and MIT checking, and still does: about 1,000 indent picks a year, a few dozen
CPO picks, and every Mobis MIT since 2021 checked line by line on the device before its MRN.

## Everything happens on the document's page (since 2026-10-28)

Store staff never open a program on the PC. A browser cannot reach the handheld (it is reached over USB through
Windows Mobile Device Center), so HHDC Link runs on each store PC with a cradle as a **station**: installed once by IT,
started at Windows sign-in, a tray icon and no window, no user sign-in. It authenticates with its own key.

```
page: Send to handheld ─► QUEUED ─► a station writes it to a docked handheld ─► SENT
      picker works it and presses Finish, docks ─► station collects the result ─► RECEIVED
      page: review, Post ─► UPLOADED (shown as "Posted")          any time before: Cancel ─► CANCELLED
```

| State | Page shows | Meaning |
| --- | --- | --- |
| `QUEUED` | Waiting for handheld | Goes to the next handheld docked at **any** station of the branch (user decisions 2026-10-28). |
| `SENT` | On handheld (MC3190-1) | Written to that handheld and read back. |
| `RECEIVED` | Finished on handheld | The raw device result is stored on the job (`result`, JSON) and **not applied**. The page shows it with what still needs a choice. |
| `UPLOADED` | Posted | Applied once, through the same code as before (`HandheldService` apply / `StockTakeService.uploadSheet`). |
| `CANCELLED` | Cancelled: remark | By hand, or by the web getting there first (below). A received result is kept on the job, never applied. |

One active job per source (partial unique indexes over `QUEUED`, `SENT`, `RECEIVED`).

**Posting** is where the store makes the choices the device cannot: the reason for picking lines the picker never
reported (default *Not found*), and ZERO or RELEASE for a sheet's uncounted parts. MIT: posting marks it **Verified**
and the page opens Generate MRN filled in from the counts.

What posting does:

| Job | Effect |
| --- | --- |
| Count sheet (`COUNT_SHEET`) | The counts are uploaded to the stock taking, once, as from the count screen. While a sheet has an active job, counts cannot be typed on its page. |
| Indent pick (`INDENT_PICK`) | Each reservation drops to what was picked. The short goes back to the indent line's back order, the same rule as dispatch. If nothing at all was picked, the picking list is cancelled and the indent can be picked again. A picking list whose pick is posted is not offered again (its lines are fixed at approval). |
| CPO pick (`CPO_PICK`) | Each reservation drops to what was picked. The short goes back to free stock. What was found becomes the line's `handheldCheckedQuantity`; a later send carries only picked units not yet checked (e.g. picked after the post), so Send to handheld is not offered while every picked unit is checked. Billing uses checked units first; releasing the pick clears them. |
| MIT check (`MIT_RECEIVE`) | The MIT becomes **Verified**. Nothing goes into stock. The store checks and posts the MRN, filled in from the device counts. Lines the checker never reached start at the invoice quantity. |

A picker who scans a different part (a supersession or another flag) does not pick it in its place. The device records
the scanned part as a note on the line; the store decides, and supplies it as an alternate if it should go. A part
found in an MIT case that is not on the MIT is recorded as an exception and never posted. The device shows no rates.

### Why count sheets are a job type, not fields on the sheet

Count sheets reuse `HandheldDocument` (type `COUNT_SHEET`, source `stockTakeSheetId`) so there is one queue, one
station protocol, one result store and one status card for all four jobs. A sheet job has no `HandheldDocumentLine`
rows: its lines are the sheet's own, and the device file is built from the sheet as before. The checker stays a user
on `StockTakeSheet.checkerId` (the send dialog may change it); the job keeps the name in `pickerName`.

## When the web gets there first

If the source changes on the web while its job is active, the job is cancelled with a remark, so a stale result can
never be posted over the change: the picking list dispatched or its lines cancelled, the CPO billed or released, the MIT
received on an MRN or cancelled, the count sheet or its stock taking cancelled, or the sheet's counts uploaded
directly. Posting is also refused if a reserved quantity changed after the job was sent.

On the device: a cancelled job that was never started is removed at the next dock. One with entries is kept there and
the page says so; nothing from it is posted.

## Stations

Registered on **Settings > HHDC** by `handheld:stations` (seeded for SuperAdmin and Admin): branch and PC name.
The key (`<stationId>.<secret>`) is shown once; only the sha-256 of the secret is stored. **New key** replaces it,
**Revoke** stops the PC at once. The page (a card on Settings, no longer in the Inventory menu) first lists what is **ready for the handheld** and not sent yet (count sheets, indents to pick for transfer, CPOs, MITs), each linking to the page it is sent from, for the types the user may send. It also shows each station (online when it sent a heartbeat in the last 2
minutes, the docked handheld, HHDC Link version, last problem), the handhelds (named MC3190-1, -2 … at first dock,
renamable, app version, failed app updates) and every job not yet posted. Anyone who can read one of the four screens
sees it.

The station, while a handheld is docked: reads its id from `\Application\Danamotors\device.txt` (written at first
contact), installs the bundled device app if the device copy differs, reports the job files on the device, then does
what the server answers per file (COLLECT, REMOVE, KEEP), and writes the branch's waiting jobs. It never overwrites a
device file that has entries and never deletes a result before the server has it. Every 20 s it sends a heartbeat,
docked or not.

### Station protocol (`/api/handheld/station/*`, `Authorization: Station <key>`)

| Call | What |
| --- | --- |
| `POST /heartbeat` | Link version; the docked handheld (id, app version, app status) and its job files (`DOC` = job id, `SHEET` = sheet id; started, finished). Reply: the handheld's id and name, how many jobs wait, and per file COLLECT / REMOVE / KEEP. |
| `POST /deliveries/claim` | Takes every waiting job of the branch for the docked handheld under a 5-minute lease (`FOR UPDATE SKIP LOCKED`: two stations never take the same job). Returns what to write. |
| `POST /deliveries/:id/confirm` | Written and read back: `SENT`. Answers `CANCELLED` if it was cancelled meanwhile (the station removes the file). |
| `POST /deliveries/:id/release` | Could not write it (e.g. a file with entries in the way): back to the queue. |
| `POST /results` | A finished result. Stored as `RECEIVED`. The same result again changes nothing (a sheet's `countedAt` times are left out of the comparison, as the station stamps them when the device clock is wrong); a different result for a received job is refused (409). `clear: true` lets the station delete the device copy. A sheet the old HHDC Link wrote (no job) gets a job created as received. |
| `POST /devices/:deviceId/cleared` | Cancelled jobs removed from the device. |

## Notifications (in-app, `HANDHELD_NOTIFICATION_TYPES`)

| Type | When | To |
| --- | --- | --- |
| `HANDHELD_WAITING_NO_STATION` | Sent while no station of the branch is online | Sender, branch store officers |
| `HANDHELD_WAITING_LONG` | Still waiting after 2 h (once) | Sender, branch store officers |
| `HANDHELD_DELIVERED` | On a handheld | Sender |
| `HANDHELD_RECEIVED` | Finished on the handheld, with a summary ("2 line(s) short") | Sender, users of the branch whose role may post that job |
| `HANDHELD_POSTED` | Posted by someone else | Sender |
| `HANDHELD_CANCELLED` | Cancelled by the web or by someone else, with the remark | Sender |
| `HANDHELD_STATION_OFFLINE` | A station missed heartbeats for 2 minutes **while jobs of its branch wait** (once per outage; PCs are off at night) | Branch store officers, Admin |
| `HANDHELD_INSTALL_FAILED` | The device app could not be installed on a handheld | Branch store officers, Admin |

A sweep runs every minute (`startHandheldSweep` in `server.ts`) for the timed notices and the cancel notices (cancels
happen inside other modules' transactions, so the sweep tells the sender after they commit).

## Permissions

Each job uses the permissions of the web screen it stands in for (unchanged):

| Type | Read | Send, post, cancel |
| --- | --- | --- |
| `COUNT_SHEET` | `stocktake:read` (an audit's sheet `stockaudit:read`) | `stocktake:manage` (`stockaudit:manage`) |
| `INDENT_PICK` | `transfer:read` | `transfer:dispatch` |
| `CPO_PICK` | `partsale:read` | `partsale:order` |
| `MIT_RECEIVE` | `stock:read` | `stock:update` |

Station keys: `handheld:stations`. Pickers and checkers do not sign in; they are chosen when the job is sent.

## API (users)

`GET /api/handheld/sources?type=`, `GET /api/handheld/pickers`, `GET /api/handheld/documents` (filters `type`, `status`,
`branchId`, `sourceId`, `indentId`, `stockTakeId`), `POST /api/handheld/documents` (queues; `manual: true` is the IT
tool, which writes the device itself), `GET /api/handheld/documents/:id` (with `review` when received),
`POST /api/handheld/documents/:id/post`, `POST /api/handheld/documents/:id/upload` (IT tool: receive and post in one
step), `PATCH /api/handheld/documents/:id/cancel`, `GET /api/handheld/stations/status`, `GET|POST /api/handheld/stations`,
`POST /api/handheld/stations/:id/rotate-key`, `PATCH /api/handheld/stations/:id/revoke`, `PATCH /api/handheld/devices/:id`.
See Swagger (`/api/docs`, tags Handheld and Handheld Station).

HHDC Link's window remains the IT tool (register the station, fault finding, manual send and receive); its CLI has
`station key|once|run` besides the earlier commands.

## Legacy mapping

| Legacy | New |
| --- | --- |
| `HHDCDownloadHead` / `HHDCDownloadDetail` with `DownloadType` BI or CPO (`Picker`, `QtyAllotted`, `QtyUploaded`, `PartOrdered` vs `Part`, `PickDate`) | `HandheldDocument` (`INDENT_PICK`, `CPO_PICK`) and `HandheldDocumentLine` (`expectedQuantity`, `quantity`, `scannedPartNumber`) |
| Physical stock download / upload to the HHDC | `HandheldDocument` (`COUNT_SHEET`) over a `StockTakeSheet` |
| Cancelling a download (`CancelledDt`; `allottedcancel` keeps the allotment) | Cancel on the page; reservations stay with the picking list or CPO, which have their own release |
| MIT `pctohhdc` / `hhdctopc`, `Downloadno`, `AllottedTo`, `RCVDQTY`, `DMGDQTY`, `Newpart` on `MATERIALINTRANSITDETAIL` | `HandheldDocument` (`MIT_RECEIVE`): lines carry received and damaged; `extra` lines are the legacy new parts |
| MIT "Update Bin" (`Newlocation`) | Not carried over: never used (the new bin always equals the old one) |
| BIT receiving on the device (`AEBIT.sdf`) | Not carried over: no use since 2014; branches receive the STN on the web |
| "Load Parts from HHDC" on the Pick List for Countersale/Challan | The counter-sale bill takes picked CPO lines first |
| The PC download/upload screens, run by the store | The page's Send / Post; the station moves the files unattended |
