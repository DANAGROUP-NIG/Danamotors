# Job card revamp, phase 6: manual test guide

## What changed in this phase

Step 5 of a job card, **Repair**, is rebuilt. The technician now works from a phone: a tick-list of the approved work with big **Start** and **Done** buttons, a **Parts** card to collect parts from the store with one signature, and buttons to report a part or problem they found and to pause the job while parts are awaited. **Send for quality check** stays grey until every piece of work is done, and says why. Technicians have a new home page, **My jobs**, listing their jobs for today, those waiting for parts and those finished today. The service advisor sees the work progress, the parts and the labour recorded, and when the technician finds something new, prepares a **supplementary estimate** that the customer approves on the tablet or by phone, while the approved work carries on.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000057.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery, shown as numbered circles near the top of the job (on a phone, as "Step 5 of 8: Repair" with a bar).
- **Work line**: one piece of approved work on the technician's list, for example "Replace front brake pads". Each has a status: **Not started**, **In progress**, **Waiting parts** or **Done**.
- **Collect and sign**: the technician signs on the screen to confirm they took parts from the store.
- **Finding**: something the technician found that the customer did not approve yet, for example a torn wiper blade.
- **Supplementary estimate**: an extra estimate for new findings, priced as a new version (revision 2) of the job's estimate. Only the new items are shown to the customer.
- **Quality check**: step 6, where the workshop supervisor checks the work.
- **Bar**: the strip fixed at the bottom of the job page with the main button. A grey main button has a sentence above it saying why it cannot be pressed yet.
- **Bottom sheet**: on a phone, a panel that slides up from the bottom of the screen.
- **Header**: the top of the job, with the line **With: (name and role) since (date)**, which says who holds the job now.
- **Toast**: the short green (or red) message that appears for a few seconds.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Technician (assigned to the demo jobs) | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com (Tunde Akinyemi) |
| Another technician | tech2@danamotors.com | Kingsley Okoro | tech2@kiamotors.com (Kingsley Okoro) |
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com (Chidi Eze) |
| Workshop manager (supervisor) | wm.lagos@danamotors.com | Rotimi Ajayi | wm.lagos@kiaamotors.com (Rotimi Ajayi) |

**Demo jobs.** All are at **Main Branch** and at step 5, Repair. To open one, use **Job Cards** in the left menu, type the plate in the search box, then click the three-dot **Actions** button at the end of the row and **View details**. The job numbers are the ones on the test site; on the developer's computer they are in brackets.

| Plate | Job number | Where it is | Used in section |
|---|---|---|---|
| KJA-534ST | 2026000057 (2026000039) | Service done, brake pads in progress, AC repair (warranty) waiting for the compressor. Brake pads and engine oil ready to collect | A, B, C, D, E, F, J, K |
| LSR-535ST | 2026000058 (2026000040) | Service and brakes done. The technician found a torn rear wiper blade | G, I |
| LSR-536ST | 2026000059 (2026000041) | Brakes in progress. A supplementary estimate for the wiper blade is waiting for the customer | H, J |

Sections B to I change their jobs. After testing, ask the developer to reload the demo data before you test them again.

The service line on these jobs shows the service type's name as it is written in the service type list, for example **PAID SERVICE** in capitals. That is the master data, not a code.

**Phone or tablet size (Chrome).** Press **F12**, click the device toolbar icon (a phone and tablet, top left of the panel), then choose **iPhone 12 Pro** (390 wide) at the top of the page, or type **768** or **1024** in the width box. Press **F12** again to go back.

**Offline (Chrome).** Press **F12**, open the **Network** tab, and change **No throttling** to **Offline**. Change it back to **No throttling** afterwards.

---

## A. My jobs on a phone (technician)

1. Set Chrome to **iPhone 12 Pro** size, and sign in as the **technician**.
   Expected: the bottom menu shows **My jobs** first.
2. Tap **My jobs** in the bottom menu.
   Expected: the heading **My jobs** with today's date under it, for example "Fri 27 Nov". Three tabs: **Today (N)** (dark, selected), **Waiting parts (N)** and **Done (0)**, each with a number.
3. Find the card for **KJA-534ST**.
   Expected: the plate in large letters, "Kia Sportage" with the year, "Job" and the job number, a blue **In repair** badge, the bay (for example "Bay A3", or "No bay"), "Next: **Collect parts**", "2 items ready at the store.", a full-width button **Collect parts**, and at the bottom "Promised:" with the date and time (or "Today, 09:24" when it is today). No prices anywhere.
4. Tap **Waiting parts**.
   Expected: the tab turns dark. If none of your jobs is paused, the box reads "None of your jobs is paused for parts."
