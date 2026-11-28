# Job card revamp, phase 12: manual test guide (full journey, final sign-off)

## 1. What changed in this phase

This phase finishes the new job card. Nothing new appears on the eight steps; instead, the old pages the new job card replaced are gone. The **Repairs** page no longer exists: the workshop board and the job table on **Job Cards** are the only job lists. Money, dates and numbers look the same everywhere on the job card, the service documents and the late delivery screens. The customer portal now shows which step a job is at (for example "Step 5 of 8: Repair") instead of a percentage. A supervisor can now fail a quality check without doing a road test. In this guide you take one new job through all eight steps, with every role, on a computer, a tablet and a phone.

## 2. Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop, from arrival to the gate pass. Each one has a job number, for example 2026000074.
- **Booking**: an appointment made before the customer arrives. It becomes a job card when the vehicle comes in.
- **Step**: where the job is. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery. The big heading on the job says "Step 4 of 8: Estimate", for example.
- **Header**: the top of the job. Its line **With: (name and role) since (date and time)** says who holds the job now. Only that person can work on the step; everyone else sees it read-only (they can look but not change anything).
- **Action bar**: the strip at the bottom of the job with the step's main button. When the button is grey, the reason is written beside it.
- **Estimate**: the list of work and parts, with prices, that the customer approves before work starts. A **supplementary estimate** is a second one for extra work found during the repair.
- **Advance**: a part payment before work starts.
- **Gate pass**: the slip the security guard checks before the vehicle leaves.
- **Job file**: the button at the top of the job that opens a side panel. Its **Activity** tab lists every step change, who did it and when.
- **Notifications**: the bell at the top right. A red number shows new notices.

**Test accounts.** Use the password your administrator gave you for each one. Sign out (**Log out** at the bottom of the left menu) before you sign in as the next person, or use a second browser window in private mode.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com (Chidi Eze) |
| Workshop supervisor | wm.lagos@danamotors.com | Rotimi Ajayi | wm.lagos@kiaamotors.com (Rotimi Ajayi) |
| Technician | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com (Tunde Akinyemi) |
| Service engineer | admin.lagos@danamotors.com (Main Branch has no engineer account on the test site; an administrator may act as the engineer) | Adaeze Okonkwo | engineer1@kiamotors.com (Bola Adewale) |
| Warranty officer | warranty@kiamotors.com | Madam Kemi | warranty@kiamotors.com (Folake Adebayo) |
| Cashier (billing officer) | financemgr@kiamotors.com | Joseph Stan | superadmin@danamotors.com (Super Admin) |
| Administrator (settings) | the administrator account you normally use | | admin.lagos@danamotors.com |

**Demo data.** Everything is at **Main Branch**; customers are fictional.

| What | Where | Used in |
|---|---|---|
| The booking you turn into the new job | Booking **2026000019** on the test site, plate **LSR-549ST**, a Kia Sportage of **Adaeze Okafor**, sold about 13 months ago, so under warranty. Two requests: "Periodic service (20,000 km)" and "Engine shakes when cold in the morning". Last recorded mileage 14,200 km | A to L |
| An older job made before the new job card | Any job on **Job Cards** with a job number below 2026000033, for example the first page of the table sorted oldest first | N |

The job number of your new job is given when you open it in step B4. Write it down: ________________.

**Phone and tablet size.** In Chrome press **F12**, click the device toolbar icon (a phone and a tablet, top left of the panel), and choose **iPhone 12 Pro** (390 wide) or **iPad Mini** (768 wide) at the top of the page. For 1024 wide, choose **Responsive** and type 1024 in the width box. Press **F12** again to go back to the normal size.

**Offline.** In Chrome press **F12**, open the **Network** tab, and change **No throttling** to **Offline**. Change it back to **No throttling** afterwards.

**Settings to check first.** Sign in as the administrator and check each line. Do not change anything.

