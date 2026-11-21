# CSC: manual testing guide

Step-by-step checks for the CSC feature (`doc/csc.md`). Work on a **local** database only. Never run
migrations or seeds against the shared dev database in `server/.env`.

Dates in this guide are relative to the day you ran the CSC demo seed, written **D** (D+5 = five days
later, D−30 = thirty days earlier). Vehicles are named by registration (`LSC-101CS` … `LSC-114CS`). Counts
marked *(at least)* also include other demo vehicles in the database, so they can be higher.

## 0. Set up

1. Use a local Postgres database whose name contains `demo`. A ready one is `dana_demo_csc` on the
   `dana-pdi-pg` container (port 55432).
2. In `server/`, for these commands only:
   ```bash
   export DATABASE_URL="postgresql://<user>:<password>@localhost:55432/dana_demo_csc"
   npx prisma migrate deploy                    # applies 20261121100000_csc
   npx ts-node prisma/seed/seed.ts              # base data (skip if the database already has it)
   npx ts-node prisma/seed/demo/index.ts --second-branch="Abuja Branch" --csc-only
   ```
   The last command prints (dates for D = 2026-11-20):
   ```
   CSC cases (due 2026-10-06 to 2026-12-20): 21 due, 21 new, 3 already visited
     CSC-1 LSC-101CS: 1F due 2026-11-25, OPEN
     CSC-2 LSC-102CS: 2F due 2026-11-30, OPEN
     CSC-3 LSC-103CS: 3F due 2026-11-30, OPEN
     CSC-4 LSC-104CS: RG due 2026-11-30, OPEN
     CSC-5 LSC-105CS: RG due 2026-12-02, OPEN (booked)
     CSC-6 LSC-106CS: RG due 2026-10-21, OPEN
     CSC-7 LSC-107CS: RG due 2026-10-31, OPEN
     CSC-8 LSC-108CS: RG due 2026-11-25, VISITED
     CSC-9 LSC-109CS: RG due 2026-10-26, CLOSED (closed R0004)
     CSC-10 LSC-110CS: 2F due 2026-11-05, CLOSED (closed R0003)
     CSC-11 LSC-111CS: RG due 2026-11-24, OPEN
     CSC-12 ABC-112CS: RG due 2026-11-27, OPEN
     CSC-13 LSC-113CS: RG due 2026-11-28, OPEN
     CSC-14 LSC-114CS: no case (left out)
   ```
   The first line's counts include the other demo vehicles. Run it again and you get `0 new` and the same
   list: nothing is duplicated.
3. Start the API (`npm run dev` in `server/`, same `DATABASE_URL`) and the client (`npm run dev` in `client/`).
4. Users (local seed passwords):
   - `ccuofficer1@kiamotors.com`: CCU officer, Main Branch. Calls, books and closes. Cannot generate or edit the master.
   - `ccuofficer2@kiamotors.com`: CCU officer, Abuja Branch. Used for branch checks.
   - `ccumanager@kiamotors.com`: CCU manager, all branches. Generates and runs every report.
   - `servicemanager@kiamotors.com`: service manager, all branches. Everything, including the master.
   - `tech1@kiamotors.com`: technician. Has no CSC access.

### Demo data at a glance (all at Main Branch except CSC-12)