5. Tap **Done**.
   Expected: "You have not sent a job for the quality check today." (until you do so in a later section).
6. Tap **Today**, then tap **Collect parts** on the KJA-534ST card.
   Expected: the job opens at **Step 5 of 8: Repair**.

Pass if: the tabs show counts, the KJA-534ST card shows every item above, and the button opens the job.

## B. The work list and the blocked quality check (technician, phone)

1. On KJA-534ST, scroll down to the card **Your work**.
   Expected: the line "Approved work for this job. Complete each item below." and three rows:
   - **PAID SERVICE** with a green tick and a green badge "Done" and a time, for example "Done 09:24".
   - **Replace front brake pads** with a blue **In progress** badge, "Time worked:" and minutes, a large dark **Done** button and a small **Waiting parts** button.
   - **AC system check and refrigerant recharge** with an amber **Waiting parts** badge, a purple **Warranty** badge and a large **Continue** button.
2. Look at the bar at the bottom.
   Expected: a grey **Send for quality check** button that cannot be pressed, and above it "Finish all work first: 2 items left."
3. Scroll to the card **Parts**.
   Expected: "2 of 3 ready to collect at store", a full-width dark **Collect and sign** button, then "Engine oil 5W-30, 4 litres: ready at the store, issued" with a time, "Front brake pads set: ready at the store, issued" with a time, and in grey "AC compressor: requested from the store, not ready yet".
4. Below the Parts card, look at the three large buttons.
   Expected: **Need a part**, **Add a finding** and **Pause job**, each with an icon, the same height.
5. Check that no price or ₦ amount appears anywhere on this screen.
   Expected: none.

Pass if: the three work lines, the reason on the grey button and the parts card match.

## C. Collect parts with a signature (technician, phone)

1. On KJA-534ST, tap **Collect and sign**.
   Expected: a bottom sheet **Collect parts** slides up with "Tick the parts you are taking from the store, then sign.", two ticked rows "Front brake pads set" and "Engine oil 5W-30, 4 litres", each with "Qty 1", an empty signature box with **Clear signature**, and "Your signature confirms you received these parts from" followed by the store person's name.
2. Untick both rows and tap **Sign and collect**.
   Expected: red "Tick at least one part you are collecting" under the list and red "Sign in the box to confirm you received the parts" under the signature box. The sheet stays open.
3. Press **Esc** on the keyboard, then click on the dark area above the sheet.
   Expected: the sheet stays open both times.
4. Tick both rows again.
   Expected: the red "Tick at least one part..." message disappears.
5. Sign in the box with the mouse or a finger.
   Expected: the red "Sign in the box..." message disappears.
6. Tap **Sign and collect**.
   Expected: the button shows "Saving collection" with a spinner for a moment, then toast "2 parts collected and signed for" and the sheet closes. The Parts card now reads "1 part is not ready at the store yet." and **Collect and sign** is gone.

Pass if: both mistakes are named, the sheet only closes on success, and the parts card updates.

## D. Mark work done (technician, phone)

1. On KJA-534ST, tap **Done** on **Replace front brake pads**.
   Expected: toast "Replace front brake pads marked done". The row turns green with "Done" and the time. The bar now says "Finish all work first: 1 item left."
2. Tap **Continue** on **AC system check and refrigerant recharge**.
   Expected: toast "AC system check and refrigerant recharge started". The badge changes to **In progress** and the button to **Done**.
3. Tap **Waiting parts** under that row.
   Expected: toast "AC system check and refrigerant recharge is waiting for parts". The badge is amber **Waiting parts** again and the button reads **Continue**. "Time worked:" keeps the minutes already worked.

Pass if: each tap changes the row at once with a toast, and the reason on the bar counts down.

## E. Need a part and Add a finding (technician, phone)

1. On KJA-534ST, tap **Need a part**.
   Expected: a bottom sheet **Need a part** with "The service advisor prepares a supplementary estimate for the customer.", a blue note "Do not do this work until the customer approves it. Work already approved continues.", a box **Why is the part needed? \*** and under **Part needed** a button **Choose a part**.
2. Tap **Send to service advisor** without typing anything.
   Expected: red "Say why the part is needed, in at least 3 characters" under the box and red "Choose the part you need" under the button.
3. Type **Rear wiper blade torn, smears the screen.** in **Why is the part needed?**
   Expected: the first red message disappears.
4. Tap **Choose a part**, type **wiper** in the search box, and tap **Rear wiper blade**.
   Expected: the search closes and the **Need a part** sheet comes back with your text still there and a row "Rear wiper blade" with **Quantity** 1 and a bin icon.