| Menu path | What you should see |
|---|---|
| **Settings**, then **Terms & Conditions**, document **Job card** | 12 numbered clauses, starting "Vehicle is driven and tested (including test drive outside workshop)" |
| **Settings**, then **Warranty**, tab **Service history rule** | A service every 3 months or 5,000 km, 4 services a year, grace 0 km and 0 days |
| **Settings**, then **Workshop Masters**, Service type, open **FIRST SERVICE** (1F) and **PAID SERVICE** (RG) | "Periodic maintenance (counts in the warranty service history)" is ticked on both |
| **Settings**, then **Company & Branch Settings**, choose **Main Branch** | Estimation charge ₦25,000.00 or 10%; Storage charge free for 48 hours, then ₦2,000.00 per day; Follow-up call 2 days; Workshop board time targets 30, 120, 120, 120 and 60 minutes |

Pass if: every value matches. If one does not, write it in the results table and continue.

## 3. Tests

### A. The old pages are gone

1. Signed in as the service advisor, look at the left menu.
   Expected: there is **Job Cards** but no **Repairs**.
2. Type `/repairs` at the end of the address (for example `https://(test site)/repairs`) and press Enter.
   Expected: a page with "Page not found" and "This page does not exist", and a **Go to the dashboard** link. No list of jobs.
3. Click **Job Cards**.
   Expected: the job table (advisors see the table first). Each row has **Status**, **Step** and **With** columns with coloured badges, for example "In repair" and "Repair".

Pass if: there is no Repairs page and the job list opens.

### B. Booking and check-in (service advisor, computer)

