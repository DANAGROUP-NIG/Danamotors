# Job card revamp, phase 7: manual test guide

## What changed in this phase

Step 6 of a job card, **Quality check**, is rebuilt. The workshop supervisor now checks each piece of approved work with **Pass** or **Fail**, ticks the general checks, enters the road test start and end km, and signs the statement "Vehicle checked and certified as roadworthy in all respects". **Pass quality check** hands the job to the service advisor for billing, and stays grey until everything is done, saying what is left. **Fail and return to technician** asks which work failed and what to fix, then sends the job back to the technician with that work reopened. The technician sees a red "Returned from quality check" banner and label, redoes the work and sends the job back, and the second check shows the first one in its history.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000042.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery, shown as numbered circles near the top of the job (on a phone, as "Step 6 of 8: Quality check" with a bar).
- **Work item** (or work line): one piece of approved work, for example "Replace front brake pads".
- **Quality check**: step 6, where the workshop supervisor checks the work before the vehicle is billed.
- **Road test**: a short drive to confirm the repair. The supervisor records the odometer (km) at the start and the end.
- **Certification**: the supervisor's signature on the statement that the vehicle is roadworthy.
- **Bar**: the strip fixed at the bottom of the job page with the main buttons. When the main button is grey, a sentence beside it says why.
- **Header**: the top of the job, with the line **With: (name and role) since (date)**, which says who holds the job now.
- **Toast**: the short green (or red) message that appears for a few seconds at the corner of the screen.
- **Job file**: the button at the top of the job that opens a side panel with tabs, including **Activity** (the job's history).

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Workshop manager (supervisor) | wm.lagos@danamotors.com | Rotimi Ajayi | wm.lagos@kiaamotors.com (Rotimi Ajayi) |
| Technician (assigned to the demo jobs) | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com (Tunde Akinyemi) |
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com (Chidi Eze) |

**Demo jobs.** All are at **Main Branch**. To open one, use **Job Cards** in the left menu, type the plate in the search box, then click the three-dot **Actions** button at the end of the row and **View details**. The job numbers below are the ones on the developer's computer; on the test site, find the job by its plate.

| Plate | Job number (developer's computer) | Where it is | Used in section |
|---|---|---|---|
| LSR-537ST | 2026000042 | Quality check. "PAID SERVICE" and "Replace front brake pads" both done. Check-in reading 48,262 km | A, B, C, D, E |
| LSR-538ST | 2026000043 | Back in Repair. The supervisor failed the brake pads with the note "Brake still noisy at low speed. Recheck front left caliper slider." | D |
| LSR-539ST | 2026000044 | Quality check, second time. Failed once on the brake pads, redone by the technician | F, G, H |

Sections A to E and H change their jobs. After testing, ask the developer to reload the demo data before you test them again.

The service line shows the service type's name as written in the service type list, **PAID SERVICE**, in capitals. That is the master data, not a code.

**Tablet or phone size (Chrome).** Press **F12**, click the device toolbar icon (a phone and tablet, top left of the panel), then type **1024** in the width box for a tablet, or choose **iPhone 12 Pro** (390 wide) for a phone. Press **F12** again to go back.

No settings need to be entered first.

## A. The supervisor opens the quality check (tablet, 1024 wide)

1. Sign in as the **Workshop manager** and set the browser to 1024 wide.
   - **Expected:** the dashboard opens with your name, Rotimi Ajayi, at the top right.
2. Open job **LSR-537ST** (Job Cards, search the plate, **Actions**, **View details**).
   - **Expected:** the header shows the blue badge **Quality check** and "With: Workshop supervisor since (date and time)". The step heading reads **Step 6 of 8: Quality check**.
3. Look at the cards under the step heading.
   - **Expected:** four cards: **Approved work** (two rows, "PAID SERVICE" and "Replace front brake pads", each with **Pass** and **Fail** buttons and the technician's name Tunde Akinyemi), **General checks** (No warning lights on dashboard, Fluid levels correct, Wheel nuts torqued, Vehicle interior clean, each with a tick box, and **AC outlet temperature** with a box and "°C"), **Road test** (**Start km** already showing 48262, **End km** empty, **Notes (optional)**), and **Certification** (a green box "Vehicle checked and certified as roadworthy in all respects." and **Supervisor's signature** with a red star and a signing box).
4. Look at the bar at the bottom.
   - **Expected:** a red-outlined **Fail and return to technician** button, and a grey **Pass quality check** button with the sentence "Check every work item: 2 left. 3 more things to do before you can pass." Under the button area: nothing else.
5. Scroll down below the cards.
   - **Expected:** a card **Work done** ("Saving keeps the job on this step.") with the existing work done box, and no "Earlier checks" card (this job has not been checked before).

**Pass if:** all four cards are there with the exact labels, start km is filled, and Pass quality check is grey with its reason.

## B. Mistakes the form catches (tablet)

Stay on job **LSR-537ST** as the Workshop manager.

1. In **End km** type `48250`.
   - **Expected:** red text under End km: "End km must be the same as or higher than start km."
2. In **AC outlet temperature** type `55`.
   - **Expected:** the grey text under it turns red: "Enter the temperature in °C between 0 and 40, or leave it empty."
3. Clear **AC outlet temperature** (leave it empty).
   - **Expected:** the text goes back to grey: "Optional. Leave it empty if the vehicle has no air conditioning."
4. In **Start km** type `abc` instead of the number.
   - **Expected:** red text under Start km: "Enter the km as a whole number, for example 48262."
5. Put **Start km** back to `48262` and **End km** to `48270`.
   - **Expected:** both red messages disappear.
6. Click **Pass** on both work items.
   - **Expected:** each Pass turns green. The bar now reads "Confirm every general check: No warning lights on dashboard, Fluid levels correct, Wheel nuts torqued, Vehicle interior clean. 1 more thing to do before you can pass."
7. Tick all four general checks.
   - **Expected:** the bar now reads "Sign the certification." and **Pass quality check** is still grey.
8. Draw a signature in the signing box.
   - **Expected:** **Pass quality check** turns dark (can be pressed), with "The service advisor takes the job for billing." under it. A **Clear signature** button appears under the box.
9. Click **Clear signature**.
   - **Expected:** the box is empty again and **Pass quality check** is grey with "Sign the certification."
10. Click **Fail** on "Replace front brake pads".
    - **Expected:** Fail turns red. The bar reads "A work item is marked Fail. Use Fail and return to technician. 1 more thing to do before you can pass."

Do not press Pass. Leave the page as it is for section C.

**Pass if:** every mistake shows its message under the right field, and the bar always names what is left.

## C. Fail and return to technician (tablet)

Stay on job **LSR-537ST** as the Workshop manager, with "Replace front brake pads" marked **Fail**.

1. Click **Fail and return to technician** in the bar.
   - **Expected:** a window **Fail and return to technician** opens: "Job 2026000042 goes back to the technician with your note. The work you tick is reopened." Under **Work that failed** (red star) both work items are listed and "Replace front brake pads" is ticked. A box **What must the technician fix** (red star) with "The technician sees this note on the job and in My jobs." under it.
2. Click **Return to technician** without typing anything.
   - **Expected:** red text under the box: "Write what the technician must fix." The window stays open.
3. Untick "Replace front brake pads" and click **Return to technician**.
   - **Expected:** red text: "Mark Fail on the work items that need rework."
4. Tick "Replace front brake pads" again and type in the box: `Brake still noisy at low speed. Recheck front left caliper slider.`
   - **Expected:** the text is shown in the box.
5. Click on the dark area outside the window.
   - **Expected:** the window stays open and your text is still there.
6. Press **Esc**.
   - **Expected:** the window stays open and your text is still there.
7. Click **Return to technician**.
   - **Expected:** the button shows a spinning icon and "Returning the job" for a moment. A green toast: "Job 2026000042 returned to the technician." The window closes. The step heading changes to **Step 5 of 8: Repair**, the header badge reads **In repair** and "With: Tunde Akinyemi (Technician) since (now)". A red banner "Returned from quality check" shows "Returned by Rotimi Ajayi, (date and time)." and "Note: Brake still noisy at low speed. Recheck front left caliper slider."

**Pass if:** the fail needs a note and a failed item, the window never closes by itself, and the job goes back to Repair with the technician.

## D. The technician sees the returned job (phone, 390 wide)

1. Sign out, set the browser to **iPhone 12 Pro**, and sign in as the **Technician**.
   - **Expected:** the dashboard opens. The bell at the top shows a new notice.
2. Click the bell.
   - **Expected:** a notice for job 2026000042 that says "QC failed. Review the job card for rework".
3. Open **My jobs** (bottom menu or side menu).
   - **Expected:** under **Today**, the card for **LSR-537ST** shows a red **Returned from quality check** label and the note "Brake still noisy at low speed. Recheck front left caliper slider." The card for **LSR-538ST** shows the same label and note.
4. Open **LSR-537ST** from its card.
   - **Expected:** **Step 5 of 8: Repair**. The red banner "Returned from quality check" with "Returned by Rotimi Ajayi, (date and time)." and the note. Under **Your work**, "Replace front brake pads" shows **Not started** and a red **Returned from quality check** label, with a **Start** button. "PAID SERVICE" still shows **Done** and a time.
5. Look at the bar.
   - **Expected:** **Send for quality check** is grey with "Finish all work first: 1 item left."
6. Click **Start** on "Replace front brake pads".
   - **Expected:** a green toast "Replace front brake pads started". The item shows **In progress** and a **Done** button.
7. Click **Done**.
   - **Expected:** a green toast "Replace front brake pads marked done". The item shows **Done** and the time. The red "Returned from quality check" label on the item is gone.
8. Click **Send for quality check**.
   - **Expected:** a green toast "Job 2026000042 sent to workshop supervisor". The step heading becomes **Step 6 of 8: Quality check** and the header says "With: Workshop supervisor since (now)".

**Pass if:** the technician sees who returned the job, when and why, only the failed item is reopened, and the job goes back to the supervisor.

## E. Second check and pass (tablet, 1024 wide)

1. Sign out, set the browser to 1024 wide, sign in as the **Workshop manager** and open **LSR-537ST**.
   - **Expected:** **Step 6 of 8: Quality check**. "Replace front brake pads" has an amber label **Redone after a failed check**. Below the cards, a card **Earlier checks** shows a red **Failed** badge, "Rotimi Ajayi, (date and time)", "Failed work: Replace front brake pads", the note, and "Road test: 48,262 km to 48,270 km (8 km)".
2. Click **Pass** on both work items and tick all four general checks.
   - **Expected:** each Pass is green and each box is ticked.
3. In **AC outlet temperature** type `6`, in **End km** type `48270`, in **Notes (optional)** type `Road test completed. No abnormal noise.`
   - **Expected:** no red messages. The bar reads "Sign the certification."
4. Sign in the signing box.
   - **Expected:** **Pass quality check** can be pressed.
5. Click **Pass quality check**.
   - **Expected:** the button shows a spinning icon and "Sending" for a moment, then a green toast: "Quality check passed on job 2026000042. The service advisor has the job." The step heading becomes **Step 7 of 8: Billing** and the header says "With: Chidi Eze (Service advisor) since (now)". The finished steps list shows "Quality check completed by Rotimi Ajayi, (date and time)."
6. Click the finished step line **Quality check completed by ...** to open it.
   - **Expected:** "Result: Passed", "Checked: (date and time)", "Notes: Not provided".
7. Click **Job file**, then the **Activity** tab.
   - **Expected:** under **Step changes**, newest first: "Quality check passed. Moved to Billing" (Rotimi Ajayi, sent to Chidi Eze (Service advisor)), "Moved from Repair to Quality check" (Tunde Akinyemi), "Quality check failed. Returned to Repair" (Rotimi Ajayi, sent to Tunde Akinyemi (Technician), with the note), and the earlier steps.
8. Press **Esc**.
   - **Expected:** the Job file panel closes.
9. Sign in as the **Service advisor** and click the bell.
   - **Expected:** a notice "Job sent to you" for job 2026000042, step Billing.

**Pass if:** the pass needs every item, the km, the general checks and a signature; the job moves to Billing with the advisor; and both the failed and the passed check are in the history.

## F. A job back for its second check (tablet)

1. As the **Workshop manager**, open **LSR-539ST**.
   - **Expected:** **Step 6 of 8: Quality check**. "Replace front brake pads" has the amber label **Redone after a failed check**. **Earlier checks** shows a red **Failed** check with "Failed work: Replace front brake pads" and the note "Pads squeal under light braking. Clean and grease the caliper sliders."

**Pass if:** the earlier failed check is shown on the second check.

## G. Someone else's step, and permission denied

1. Sign in as the **Service advisor** (desktop size) and open **LSR-539ST**.
   - **Expected:** the header shows "With: Workshop supervisor since (date and time)". A yellow banner: "Waiting for the workshop supervisor. You can view this step but only the workshop supervisor can update it." The card **Quality check** shows "Result: Not checked yet" and the line "Only the workshop supervisor or the service manager can do the quality check." Both work items are listed with **Done**. A card **Quality checks** shows the earlier failed check. There is no Pass or Fail button and no signing box.
2. Sign in as the **Technician** and open **LSR-539ST**.
   - **Expected:** the same read-only view with "Only the workshop supervisor or the service manager can do the quality check." No buttons to pass or fail.

**Pass if:** nobody except the supervisor (or service manager) can pass or fail the check, and they see why.

## H. Offline, sizes and keyboard (supervisor, LSR-539ST)

1. As the **Workshop manager**, open **LSR-539ST** at 1440 wide (normal desktop).
   - **Expected:** the cards sit in two columns: Approved work and General checks on the left, Road test and Certification on the right. No sideways scrolling.
2. Change the width to **768**, then to **iPhone 12 Pro** (390).
   - **Expected:** the cards sit one under the other. On the phone the Pass and Fail buttons sit under each work item at full width. No sideways scrolling at any size. The bar shows the red **Fail and return to technician** button and the grey **Pass quality check** button with one short sentence.
3. Go back to 1024 wide. Click in the page, then press **Tab** until the **Pass** button of "PAID SERVICE" has a visible outline. Press **Enter**.
   - **Expected:** Pass turns green.
4. Press **Tab** once and **Enter**.
   - **Expected:** Fail on "PAID SERVICE" turns red (Pass is no longer green).
5. With the mouse, click **Pass** on both items, tick the four general checks, type `49123` in **End km**, and sign.
   - **Expected:** **Pass quality check** can be pressed.
6. Go offline: press **F12**, open the **Network** tab, choose **Offline** in the throttling list (or turn Wi-Fi off).
   - **Expected:** nothing changes on the page yet.
7. Click **Pass quality check**.
   - **Expected:** a red toast and a red box under the cards explaining the quality check was not saved, for example "The quality check was not saved. Check your connection and try again. Your entries are kept." Everything you entered is still there, including the signature.
8. Go back online (Network tab, **No throttling**, or Wi-Fi on) and click **Pass quality check** again.
   - **Expected:** the green toast "Quality check passed on job 2026000044. The service advisor has the job." and **Step 7 of 8: Billing**.

**Pass if:** the page fits every size, works with the keyboard, and keeps your entries when the connection drops.

## I. The Inspections list

1. As the **Workshop manager**, type the address of the site followed by `/inspections` (for example `http://localhost:3000/inspections`).
   - **Expected:** a page **Inspections** with "(number) quality checks recorded on job cards". The table shows **Checked** (date and time), **Job number** (a link), **Vehicle** (plate and model), **Result** (green **Passed** or red **Failed**), **Checked by** and **Notes**. The quality checks from sections C and E are listed.
2. Click the filter **Failed**.
   - **Expected:** only failed checks are listed.
3. Click a job number.
   - **Expected:** that job card opens.

**Pass if:** every check appears with readable results and the job link works.

## Always report

- Emojis, odd symbols, or squares or question marks instead of letters.
- "undefined", "null" or "NaN" anywhere.
- Codes in capitals with underscores, such as QUALITY_CHECK or IN_PROGRESS.
- Garbled characters, for example "â‚¦" instead of "₦".
- Browser pop-up boxes (the grey boxes from the browser itself).
- Buttons that do nothing when pressed.
- Grey (disabled) buttons with no sentence saying why.
- Anything you typed that disappears.
- Sideways scrolling on any page.

## Not in this phase

- **Billing** (step 7) still uses the older screen: after a pass, the service advisor marks the vehicle ready and the bill is created as before. The new billing screen comes in **phase 8**. Until the advisor marks it ready, the job's status stays "Quality check" behind the scenes; the step shows Billing.
- **Delivery** still uses the older screen until **phase 9**, the **Workshop board** comes in **phase 10**, and the printed job card (with the roadworthy certificate) in **phase 11**.
- **Photos** during the quality check are not in this phase.
- The **Inspections** list is not in the side menu; open it by its address as in section I.
- No money is shown on the quality check, so there is no ₦ amount to check in this phase.
- Jobs released before phase 6 have no work list; their quality check says so and can still be passed with the general checks, road test and signature.

## Results table

| Step | Pass or Fail | What I saw |
|---|---|---|
| A1 | | |
| A2 | | |
| A3 | | |
| A4 | | |
| A5 | | |
| B1 | | |
| B2 | | |
| B3 | | |
| B4 | | |
| B5 | | |
| B6 | | |
| B7 | | |
| B8 | | |
| B9 | | |
| B10 | | |
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
| D5 | | |
| D6 | | |
| D7 | | |
| D8 | | |
| E1 | | |
| E2 | | |
| E3 | | |
| E4 | | |
| E5 | | |
| E6 | | |
| E7 | | |
| E8 | | |
| E9 | | |
| F1 | | |
| G1 | | |
| G2 | | |
| H1 | | |
| H2 | | |
| H3 | | |
| H4 | | |
| H5 | | |
| H6 | | |
| H7 | | |
| H8 | | |
| I1 | | |
| I2 | | |
| I3 | | |

## How to report a problem

For each problem, send:
- the phase and step number, for example "Phase 7, C2";
- the job number;
- the role you were signed in as;
- what you expected (copy the "Expected" line);
- what happened instead;
- a screenshot (on Windows press **Windows + Shift + S**, select the area, then paste it into your message).