| Key | Vehicle | History | Case | 1st call | 2nd call | State |
|---|---|---|---|---|---|---|
| CSC-1 | LSC-101CS Rio | sold D−25, never serviced | 1F due D+5, 1,000 km | D−10 | D | open |
| CSC-2 | LSC-102CS Sportage | sold D−80, 1F at D−52 | 2F due D+10, 5,000 km | D−5 | D+5 | open |
| CSC-3 | LSC-103CS Sorento | sold D−170, 1F and 2F done | 3F due D+10, 10,000 km | D−5 | D+5 | open |
| CSC-4 | LSC-104CS Rio | RG at D−80, 30,000 km | RG due D+10, 35,000 km | D−5 | D+5 | open |
| CSC-5 | LSC-105CS Sportage | RG at D−78 | RG due D+12 | D−3 | D+7 | 1st call done, **booked D+10 10:00** |
| CSC-6 | LSC-106CS Sorento | RG at D−120 | RG due D−30 | D−45 | D−35 | 1st call done, **not visited** |
| CSC-7 | LSC-107CS Rio | RG at D−110 | RG due D−20 | D−35 | D−25 | never called, **not visited** |
| CSC-8 | LSC-108CS Sportage | RG at D−85, repair at D−3 | RG due D+5 | | | **visited** (early) |
| CSC-9 | LSC-109CS Sorento | RG at D−115 | RG due D−25 | | | **closed R0004** vehicle sold |
| CSC-10 | LSC-110CS Rio | sold D−105, 1F at D−75 | 2F due D−15 | | | **closed R0003** not willing |
| CSC-11 | LSC-111CS Sportage | RG at D−86 | RG due D+4 | D−11 | D−1 | 1st call closed **R0001** (partial) |
| CSC-12 | ABC-112CS Sorento | RG at D−83, **Abuja** | RG due D+7 | D−8 | D+2 | open, Abuja only |
| CSC-13 | LSC-113CS Rio | RG at D−82 | RG due D+8 | D−7 | D+3 | open: open a job card for it (step 6) |
| CSC-14 | LSC-114CS Sportage | last visit 5 years ago | none | | | left out (not seen for 48 months) |

## 1. Permissions and navigation

1. Sign in as `tech1@kiamotors.com`. **Workshop** has no **CSC Follow-up** entry. Open
   `/csc/follow-up/first` by URL: you're refused.
2. Sign in as `ccuofficer1@kiamotors.com`. **Workshop → CSC Follow-up** shows 1st Follow-up, 2nd Follow-up,
   Not Visited, CSC Master and Closure Reasons, but **not** Generate Cases. The tabs at the top of each CSC
   screen match. `/csc/generate` by URL is refused.
3. On the master and closure reasons screens the officer can view but not save: there are no Save, Add,
   Edit or Delete buttons.

## 2. Closure reasons (`/csc/close-reasons`, as `servicemanager@kiamotors.com`)

1. The list shows R0001–R0008. Final closure: R0003, R0004, R0005, R0006, R0008. Follow-up closure:
   R0001, R0002, R0007. R0001, R0003 and R0004 each show **Used on 1 case** (CSC-11, CSC-10 and CSC-9).
2. **Add reason**: the code is prefilled with **R0009**. Enter "Customer travelling" / `TRAVEL`, choose
   **Follow-up closure** and save. The new row appears and is not used.
3. Delete R0009: confirm, and it disappears.
4. Try deleting R0004: the delete button is disabled (tooltip "Used on cases"). Edit R0004 and switch
   **Active** off, save: it shows **Inactive**. It no longer appears in the reason list of the follow-up
   form. Switch it back on.

## 3. CSC master (`/csc/schedule`, as `servicemanager@kiamotors.com`)

1. The left list shows every model. The demo models (Rio, Sportage, Sorento) show **4 svc**; a model with
   no schedule shows **No schedule**.
2. Pick **Rio**. One version, **From 13 Sep 2010**. The grid shows 1F 30 / 1,000, 15 / 5, 30 / 1,000,
   15 / 500; 2F 90 / 5,000 …; 3F 180 / 10,000 …; RG 270 / 15,000, rotation 90 / 5,000, grace 45 / 2,500.
   Not visited for last = 48; job counts from = 10; on time until = 10. Each row has a small cycle timeline.
3. Set 2F **1st call** to 3 (less than 2nd call 5) and save: "2F: The 1st call must come on or before the
   2nd". Put 15 back.
4. **New version**: set the effective date to today, change RG **Due km** to 16000, open **Apply to other
   models**, tick Sportage, and **Save new version**. A toast says "Schedule saved for 2 models". Rio now
   has two version tabs (today, and 13 Sep 2010), and so does Sportage. The 2010 version is unchanged.
   *New version applies to vehicles sold from today, so the demo cases don't change.*
