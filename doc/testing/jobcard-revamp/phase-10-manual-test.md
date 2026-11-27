# Job card revamp, phase 10: manual test guide

## What changed in this phase

The **Job Cards** page now has two views: a **Board** and a **Table**. The board shows every job that is still in the workshop as a card, in one column per step, so a supervisor can see at a glance who has each job and where jobs are stuck. Each card shows how long the job has been at its step; when that is longer than the branch's time target, the time turns amber with the words "over target", and red with "far over target" when it is more than twice the target. Five figures at the top count the jobs in the workshop, awaiting approval, waiting for parts, ready for collection and overdue. The workshop supervisor and the service manager now open **Job Cards** on the board; everyone else still opens on the table, which has a new **With** column. The time targets are set per branch in Settings.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000038.
- **Step**: where the job is now: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing or Delivery.
- **Board**: the view with one column per step and one card per job.
- **Card**: the box for one job on the board. Clicking it opens that job card.
- **With**: the person (or role, such as "Warranty officer") who holds the job at its step now.
- **Time target**: how long a job should take at a step, set per branch. Check-in, Diagnosis, Warranty check, Awaiting approval and Quality check have one. In repair, Waiting parts and Ready do not.
- **Overdue**: the time promised to the customer has passed and the job is not ready yet.
- **Received**: the day the job card was opened.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Workshop supervisor | wm.lagos@kiaamotors.com | Engr Isiaka | wm.lagos@kiaamotors.com (Rotimi Ajayi) |
| Service manager | servicemanager@kiamotors.com | Mark Folorusho | servicemanager@kiamotors.com |
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com (Chidi Eze) |
| Administrator (settings, another branch) | the administrator account you normally use | | admin.lagos@danamotors.com |

**Demo jobs.** All are at **Main Branch**; customer names are fictional. The job numbers are the ones on the test site; on the developer's computer they are in brackets. You do not need to open these jobs in advance.

| Plate | Job number | Column on the board | With |
|---|---|---|---|
| KJA-482TX | 2026000033 (2026000012) | Check-in | Chidi E. |
| LSR-512ST | 2026000034 (2026000013) | Diagnosis | Workshop supervisor |
| KJA-527ST | 2026000049 (2026000026) | Warranty check, tags **Warranty** and **Repeat, review pending** | Warranty officer |
| LSR-516ST | 2026000038 (2026000017) | Waiting parts | Tunde A. |
| LSR-541ST | 2026000064 (2026000046) | Ready | Billing officer |

This phase changes no jobs, so the sections can be repeated. Section H changes a branch setting and puts it back.

**Phone and tablet size.** In Chrome press **F12**, click the device toolbar icon (a phone and tablet, top left of the panel), and choose **iPhone 12 Pro** (390 wide) or **iPad Mini** (768 wide) from the list at the top of the page. Press **F12** again to go back to the normal size.

**Settings to check first.** Sign in as an administrator, click **Settings** in the left menu, then **Company & Branch Settings**. Under **Branch rules**, choose **Branch: Main Branch** and find the group **Workshop board time targets**. Expected: **Check-in (minutes)** 30, **Diagnosis (minutes)** 120, **Warranty check (minutes)** 120, **Awaiting approval (minutes)** 120, **Quality check (minutes)** 60. If any differ, enter these values and click **Save branch rules**. Expected: "Saved." under the form. Sign out.

## A. The board (workshop supervisor, laptop)

1. Sign in as the **Workshop supervisor**. Click **Job Cards** in the left menu.
   - **Expected:** the page title **Workshop board** with "Every active job in the workshop, by step, with who has it and how long it has been there." At the top right, a toggle with **Board** (dark, selected) and **Table**.
2. Look at the row of filters.
   - **Expected:** **Branch** showing "Main Branch", **Service advisor** showing "All advisors", **Technician** showing "All technicians", **Received** showing "Any day", and **Clear filters** in grey (nothing to clear).
3. Look at the line under the filters.
   - **Expected:** "Updated (time, for example 14:05). The board refreshes every minute." and on the right **Refresh now**.
4. Look at the five boxes under that line.
   - **Expected:** a number above each of these words: **In workshop**, **Awaiting approval**, **Waiting parts**, **Ready for collection**, **Overdue**. When Overdue is above 0, its box is red. Write the five numbers in your results table.
5. Look at the columns.
   - **Expected:** coloured headings **Check-in**, **Diagnosis**, **Warranty check**, **Awaiting approval**, then (scrolling sideways inside the board) **In repair**, **Waiting parts**, **Quality check** and **Ready**, each followed by a number. Check-in shows "Target 30 min", Diagnosis, Warranty check and Awaiting approval "Target 2 h", Quality check "Target 1 h". In repair, Waiting parts and Ready show no target.