5. Change **Quantity** to **0** and tap **Send to service advisor**.
   Expected: red "Enter a quantity above 0, with at most 2 decimal places".
6. Change **Quantity** to **1** and tap **Send to service advisor**.
   Expected: the button shows "Sending" for a moment, then toast "Sent to Chidi Eze for a supplementary estimate". The sheet closes.
7. Look at **Your work**.
   Expected: a new grey row with a lock, "Rear wiper blade", an amber badge **Waiting for estimate** and "Do not start this work until the customer approves it. The service advisor is preparing a supplementary estimate." It has no Start button.
8. Look at the bar.
   Expected: "A new finding is waiting for the service advisor's supplementary estimate." is added to the reason.
9. Tap **Add a finding**, then **Send to service advisor** with nothing filled in.
   Expected: red "Write what you found, in at least 3 characters" and red "Add the work or part this finding needs". The sheet has two buttons: **Choose a part** and **Add work**.
10. Tap **Cancel**.
    Expected: the sheet closes and nothing is sent.

Pass if: every mistake is named, typed text survives the part search, and the new item is locked on the list.

## F. Pause and resume (technician, phone)

1. On KJA-534ST, tap **Pause job**.
   Expected: a sheet **Pause job** with "Job (number) stops until you resume it.", **Reason** with **Waiting parts** chosen, a box **Which parts (optional)** and the line "Work in progress stops its clock. Press Resume repair when the parts arrive."
2. Type **AC compressor** and tap **Pause job** in the sheet.
   Expected: toast "Job (number) paused for parts". An amber banner "The job is paused while it waits for parts. Press Resume repair when the parts arrive." The header badge reads **Waiting parts**. Any line that was in progress shows **Waiting parts**.
3. Look at a row's **Continue** button.
   Expected: grey, with "The job is paused for parts. Resume the job first." under it.
4. Look at the **Pause job** button.
   Expected: grey, with "The job is already paused." under it.
5. Tap **Resume repair** in the bar.
   Expected: toast "Work resumed on job (number)". The amber banner goes and **Continue** can be pressed again.
6. Open **My jobs** while the job is paused (do steps 1 and 2 again first, then resume after this step).
   Expected: the job is under **Waiting parts** with an amber **Waiting parts** badge and "Next: **Open job**", "Paused while the job waits for parts."

Pass if: pausing stops the work with a reason on every blocked button, and resuming brings it back.

## G. The advisor follows the repair and prepares a supplementary estimate (desktop)

1. Sign in as the **service advisor** at full desktop size, tap the bell, and look for "New finding during repair" with the job number, customer, plate and "Tunde Akinyemi: Rear wiper blade torn. It smears the rear screen." Then open **LSR-535ST**.
   Expected: the header reads "With: Tunde Akinyemi (Technician) since" and a date. A yellow banner "Waiting for Tunde Akinyemi (Technician). You can view this step but only the technician can update it."
2. Look under **Step 5 of 8: Repair**.
   Expected: an amber banner with a spanner icon: "**New finding from Tunde Akinyemi: Rear wiper blade torn. It smears the rear screen.** The customer must approve before this work is done." and "Work already approved continues." with a dark button **Prepare supplementary estimate**.
3. Look at **Work progress**.
   Expected: "2 of 2 done" with a full bar; a table **Work (approved)**, **Status**, **Technician**, **Time spent**; rows PAID SERVICE and Replace front brake pads, each with a green **Done** badge, "Completed at" and a time, "Tunde Akinyemi", and the time spent (for example "Under 1 min" or "1 h 20 min").
4. Look at **Parts**.
   Expected: the table **Part**, **Qty**, **Requested**, **Issued by store**, **Collected by technician**, **Status**. "Front brake pads set", 1, a date and time, the issue date and time with the store person's name under it, "Not collected yet", and a blue **Ready to collect** badge.
5. Look at **Labour recorded**.
   Expected: "Replace front brake pads", "1 h", "Tunde Akinyemi" and the date and time.
6. Look at **Found during repair**.
   Expected: "Rear wiper blade torn. It smears the rear screen.", "Rear wiper blade, qty 1; Replace rear wiper blade", who and when, and an amber **Waiting for estimate** badge.
7. Click **Prepare supplementary estimate**.
   Expected: toast "Supplementary estimate, revision 2, prepared for job (number)". The page scrolls to two tabs **Prepare** (dark) and **Customer approval**, and the card **Estimate, revision 2 (supplementary), draft** with only two lines under **Customer pays (2 items)**: Rear wiper blade ₦8,500.00 and Replace rear wiper blade ₦3,000.00. The brake work is not on it.