5. Pick a model with **No schedule**. The grid offers the legacy values for 1F/2F/3F/RG and **Save new
   version** creates it.

## 4. Generate cases (`/csc/generate`, as `ccumanager@kiamotors.com`)

1. The period defaults to **next month**. Choose **Next 30 days**. Model and Service are **All** (dropdowns
   disabled). Action **Both**, then **Generate and print**.
2. Result: "Due D to D+30" with Due in period, New, Already generated and Already visited, and a chip per
   service. Run it again: **New = 0**, and every case counts as already generated.
3. Untick **All** on Service, pick **2F** only, and generate. Only 2F counts appear, and New = 0.
4. **Call sheet** opens `csc-call-sheet` for the same dates. It lists LSC-101CS (1F, D+5), LSC-102CS (2F),
   LSC-103CS (3F), LSC-104CS (RG, 35,000 km), LSC-105CS, LSC-111CS, LSC-113CS and others *(at least)*.
   LSC-108CS is missing (visited) unless you switch Cases to **All**. Print it (132 columns) and export it
   to Excel; the rows match the screen.
5. Action **Print** goes straight to the call sheet without generating.

## 5. 1st follow-up (`/csc/follow-up/first`, as `ccuofficer1@kiamotors.com`)

1. The page opens on today (D to D) with **Due**. **Both** lists every case in the range, including
   visited and closed ones. Set **From = D−15** and **To = D**. **Due** lists LSC-101CS
   (call D−10), LSC-102CS, LSC-103CS, LSC-104CS (D−5), LSC-113CS (D−7) *(at least)*. **Done** (counted in its
   pill) lists LSC-105CS and LSC-111CS. ABC-112CS (Abuja) is never listed.
2. The tiles at the top show 1st calls due, 2nd calls due, Not visited and Visited this month for your branch.
3. Select **LSC-104CS**. The panel shows RG due D+10 at 35,000 km, calls D−5 and D+5, window −10 / +10, the
   customer Mrs Amaka Nwosu with a tappable phone, preferences (Phone, Tuesday, 10:00) and the previous
   visit job `DM-CSC-4-V1` at 30,000 km.
4. Enter call 1: today, "Owner", "No answer", done by yourself. Click **Save and next**. A toast says
   "Follow-up saved". LSC-104CS leaves **Due** (Done +1) and the next case is selected.
5. Validation: put a call date tomorrow, and saving says "A call cannot be dated in the future". With
   nothing entered, saving says "Record a call, a booking or a closure".
6. Book **LSC-102CS**: add a call "Will come Monday", switch on **Book the vehicle in**, choose D+3 09:00 and
   save. The toast names the new booking. The panel shows a blue "Booked for …" banner, and **Service
   Appointments** has a booking for LSC-102CS with source CSC and the request "2F service due … (CSC
   follow-up)". The booking toggle now says **Already booked**.
7. Partial closure on **LSC-101CS**: switch on **Close with a reason**, choose **R0007 Customer asked to call
   back later**, and save. The case stays **Open** and moves to **Done**, and the stage shows "Closed R0007".
8. Final closure on **LSC-103CS**: close with **R0005 Serviced at another workshop**, also switch on booking,
   and save. You get "A case closed with a final reason cannot also be booked". Switch booking off and save.
   The case becomes **Closed**, and the panel is read-only with a grey "Closed · R0005" banner.

## 6. A job card closes the case automatically

1. As an advisor (or `superadmin@danamotors.com`), open a new job card for **LSC-113CS** (any service type,
   mileage ≥ 25,500).
2. Back on the 1st follow-up (Both, D−15 to D), LSC-113CS is **Visited**. The panel shows a green
   "Visited · Came early" banner with the new job number linked.
3. Cancel that job card, then reload the list. LSC-113CS is **Open** again with no visit.

## 7. 2nd follow-up (`/csc/follow-up/second`, as `ccuofficer1@kiamotors.com`)