6. Check the figures against the columns.
   - **Expected:** **Awaiting approval** equals the Awaiting approval column number, **Waiting parts** the Waiting parts column number, and **Ready for collection** the Ready column number. **In workshop** equals Diagnosis + Warranty check + Awaiting approval + In repair + Waiting parts + Quality check (not Check-in or Ready).
7. Find the card **KJA-482TX** in **Check-in**.
   - **Expected:** the plate in bold, the job number on the right, "Kia Sportage", the customer name, a purple **Warranty** label, a round badge with "CE" and "With: Chidi E.", a clock with the time at this step (for example "1 day 1 h, far over target", in red), a calendar line "Promised: (Today, Tomorrow, Yesterday or a date), (time)" and, if that time has passed, "Promised time passed" in red with a warning icon.
8. Find **KJA-527ST** in **Warranty check**.
   - **Expected:** "With: Warranty officer", the purple **Warranty** label and the amber **Repeat, review pending** label.
9. Find **LSR-516ST** in **Waiting parts** (scroll the board sideways with the mouse or trackpad).
   - **Expected:** "With: Tunde A." and a time with no colour and no "over target" words, because Waiting parts has no target. Only the board scrolls sideways; the page title and filters stay still.
10. Find **LSR-541ST** in **Ready**.
    - **Expected:** "With: Billing officer". Ready cards never show "Promised time passed".
11. Click the card **LSR-516ST**.
    - **Expected:** the job card opens at **Step 5 of 8: Repair**.
12. Click the browser's back button.
    - **Expected:** the board again, with the same filters.

**Pass if:** the board opens by itself for the supervisor, every column and figure is there, the figures add up as in step 6, and each card shows plate, model, customer, With, time and promised time.

## B. Stuck jobs stand out, in words as well as colour

1. Still on the board, look at the cards in **Diagnosis**.
   - **Expected:** jobs that have been there more than 4 hours (twice the 2 hour target) show the time in red with ", far over target". Jobs between 2 and 4 hours show amber with ", over target". Jobs under 2 hours show the time on grey with no words.
2. Note the time on the first **Check-in** card, for example "1 day 1 h". Work out its minutes (1 day is 1,440 minutes, 1 hour is 60), for example 1,500.
   - **Expected:** nothing to check yet.
3. Sign out, sign in as the **Administrator**, open **Settings**, **Company & Branch Settings**, **Branch: Main Branch**, group **Workshop board time targets**. In **Check-in (minutes)** type a number a little below the minutes from step 2 but more than half of it, for example 1000 for 1,500. Click **Save branch rules**.
   - **Expected:** "Saved." under the form.
4. Click **Job Cards**, then **Board** at the top right.
   - **Expected:** the Check-in heading shows the new target (for example "Target 16 h 40 min"), and the first Check-in card now shows its time in amber with ", over target".
5. Go back to the settings, type **30** in **Check-in (minutes)** and click **Save branch rules**.
   - **Expected:** "Saved.". The board again shows "Target 30 min" for Check-in.

**Pass if:** over target is amber with "over target", far over is red with "far over target", within target has no colour and no words, and changing the target changes the board.

## C. Filters, and the page address keeps them