8. Look at **Estimate summary**.
   Expected: Customer subtotal ₦11,500.00, VAT (7.5%) ₦862.50, **Customer total ₦12,362.50**, and the estimated delivery date. There is no "Suggested advance".
9. Check with a calculator: 11,500 x 7.5% = 862.50, and 11,500 + 862.50 = 12,362.50.
   Expected: the screen matches.
10. Click **Record phone approval** in the bar.
    Expected: the dialog **Record phone approval** lists only the two new items, both ticked.
11. Clear **Phone number**, type **12345** and click **Save phone approval**.
    Expected: a red message under **Phone number** naming the fix (a Nigerian mobile number). The dialog stays open.
12. Type **0803 555 0142** in **Phone number** and click **Save phone approval**.
    Expected: toast "Phone approval saved for job (number). The customer signs at delivery." The supplementary panel closes. **Work progress** now shows "2 of 3 done" and a new row **Replace rear wiper blade** "Approved 1 h, added during repair" with **Not started**. **Found during repair** shows a green **Approved** badge.

Pass if: the progress, parts and labour are shown without prices on the technician's lines, only the new items are priced, and approval adds the new work.

## H. The customer approves a supplementary estimate on the tablet

1. As the **service advisor**, set the size to **1024** wide and open **LSR-536ST**.
   Expected: the tabs **Prepare** and **Customer approval** (dark), and the heading "Extra work found on LSR-536ST" with "Approve the extra work you want us to do. You can decline any item. The work you already approved continues." Only the wiper blade items are listed; the brake pads are not.
2. Scroll down and press **Approve and sign** without signing.
   Expected: red "Ask the customer to sign in the box" and red "The customer must accept the estimate terms".
3. Tick "I approve the work above at the prices shown and accept the estimate terms and conditions."
   Expected: the terms message disappears.
4. Sign in the box.
   Expected: the signature message disappears.
5. Press **Approve and sign**.
   Expected: toast "Estimate approved and signed for job (number)". The page goes back to the work progress view.

Pass if: the customer sees only the new items and every mistake clears as soon as it is fixed.

## I. Hand over to the quality check (technician, then supervisor)

1. Sign in as the **technician** (phone size) and open **LSR-535ST** (after section G).
   Expected: the new row **Replace rear wiper blade** with a grey "Added during repair" badge and **Start**.
2. Tap the bell at the top.
   Expected: a notification "Supplementary work approved" with the job number, customer and plate. (The store also receives "Parts requested" for the rear wiper blade.)
3. Tap **Start**, then **Done** on **Replace rear wiper blade**.
   Expected: the row is green with "Done" and the time. The bar's **Send for quality check** becomes dark.