1. In the left menu click **Appointments**, then **Service Appointments**. Find the booking for **LSR-549ST** and open it.
   Expected: booking 2026000019 for Adaeze Okafor (on the developer's computer the number differs) with a **Service booking** section and the two requests.
2. In the **Service booking** section click **Convert to job card**.
   Expected: a window with the job card terms and the words "Scroll to the bottom of the terms to show the consent checkbox."
3. Scroll the terms to the end, tick the checkbox and click **Continue to job card**.
   Expected: the **Open job card** form. It shows "Job number assigned on save" and has no Bay, Technician or prices.
4. Check **Mileage** shows 18,900 (type `18900` if empty), choose a promised date two days from today and the time **04:00 PM**, choose **Chidi Eze** under **Received by**, and click **Open job card**.
   Expected: the message "Job card (number) opened. Continue with check-in." and the heading "Step 1 of 8: Check-in". The header says "With: Chidi Eze (Service advisor) since (today, time)". Write down the job number.
5. Click the **Details** tab. Clear **Mileage** and click **Continue to walk-around**.
   Expected: under Mileage, "Enter the current mileage".
6. Type `14000` in **Mileage** and click **Continue to walk-around**.
   Expected: "Mileage cannot be lower than the last recorded 14,200 km. Check the reading, or tick Odometer replaced and give a reason."
7. Type `18900` in **Mileage**. In **Instructions**, type `Check the engine misfire the customer mentioned on the phone.` and click **Continue to walk-around**.
   Expected: "Details saved", and the **Walk-around** tab opens.
8. Choose the fuel level **Half**, then click **Mark the rest present**.
   Expected: "All 25 items checked", and at the bottom "Saved (time)".
9. Click the **Customer consent** tab and click **Sign and accept** without doing anything else.
   Expected: "Tick the box to accept the terms and conditions." and "Ask the customer to sign in the box."
10. Choose **Owner**, tick "I have read and accept the terms and conditions.", sign in the box with the mouse, and click **Sign and accept**.
    Expected: "Customer consent signed for job (number)" and "Signed by Adaeze Okafor, (date), (time)". The three tabs show as complete.
11. Click **Send to workshop supervisor**.
    Expected: "Job (number) sent to workshop supervisor", the heading "Step 2 of 8: Diagnosis", and "With: Workshop supervisor since (time)".

Pass if: every message above appeared, dates show like "30 Nov 2026, 16:00", and the job moved to Diagnosis.

### C. Diagnosis (supervisor on a computer, technician on a phone, engineer)

1. Sign in as the workshop supervisor. Click the bell.
   Expected: a notice "Job sent to you" naming LSR-549ST and "Step: Diagnosis".
2. Open the job (click the notice, or **Job Cards**, the card in the **Diagnosis** column). Click **Assign technician** in the action bar without choosing anyone.
   Expected: "Choose a technician from the list."
3. Choose **Tunde Akinyemi**, choose a bay marked "(free)", and click **Assign and send to Tunde Akinyemi**.
   Expected: "With: Tunde Akinyemi (Technician)" in the header.
4. Sign in as the technician and make the browser phone size (iPhone 12 Pro). Open **My jobs** and tap the job.
   Expected: "Step 2 of 8: Diagnosis", the two customer requests as cards, and no ₦ prices anywhere. The action bar button **Send to service engineer** is grey with "Write what you found for every customer request (2 of 2 still empty)."
5. In the first request, under "What did you find?", type `Periodic service due. Engine misfire on cylinder 2, ignition coil weak.` Tap **Add work**, search `ignition` and choose **Replace ignition coil and spark plugs**.
   Expected: the work appears under "Work needed" and "Saved (time)" shows.
6. Tap the second request "Engine shakes when cold in the morning" and type `Misfire confirmed on a cold start. Same cause as the weak ignition coil.`
   Expected: "Saved (time)".
7. Tap **Add a finding the customer did not mention**, type `Front brake pads worn to 3 mm.`, tap **Add work**, search `brake`, choose **Replace front brake pads**.
   Expected: the third finding is saved. The page does not scroll sideways.
8. Tap **Send to service engineer**.
   Expected: "With: Service engineer since (time)" and the findings are now read-only for you.
9. Sign in as the service engineer (on the test site, the administrator). Open the job.
   Expected: "Service engineer is reviewing the findings" and the three findings. The button **Confirm and send to warranty officer** (the vehicle is under warranty).
10. Click **Return to technician**, then **Return to technician** in the window without a note.
    Expected: "Write what the technician should check again." Clicking outside the window does not close it.
11. Click **Cancel** (or the close button) to keep the job, then click **Confirm and send to warranty officer**.
    Expected: the heading "Step 3 of 8: Warranty".

Pass if: the technician never saw prices, every message matched, and the job reached Warranty.

### D. Warranty check (warranty officer)

1. Sign in as the warranty officer and open the job.
   Expected: "Step 3 of 8: Warranty", the vehicle's warranty, its service history by quarter, and "Items to decide" with the three pieces of work.
2. For **Replace ignition coil and spark plugs** choose **Warranty**.
   Expected: if the history is not regular, the message "Write a reason, because the service history is not regular and items are set to warranty or goodwill." and **Return to service advisor** is grey.
3. Choose **Customer pay** for every item.
   Expected: the reason message goes away and **Return to service advisor** is enabled, with "Chidi Eze will prepare the estimate."
4. Click **Return to service advisor**.
   Expected: the heading "Step 4 of 8: Estimate" and "With: Chidi Eze (Service advisor)". The advisor's bell shows "Job sent to you" with "Estimate".

Pass if: the officer had to decide every item and the job went back to the advisor.

### E. Estimate, approval, advance and release (advisor on a tablet, cashier)

1. Sign in as the advisor and open the job. Click **Prepare estimate**.
   Expected: "Estimate prepared for job (number)" and "Estimate, revision 1, draft". Prices show as ₦ with two decimals, for example ₦12,500.00, lined up on the right. VAT shows as "VAT (7.5%)".
2. Make the browser tablet size (iPad Mini). Click **Present to customer**.
   Expected: "Estimate ready for the customer. Hand the tablet to the customer." and the heading "Your estimate for LSR-549ST".
3. For **Replace front brake pads**, tap **Decline**.
   Expected: the total drops and "Declined items will be reminded at your next visit."
4. Tap **Approve and sign** without signing.
   Expected: "Ask the customer to sign in the box" and "The customer must accept the estimate terms".
5. Choose **Owner**, tap "I approve the work above at the prices shown", sign, and tap **Approve and sign**.
   Expected: "Estimate approved and signed for job (number)". Under "Before work starts": the customer approved items and "Advance not received". **Release to workshop** is grey with "Ask the cashier to record the advance. Cashier on duty: Joseph Stan."
6. Click **Notify cashier**.
   Expected: "Notice sent to Joseph Stan".
7. Sign in as the cashier and open the job. Click **Receive advance**, type `20000` in **Amount received (NGN)**, choose **Cash** under **Mode**, and click **Save receipt**.
   Expected: "Advance received and reserved for job (number)."
8. Sign in as the advisor and open the job.
   Expected: "Advance received: ₦20,000.00", and **Release to workshop** is enabled with "Tunde Akinyemi will be notified."
9. Click **Release to workshop**.
   Expected: the heading "Step 5 of 8: Repair".

Pass if: the declined item left the total, the release waited for the advance, and the amounts showed ₦ with two decimals.

### F. Repair with a supplementary item (technician on a phone, advisor)

1. Sign in as the technician, phone size. Open **My jobs**.
   Expected: the job under **Today** with its next action.
2. Open the job.
   Expected: "Your work" lists **Replace ignition coil and spark plugs** and **PAID SERVICE** (or the periodic service). **Replace front brake pads** is not there, because the customer declined it.
3. On **Replace ignition coil and spark plugs** tap **Start**, then **Done**.
   Expected: "Replace ignition coil and spark plugs marked done" and "Done (time)".
4. Tap **Need a part**, then **Send to service advisor** straight away.
   Expected: "Say why the part is needed, in at least 3 characters" and "Choose the part you need".
5. Type `Rear wiper blade torn, smears the screen.`, tap **Choose a part**, search `wiper`, choose **Rear wiper blade**, set **Quantity** to `1`, and tap **Send to service advisor**.
   Expected: "Sent to Chidi Eze for a supplementary estimate". **Send for quality check** is grey with "A new finding is waiting for the service advisor's supplementary estimate."
6. Sign in as the advisor, normal size, and open the job.
   Expected: a banner "New finding from Tunde Akinyemi" with "Rear wiper blade torn, smears the screen." and "Work already approved continues." The bell shows "New finding during repair".
7. Click **Prepare supplementary estimate**.
   Expected: "Supplementary estimate, revision 2, prepared for job (number)". Only the new line is on it.
8. Click **Present to customer**, tick "I approve the work above at the prices shown", sign, and click **Approve and sign**.
   Expected: "Estimate approved and signed for job (number)".
9. Sign in as the technician, phone size, and open the job. Tap **Start** and **Done** on every item not done yet, then **Send for quality check**.
   Expected: the heading "Step 6 of 8: Quality check".

Pass if: the extra part waited for the customer's answer and the job reached Quality check.

### G. Quality check: fail, then pass (supervisor on a tablet, technician)

1. Sign in as the supervisor, tablet size (Responsive, 1024 wide). Open the job.
   Expected: "Step 6 of 8: Quality check" with **Approved work**, **General checks**, **Road test** and **Certification**. **Pass quality check** is grey with what is missing.
2. Look at **Start km**, then type `18000` in **End km**.
   Expected: Start km shows 18900 with "The check-in reading. Change it if the odometer shows another reading." Under End km: "End km must be the same as or higher than start km." Clear **End km** again.
3. On **Replace ignition coil and spark plugs** click **Fail**, then **Fail and return to technician**, then **Return to technician** without a note.
   Expected: "Write what the technician must fix." Pressing Esc or clicking outside keeps the window and your text.
4. Type `Misfire still present at idle. Recheck the coil connector.` and click **Return to technician**. (End km is empty: no road test was done, and that is allowed when failing.)
   Expected: "Job (number) returned to the technician." and the heading "Step 5 of 8: Repair".
5. Sign in as the technician, phone size, open the job.
   Expected: a banner "Returned from quality check" with the note. Only the failed item needs redoing.
6. Tap **Start** and **Done** on it, then **Send for quality check**.
   Expected: "Step 6 of 8: Quality check".
7. Sign in as the supervisor. Click **Pass** on every work item, tick the four general checks (No warning lights on dashboard, Fluid levels correct, Wheel nuts torqued, Vehicle interior clean), type `18908` in **End km**, sign the certification, and click **Pass quality check**.
   Expected: "Quality check passed on job (number). The service advisor has the job." and "Step 7 of 8: Billing".

Pass if: the failed check went back to the technician with the note and the second check passed.

### H. Billing (advisor, cashier)

1. Sign in as the advisor and open the job.
   Expected: "Step 7 of 8: Billing" with **Customer notified**, **Estimated and actual** and **Invoice**. "Storage charge of ₦2,000.00 per day starts 48 hours after the customer is told the vehicle is ready (terms clause 3)."
2. Click **Mark ready and notify customer**, then **Mark ready and save notice** without choosing how.
   Expected: "Choose how you told the customer: phone call or SMS."
3. Choose **Phone call** and click **Mark ready and save notice**.
   Expected: "(number) marked ready. The customer notice is recorded." and "Phone call to Adaeze Okafor on (date, time)". **Send to delivery** is grey with "Create the invoice before sending the job to delivery."
4. Sign in as the cashier and open the job. On the **Invoice** card click **Create invoice**, then **Create invoice** in the window.
   Expected: "Invoice (number) created." and the card shows **Unpaid**.
5. Click **Record payment**, choose **Cash** under **Mode**, and click **Save receipt**.
   Expected: "Payment receipt created" and the card shows **Paid** and "The invoice is paid in full."
6. Sign in as the advisor and open the job. Click **Send to delivery**.
   Expected: "Step 8 of 8: Delivery".

Pass if: the invoice and payment were needed before delivery and the amounts showed ₦ with two decimals.

### I. Delivery and gate pass (advisor on a tablet)

1. Open the job at tablet size (iPad Mini).
   Expected: **Work done**, **Declined, recommended for next visit** (with Replace front brake pads), **Collected by** and **Customer signature**.
2. Look at **Complete delivery and print gate pass** while it is grey.
   Expected: the reasons are written beside it, for example "Tick Returned for every belonging: 7 are not ticked yet. 2 more things to do before delivery." Clicking it does nothing.
3. Tick each belonging returned (if a **Your belongings** card shows, click **Tick all returned**), choose **Adaeze Okafor (owner)**, and sign in the box.
   Expected: **Complete delivery and print gate pass** is enabled.
4. Click **Complete delivery and print gate pass**.
   Expected: "Job (number) delivered. Gate pass (number) issued." The small gate pass opens and Chrome's print preview appears. Cancel the print preview.
5. Click **Back to job card**.
   Expected: "Closed job", "Delivered to Adaeze Okafor, (date, time)" and "Follow-up call scheduled for (date two days later)."

Pass if: the job closed and the gate pass printed on one small sheet.

### J. Hand-over and Activity

1. On the closed job click **Job file**, then the **Activity** tab.
   Expected: every step change with who and when, including "Quality check failed. Returned to Repair", "Quality check passed. Moved to Billing" and "Moved from Billing to Delivery".
2. Click **Print** at the top of the job, then **Job card**.
   Expected: the printed job card with the findings, the declined brake pads, the signatures and the 12 terms on the back, money as ₦ with two decimals.

Pass if: Activity shows the whole journey and the print matches the job.

### K. Someone else's step and permission denied

Do these while the job is at the step named (use a second browser window so you do not lose your place).

1. While the job is at **Estimate**, open it as the technician.
   Expected: "You do not have access to estimates. The service advisor prepares the estimate, takes the customer's approval and releases the job to the workshop."
2. While the job is at **Diagnosis** with the technician, open it as the advisor.
   Expected: "Waiting for Tunde Akinyemi (Technician). You can view this step but only the technician can update it." No buttons to change the findings.
3. While the job is at **Billing**, open it as the technician.
   Expected: "You do not have access to this job's billing. Staff of the job's branch with access to job cards can open it."
4. Signed in as an Abuja Branch user, open the job's address.
   Expected: "You cannot open this job card" and "This job card belongs to another branch."

Pass if: nobody could change a step they do not own, and each refusal said why.

### L. Phone, tablet, keyboard and offline

1. At each step in sections B to I, also look at the job at phone size (iPhone 12 Pro) as the step's owner.
   Expected: no sideways scrolling, the stepper shows "Step N of 8: (name)", and the action bar button is reachable at the bottom.
2. On the Check-in step, put the mouse away. Press **Tab** until the **Details** tab is highlighted, press **Enter**, keep pressing **Tab** to reach **Continue to walk-around** and press **Enter**.
   Expected: a visible outline shows where you are at every press, and the step works with the keyboard alone.
3. Open **Print** at the top of the job with the keyboard (Tab to it, Enter), move with the arrow keys and press **Esc**.
   Expected: the menu opens, the arrows move through it, and Esc closes it.
4. On any step, go **Offline** and click the step's main button.
   Expected: an error that says the change was not saved and to check the connection; what you typed stays on screen. Go back online and try again: it saves.
5. Go **Offline** and reload the job.
   Expected: "Could not load job (number)" with "Check your connection and try again." and a **Try again** button. Go back online and click **Try again**: the job loads.

Pass if: every size worked without sideways scrolling, the keyboard reached everything, and nothing typed was lost offline.

### M. Customer portal and reports

1. Sign in to the customer portal as the demo customer your administrator gives you (or skip this line if you have no portal account), open **Service history** and the new job.
   Expected: "Step" shows "Closed" for the delivered job (or "Step 5 of 8: Repair" for one in repair), not a percentage.
2. As the administrator, in the left menu open **Late Deliveries**, then **Promise Date Entry**, and then **Promise Time Entry**.
   Expected: the new job appears there only if it was delivered after its promised date or time. Dates read like "30 Nov 2026, 16:00", with no long dashes or arrows.
3. In the address bar, add `/psf` after the site address and press **Enter**. In **Job no.** type your new job number and click **Open**.
   Expected: the follow-up call screen for the new job, due on the date shown at delivery.

Pass if: the job appears in the reports as before and no screen shows a dash, arrow or odd symbol.

### N. An older job

1. On **Job Cards**, open a job created before the new job card (a job number below 2026000033).
   Expected: the job sits on a sensible step for its status (for example a delivered job shows Closed). Earlier steps with no information say "Not provided", never an error, "undefined" or an empty box.

Pass if: the older job opens cleanly.

## 4. Always report

Report any of these, wherever you see them:
- emojis or odd symbols (arrows, ticks, crosses, stars, dots used as bullets);
- the words "undefined", "null" or "NaN";
- codes in capitals with underscores, such as IN_PROGRESS or WAITING_PARTS;
- garbled characters, such as "â‚¦", "Ã©" or a "?" where a letter or symbol should be;
- browser pop-ups (the grey browser boxes with OK and Cancel);
- buttons that do nothing when clicked;
- grey (disabled) buttons with no reason written near them;
- anything you typed that disappears;
- sideways scrolling at any size.

## 5. Not in this phase

- SMS to the customer is not sent; **SMS** only records that you sent one yourself. A provider is not chosen yet.
- On the test site, Main Branch has no service engineer account, so the administrator confirms diagnoses. An engineer account will be added before going live.
- The customer portal shows the step only; it does not list the job's work lines.
- Some screens outside the job card (for example older dashboards and reports) still use their own date and money formats. They are not part of the job card revamp.

## 6. Results table

| Step | Pass or Fail | What I saw |
|---|---|---|
| Settings check | | |
| A1 | | |
| A2 | | |
| A3 | | |
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
| B11 | | |
| C1 | | |
| C2 | | |
| C3 | | |
| C4 | | |
| C5 | | |
| C6 | | |
| C7 | | |
| C8 | | |
| C9 | | |
| C10 | | |
| C11 | | |
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
| E7 | | |
| E8 | | |
| E9 | | |
| F1 | | |
| F2 | | |
| F3 | | |
| F4 | | |
| F5 | | |
| F6 | | |
| F7 | | |
| F8 | | |
| F9 | | |
| G1 | | |
| G2 | | |
| G3 | | |
| G4 | | |
| G5 | | |
| G6 | | |
| G7 | | |
| H1 | | |
| H2 | | |
| H3 | | |
| H4 | | |
| H5 | | |
| H6 | | |
| I1 | | |
| I2 | | |
| I3 | | |
| I4 | | |
| I5 | | |
| J1 | | |
| J2 | | |
| K1 | | |
| K2 | | |
| K3 | | |
| K4 | | |
| L1 | | |
| L2 | | |
| L3 | | |
| L4 | | |
| L5 | | |
| M1 | | |
| M2 | | |
| M3 | | |
| N1 | | |

## 7. Sign-off

When every step passes, write the date, the branch you tested and your name here, or send them to the project lead:

Date: ____________ Branch: ____________ Name: ____________

## 8. How to report a problem

For each problem send:
- the phase and step number (for example "Phase 12, F5");
- the job number;
- the role you were signed in as;
- what you expected (copy the "Expected" line);
- what happened instead;
- a screenshot (on Windows press **Windows + Shift + S** and drag over the screen).