1. Sign in as the **Workshop supervisor** and open **Job Cards**. Click in **Technician** and type **Tunde**.
   - **Expected:** a list under the box with "Tunde Akinyemi" (on the developer's computer, pick any technician in the list).
2. Click **Tunde Akinyemi**.
   - **Expected:** the box shows "Tunde Akinyemi", the board shows only his jobs (LSR-516ST is still in Waiting parts), the figures change to match, and **Clear filters** is no longer grey.
3. Copy the page address from the address bar. Open a new tab, paste it and press **Enter**.
   - **Expected:** the same board, with Technician "Tunde Akinyemi" still chosen.
4. In the new tab, choose **Received: Pick a date**. In the date box that appears, type **01/01/2020** and press **Tab**.
   - **Expected:** "No active jobs match these filters", "Try another service advisor, technician or received date." and a **Clear filters** button.
5. Click **Clear filters** (the one in the middle of the page).
   - **Expected:** Technician shows "All technicians", Received shows "Any day", and the full board is back.
6. In **Service advisor** type **Chidi** and choose **Chidi Eze**.
   - **Expected:** only Chidi Eze's jobs, KJA-482TX among them in Check-in.
7. Click **Clear filters** at the end of the filter row.
   - **Expected:** "All advisors" again and the full board.

**Pass if:** each filter narrows the board, the address keeps the filters in a new tab, and Clear filters resets them.

## D. The table view

1. On the board, click **Table** at the top right.
   - **Expected:** the title changes to **Job Cards** with "(number) job cards on record", **Table** is now dark, an **Export** button appears (and **Vehicles with multiple jobs** if your account may see it), and the list has the columns Job #, Vehicle Reg No, Customer, Branch, Agent, Technician, Status, **Step** and **With**.
2. Find the row for **LSR-516ST** (type it in the search box and press **Enter**).
   - **Expected:** Step "Repair", With "Tunde Akinyemi".
3. Clear the search box. Find a delivered job (Step "Closed").
   - **Expected:** With "No one, job delivered".
4. Click **Board**.
   - **Expected:** the board again.

**Pass if:** the table shows the Step and With columns with readable words, and the toggle moves between the two views.

## E. Someone who is not a supervisor, and another branch

1. Sign out. Sign in as the **Service advisor** and click **Job Cards**.
   - **Expected:** the title **Job Cards** and the table (the advisor opens on the table). **Table** is dark in the toggle.
2. Click **Board**.
   - **Expected:** the workshop board opens. The **Branch** box shows "Main Branch" in grey with "Your account works in one branch." under it.
3. Click a card.
   - **Expected:** the job opens. The board is for looking; anything the advisor can or cannot do on the job is decided by the job card itself, as before.
4. Still as the advisor, replace the page address with the test site address followed by `/job-cards?view=board&branch=9b0bca32-a691-48a4-864b-3f2bb9da69de` and press **Enter**. On the developer's computer use `http://localhost:3000/job-cards?view=board&branch=d9699a4a-b84b-45f7-87da-82d85e73e582`.
   - **Expected:** a shield icon, "You cannot see this workshop board" and "Your account does not have access to Abuja Branch. Choose your own branch, or ask your administrator for access." The Branch box shows "Abuja Branch".
5. In **Branch** choose **Main Branch**.
   - **Expected:** the Main Branch board.
6. Sign out. Sign in as the **Service manager** and click **Job Cards**.
   - **Expected:** the board opens by itself, as for the supervisor.

**Pass if:** the advisor opens on the table and can switch, another branch is refused with a clear sentence, and the service manager opens on the board.

## F. Loading, offline and errors

1. Sign in as the **Workshop supervisor** and open the board. Press **F12**, click the **Network** tab, open the throttling list (it says "No throttling") and choose **Slow 4G**. Reload the page.
   - **Expected:** while it loads, grey outline boxes in the shape of the figures and the columns, never a blank page or a spinner on its own.
2. In the same list choose **Offline**. Click **Refresh now**.
   - **Expected:** the button reads "Refreshing" for a moment, then a red line "Could not refresh the board. It shows the jobs as at (time)." with **Try again**. The cards stay on screen.
3. Choose **No throttling** again. Click **Try again** in the red line.
   - **Expected:** the red line goes and the "Updated" time changes.
4. Choose **Offline** again and reload the page.
   - **Expected:** the browser's own "No internet" page (the app cannot load without a connection).
5. Choose **No throttling** and reload. Leave the board open for two minutes without touching it.
   - **Expected:** the "Updated" time changes by itself about every minute. Switching to another program and back also refreshes it.
6. Press **F12** to close the panel.

**Pass if:** loading shows outlines, a failed refresh keeps the cards and says so, and Try again recovers.

## G. Keyboard only

1. On the board, click the page title once, then press **Tab** repeatedly.
   - **Expected:** a visible ring moves through **Board**, **Table**, **Branch**, **Service advisor**, **Technician**, **Received**, **Clear filters** (skipped while grey), **Refresh now**, then the whole board area, then each card in turn.
2. With the ring on **Table**, press **Enter**.
   - **Expected:** the table view. Press **Shift + Tab** back to **Board** and press **Enter** to return.
3. Tab to **Technician** and type **Tunde**. Press the **Down arrow**, then **Enter**.
   - **Expected:** Tunde Akinyemi is chosen and the board narrows.
4. Tab back to **Technician**, type **K**, then press **Esc**.
   - **Expected:** the list closes and the box still shows "Tunde Akinyemi". Click **Clear filters**.
5. Tab until the ring is on the board area (a ring round all the columns). Press the **Right arrow** a few times.
   - **Expected:** the columns scroll sideways.
6. Press **Tab** until the ring is on a card, then press **Enter**.
   - **Expected:** that job card opens.

**Pass if:** everything works without a mouse and the ring is always visible.

## H. Phone and tablet

1. Make the browser **iPhone 12 Pro** size (see "Before you start") and open the board.
   - **Expected:** the title, the toggle, a **Filters** button, the "Updated" line, the five figures (two per row, Overdue across the full width) with their labels in full, then **Step**, a list showing a step name with its number in brackets, for example "Check-in (5)", and that step's cards underneath. Nothing scrolls sideways.
2. Open **Step** and choose **Waiting parts (1)**.
   - **Expected:** only the LSR-516ST card. The address now ends with `column=WAITING_PARTS`.
3. Tap the **LSR-516ST** card.
   - **Expected:** the job opens at "Step 5 of 8: Repair". Go back.
4. Tap **Filters**.
   - **Expected:** the button reads **Hide filters** and the Branch, Service advisor, Technician and Received boxes appear.
5. Choose **Received: Today**, then tap **Hide filters**.
   - **Expected:** the button reads **Filters, 1 applied**. Open it again and tap **Clear filters**.
6. Make the browser **iPad Mini** size and reload.
   - **Expected:** the filters are shown in two rows, the figures three then two per row, and the columns side by side, scrolling sideways inside the board only.

**Pass if:** on a phone the columns become a step list with nothing cut off, and on a tablet the board scrolls only inside itself.

## I. A branch with no active jobs

1. Make the browser normal size. Sign in as the **Administrator**, click **Job Cards**, then **Board**.
   - **Expected:** the board. The administrator can choose any branch in **Branch**.
2. In **Branch** choose **Dana Motors Demo** (it has no open jobs on the test site; on the developer's computer every branch has jobs, so skip this section there).
   - **Expected:** a car icon, "No active jobs in the workshop", "Jobs appear here as soon as they are opened." and a dark **Open a job card** button. No figures and no columns.
3. Click **Open a job card**.
   - **Expected:** the page for opening a new job card. Do not save anything. Click **Job Cards** in the left menu.

**Pass if:** an empty branch explains itself and offers Open a job card.

## J. Handing over: the board follows the job

1. As the **Service advisor**, open **KJA-482TX** from the board (Check-in column). Note the **With:** line in the job header.
   - **Expected:** "With: Chidi Eze (Service advisor) since (date, time)", matching "With: Chidi E." on the card.
2. Open **Job file** at the top of the job, then the **Activity** tab.
   - **Expected:** the job's history; the newest entry is the last step change, whose time matches the "since" time in the header. The card's time at this step counts from that moment.
3. Go back to the board.
   - **Expected:** KJA-482TX is still in Check-in with the same With. (Moving a job to another step is tested in phases 2 to 9; after such a move the card appears in the new column within a minute, or at once with **Refresh now**, with the new person in **With** and its time starting again from 0 min.)

**Pass if:** the card's With and time agree with the job header and the Activity tab.

## Always report

Report any of these, wherever you see them:
- emojis or odd symbols used as icons;
- the words "undefined", "null" or "NaN";
- codes in capitals with underscores, such as WAITING_PARTS or IN_REPAIR (except in the page address, where they are expected);
- garbled characters, such as "â‚¦" or a black diamond with a question mark;
- a browser pop-up box (the grey kind with an OK button);
- buttons that do nothing when clicked;
- a grey button with no sentence saying why;
- input you typed that disappears;
- the page scrolling sideways (only the board area may).

## Not in this phase

- The printed job card and gate pass layout from the paper form come in **phase 11**.
- The list view's own status filter chips (All, Unassigned technician, Open and so on) and the Export button are unchanged from before; they are cleaned up in **phase 12**.
- Time targets for In repair, Waiting parts and Ready are not set. Their times never turn amber or red.
- The board does not update the instant someone else moves a job; it refreshes every minute or with **Refresh now**.
- PDI jobs have their own screens and are not on the board.

## Results table

| Step | Pass or Fail | What I saw |
|---|---|---|
| Settings check | | |
| A1 | | |
| A2 | | |
| A3 | | |
| A4 | | |
| A5 | | |
| A6 | | |
| A7 | | |
| A8 | | |
| A9 | | |
| A10 | | |
| A11 | | |
| A12 | | |
| B1 | | |
| B2 | | |
| B3 | | |
| B4 | | |
| B5 | | |
| C1 | | |
| C2 | | |
| C3 | | |
| C4 | | |
| C5 | | |
| C6 | | |
| C7 | | |
| D1 | | |
| D2 | | |
| D3 | | |
| D4 | | |
| E1 | | |
| E2 | | |
| E3 | | |
| E4 | | |
| E5 | | |
| E6 | | |
| F1 | | |
| F2 | | |
| F3 | | |
| F4 | | |
| F5 | | |
| F6 | | |
| G1 | | |
| G2 | | |
| G3 | | |
| G4 | | |
| G5 | | |
| G6 | | |
| H1 | | |
| H2 | | |
| H3 | | |
| H4 | | |
| H5 | | |
| H6 | | |
| I1 | | |
| I2 | | |
| I3 | | |
| J1 | | |
| J2 | | |
| J3 | | |

## How to report a problem

For each problem, send:
- the phase and step number (for example "Phase 10, C3");
- the job number and plate, if a job is involved;
- the role you were signed in as;
- what you expected (copy the **Expected** line);
- what happened instead;
- a screenshot: press **Windows + Shift + S**, drag over the screen, then paste it into your message.