4. Tap **Send for quality check**.
   Expected: toast "Job (number) sent to workshop supervisor" (or the quality inspector's name, if one is set on the job). The heading reads **Step 6 of 8: Quality check** and the header "With: Workshop supervisor since" and the time.
5. Open **My jobs**, tab **Done**.
   Expected: the LSR-535ST card with "Sent for quality check at" and the time, and the button **View job**.
6. Sign in as the **workshop manager** and tap the bell.
   Expected: a notification "Inspect completed work" with the job number, plate, customer and "In progress to Quality check".
7. Open the job, click **Job file** at the top, then **Activity**.
   Expected: a line for the move from Repair to Quality check by Tunde Akinyemi, with the date and time.

Pass if: the job reaches the quality check only after all work is done, and the supervisor is told.

## J. Someone else's step, and permission denied

1. Sign in as **another technician** (Kingsley Okoro), phone size, and open **KJA-534ST**.
   Expected: "Waiting for Tunde Akinyemi (Technician). You can view this step but only the technician can update it." The work list shows statuses but no Start, Done or Continue buttons, no **Collect and sign** (if parts are waiting at the store it says "Only the technician assigned to this job can sign for the parts." instead) and no **Need a part**, **Add a finding** or **Pause job**.
2. As that technician, open **My jobs**.
   Expected: KJA-534ST is not listed (it is not assigned to them).
3. Sign in as the **service advisor** and open **My jobs** by typing `/my-jobs` after the site address.
   Expected: a grey note "My jobs lists the jobs assigned to you as a technician. To find any other job, open Job cards." with **Job cards** as a link. The tabs show 0.
4. As the **service advisor**, open **LSR-536ST** while it waits for the customer (before section H), or **LSR-535ST** before section G.
   Expected: no Start or Done buttons anywhere; the advisor sees progress tables, not the technician's list.

Pass if: nobody but the assigned technician (or the workshop supervisor) can change the work, and each person is told why.

## K. Loading, offline, sizes and keyboard

1. As the **technician**, open **KJA-534ST** and watch while it loads.
   Expected: grey placeholder shapes briefly, then the page. No spinner that never stops.
2. Turn the network to **Offline**, then tap **Continue** (or **Done**) on a work line.
   Expected: a red message under that row, for example "The work was not updated. Check your connection and try again.", and a **Try again** button. The row keeps its status.
3. Turn the network back to **No throttling** and tap **Try again**.
   Expected: the row changes and a toast confirms it.
4. Open **My jobs**, turn the network to **Offline**, then tap the **Waiting parts** tab.
   Expected: within a few seconds, "Your jobs could not be loaded. Check your connection and try again." with **Try again**. Turn the network back to **No throttling** and press **Try again**: the message goes and the tab's cards (or its empty message) appear.
5. Check the technician's repair page at **390**, **768** and **1024** wide, and the advisor's at **1024** and full desktop.
   Expected: nothing runs off the right edge and no sideways scrolling; tables scroll inside their card if needed; the bar's button is fully visible.
6. On **My jobs**, press **Tab** until the **Today** tab has a visible outline, then press the **Right arrow** twice.
   Expected: the selection moves to **Waiting parts**, then **Done**.
7. On KJA-534ST, use only **Tab** to reach a **Done** or **Continue** button and press **Enter**.
   Expected: the work line changes. In the **Collect parts** sheet, **Tab** moves through the ticks, **Clear signature**, **Cancel** and **Sign and collect**, and **Esc** does not close it.
8. Check the money on the supplementary estimate (section G) and the dates everywhere.
   Expected: amounts as "₦8,500.00" with the naira sign and two decimals; dates as "27 Nov 2026, 09:24" and times as "09:24".

Pass if: failures are shown with a way to retry, every size fits, and keyboard use works.

## Always report

- Emojis, odd symbols, or squares or question marks instead of letters.
- "undefined", "null" or "NaN" anywhere.
- Codes in capitals with underscores, such as IN_PROGRESS or WAITING_PARTS.
- Garbled characters, for example "â‚¦" instead of "₦".
- Browser pop-up boxes (the grey boxes from the browser itself).
- Buttons that do nothing when pressed.
- Grey (disabled) buttons with no sentence saying why.
- Anything you typed that disappears.
- Sideways scrolling on any page.

## Not in this phase

- **Quality check** (step 6) still uses the older screen. The new quality check with road test, certification and returning work to the technician comes in **phase 7**. The red "Returned from quality check" badge on My jobs and the repair page only appears once phase 7 can return a job.
- **Billing** and **Delivery** still use the older screens until **phases 8 and 9**.
- **Undo Done**: a work line marked done cannot be reopened by the technician in this phase; phase 7 reopens failed lines.
- **Expected date for parts**: the store does not record when an ordered part will arrive, so the parts table shows "Not issued yet" rather than a date.
- **Photos** on a finding raised during repair are not in this phase.
- The **Scan**, **Notifications** and **Profile** icons in the design's phone menu are not added; the app keeps its own bottom menu.
- The **Workshop board** comes in **phase 10**, and the printed job card in **phase 11**.
- Jobs released before this phase have no work list; their repair page says so and offers **View the estimate**.

## Results table

| Step | Pass or Fail | What I saw |
|---|---|---|
| A1 | | |
| A2 | | |
| A3 | | |
| A4 | | |
| A5 | | |
| A6 | | |
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
| D1 | | |
| D2 | | |
| D3 | | |
| E1 | | |
| E2 | | |
| E3 | | |
| E4 | | |
| E5 | | |
| E6 | | |
| E7 | | |
| E8 | | |
| E9 | | |
| E10 | | |
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
| G7 | | |
| G8 | | |
| G9 | | |
| G10 | | |
| G11 | | |
| G12 | | |
| H1 | | |
| H2 | | |
| H3 | | |
| H4 | | |
| H5 | | |
| I1 | | |
| I2 | | |
| I3 | | |
| I4 | | |
| I5 | | |
| I6 | | |
| I7 | | |
| J1 | | |
| J2 | | |
| J3 | | |
| J4 | | |
| K1 | | |
| K2 | | |
| K3 | | |
| K4 | | |
| K5 | | |
| K6 | | |
| K7 | | |
| K8 | | |

## How to report a problem

For each problem, send:
- the phase and step number, for example "Phase 6, E5";
- the job number;
- the role you were signed in as;
- what you expected (copy the "Expected" line);
- what happened instead;
- a screenshot (on Windows press **Windows + Shift + S**, select the area, then paste it into your message).