1. Set D−5 to D+5, **Due**. You see cases whose 1st call is done and whose 2nd call date falls in the range:
   LSC-111CS (2nd call D−1, after the R0001 partial closure), LSC-104CS and LSC-102CS from step 5, and
   LSC-101CS (R0007).
2. Switch on **Include 1st follow-up not done**: LSC-113CS (if re-opened) and other uncalled cases appear too.
3. Select LSC-111CS. **Earlier follow-ups** shows "1st call · Closed: R0001 Presently customer not
   available" with the driver's remarks. Record a 2nd call and save: it moves to **Done**.

## 8. Not visited (`/csc/not-visited`)

1. The default range is the last 90 days, **Due**. You see LSC-106CS (30 days overdue) and LSC-107CS (20 days
   overdue) *(at least)*. LSC-109CS and LSC-110CS are not shown (closed), and neither is LSC-108CS (visited).
2. **Only followed up**: only LSC-106CS remains (1st call at D−44).
3. **Days overdue ≥ 25**: of the CSC vehicles, only LSC-106CS remains (with or without the toggle).
4. Select LSC-107CS, record a call and close it with **R0004 Vehicle sold**. It becomes **Closed**.

## 9. Branch scope

1. Sign in as `ccuofficer2@kiamotors.com` (Abuja). The 1st follow-up from D−15 to D+5 shows **ABC-112CS** only
   *(plus any other Abuja demo vehicles)*, with no Main Branch cases.
2. A Main Branch case asked for directly is refused: `curl -H "Authorization: Bearer <this user's token>"
   http://localhost:8000/api/csc/cases/<id of LSC-104CS>` returns 403 (the integration test covers it too).
3. As `ccumanager@kiamotors.com` (all branches) both branches' cases appear.

## 10. Reports (as `ccumanager@kiamotors.com`, **Reports → Service · CSC**)

1. **CSC follow-up report**: Month = this month, then **Run**. The rows are the cases due this month, each
   with every call (1st / 2nd / NV, date, person, remarks, who called) and its outcome (Visited + job,
   Closed + reason, Booked, or Open). The cards show Generated, Contacted, Booked, Visited and Closed. Tick
   **Print previous month data**: last month's cases are added, grouped by month with subtotals (with
   D = 2026-11-20, LSC-106CS, LSC-107CS and LSC-109CS are due in October). Print and export: the totals match the screen.
2. **Vehicles not visited after due date**: due from D−60 to D. You see LSC-106CS and LSC-107CS (or only
   LSC-106CS if you closed LSC-107CS in step 8), with Days overdue. **Days not visited ≥ 25** keeps
   LSC-106CS; **Consider only followed up vehicles** keeps the followed-up ones.
3. **No-show analysis**: due from D−60 to D+30, **Model wise**, **Detail with summary**. You see LSC-109CS
   (R0004, Sorento) and LSC-110CS (R0003, Rio), plus any you closed with a final reason in steps 5 and 8.
   There's one count column per reason used, with a subtotal per model. **Service wise** regroups the
   counts by RG and 2F. **Summary only** shows just the group lines. Set **Reason = R0004**: only the
   vehicle-sold cases remain. Partial closures (R0001, R0007) never appear here.
4. As `ccuofficer1@kiamotors.com`, the hub shows only the CSC follow-up report and the call sheet; the
   other two are refused by URL.

## 11. Re-run safety

Run the demo seed again (step 0.2) and the base seed. Your changes stay: the R0004 activity, the new
schedule version, contacts, bookings and closures. Nothing is duplicated or deleted.

## Automated checks (for reference)

- Server unit: `src/modules/csc/csc.logic.test.ts` (due-date formula, windows, form rules) and
  `src/modules/reports/csc/csc.logic.test.ts`.
- Server integration on a disposable local DB (`TEST_DATABASE_URL`): `src/modules/csc/csc.integration.test.ts`
  covers schedule versions, idempotent generation, branch scope, contacts, partial and final closures,
  booking, auto-visit on job open and re-open on cancel, and report totals.
- Client: `node --test test/csc-logic.test.mjs`.
