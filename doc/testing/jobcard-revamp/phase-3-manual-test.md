# Job card revamp, phase 3: manual test guide

## What changed in this phase

Step 2 of a job card, **Diagnosis**, is now three short screens, each for one person. The workshop supervisor picks a technician from a list that shows how busy each one is, chooses a bay and presses **Assign and send to (name)**. The technician then records, on a phone, what they found for each customer request, with photos, the work needed and the parts needed, and no prices anywhere; it saves by itself. The service engineer checks the findings and either returns the job to the technician with a note, or confirms it. Confirming sends the job to the warranty officer when anything may be covered by warranty, otherwise straight to the service advisor, and the Warranty step is then shown as skipped with the reason "Not under warranty".

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000034.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery. The steps are shown as numbered circles near the top of the job.
- **Bay**: the workshop space the vehicle is parked in while it is worked on, for example Bay A1.
- **Finding**: what the technician found wrong (the "cause and nature of defect" on the paper job card), with the work and parts it needs.
- **Possible warranty**: the technician thinks the manufacturer may pay for this. The warranty officer decides in the next step.
- **Routing**: where the job goes after the engineer confirms: the warranty officer or the service advisor.
- **Bar**: the strip fixed at the bottom of the job card page with the main buttons. A grey main button has a sentence beside it saying why.
- **Header**: the top part of the job with the job number, plate, customer and the line **With: (name) (role) since (date)**, which says who holds the job now.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Workshop supervisor (the workshop manager account plays this role) | wm.lagos@danamotors.com | Rotimi Ajayi | wm.lagos@kiaamotors.com (double "a") |
| Technician | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com |
| A different technician | tech2@danamotors.com | Kingsley Okoro | tech2@kiamotors.com |
| Service engineer | admin.lagos@danamotors.com (see the note below) | Adaeze Okonkwo | engineer1@kiamotors.com, Bola Adewale |
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com |
| Service advisor at another branch (Abuja) | advisor2@kiamotors.com | Fatima Bello | advisor2@kiamotors.com |

**Note about the service engineer on the test site.** The test site has no account with the **Engineer** role yet. An administrator can do the engineer's part, so this guide uses the Administrator account for it. If your administrator creates a user with the role **Engineer** at **Main Branch**, use that account instead: everything works the same, and that person also gets a notification when findings are sent.

**Demo jobs.** All are at **Main Branch**. Find each one by typing its plate in the search box at the top of the **Job Cards** list, then click the three-dot **Actions** button at the end of its row and **View details**. The job numbers below are the ones on the test site; on another copy of the data, write each one down the first time you see it.

| Plate | Job number on the test site | Where it is | Used in section |
|---|---|---|---|
| LSR-512ST | 2026000034 | Diagnosis, waiting for a technician to be assigned. One request: "Engine warning light on" | A, B, D |
| LSR-513ST | 2026000035 | Diagnosis, with Tunde Akinyemi, nothing recorded yet. One request: "Steering wheel vibrates above 100 km/h" | C, G |
| LSR-524ST | 2026000046 | Diagnosis, with the service engineer. Two requests, three findings, one flagged Possible warranty | C, G |
| LSR-525ST | 2026000047 | Diagnosis, returned to Tunde Akinyemi by the engineer with a note | F |
| LSR-526ST | 2026000048 | Diagnosis, with the service engineer, nothing warranty related | E |

Sections A, B, D, E and F change their jobs. After testing, ask the developer to reload the demo data before you test them again.

**Phone and tablet size.** In Chrome, press **F12**. Click the small phone and tablet icon at the top left of the panel that opens (device toolbar). Then choose a size from the list at the top of the page: **iPhone 12 Pro** (390 wide), **iPad Mini** (768 wide), or **Responsive** and type 1024 by 768 for a tablet held sideways. To go back to normal, click the phone and tablet icon again.

**Offline.** To test a lost connection, press **F12**, open the **Network** tab, and change **No throttling** to **Offline**. Change it back to **No throttling** to reconnect. You can also turn Wi-Fi off and on.

**A photo to use.** Keep one or two ordinary photos on your computer (JPEG or PNG). On a phone you can take a photo instead.

**Settings.** None are needed for this phase.

## A. The workshop supervisor assigns a technician and bay

1. Sign in as the **Workshop supervisor**. Open job **LSR-512ST** (2026000034).
   Expected: the circle **2 Diagnosis** is the current step. Under the title **Step 2 of 8: Diagnosis** it says **Waiting for a technician to be assigned**. The header says **With: Workshop supervisor since** and a date such as 26 Nov 2026, 16:25.
2. Look at the yellow line under the steps.
   Expected: **No technician is assigned to this job.** with the link **Assign a technician** at the right.
3. Click **Assign a technician**.
   Expected: the page moves to the card **Assign technician**.
4. Look at the left side of the page (it is above the technician list on a narrow screen).
   Expected: a card **What the customer asked for** with **1 Engine warning light on**, and a card **Instructions to the technician** with the advisor's instructions.
5. Look at the card **Assign technician**.
   Expected: under **Technician** \* a list of this branch's active technicians only, including **Tunde Akinyemi** and **Kingsley Okoro**, and no Abuja technicians. Each row shows the name, a number with a small bar (how many jobs they have in the workshop now) and a label **Available** (green) or **Busy** (amber, 3 or more jobs). Available technicians are listed first.
6. Without choosing anyone, click the main button in the bar, **Assign technician**.
   Expected: in red under the list: **Choose a technician from the list.** Nothing is saved.
7. In **Bay** \*, choose **Choose a bay**, then click **Assign technician** again.
   Expected: under the bay box: **Choose a bay for the vehicle.**
8. Click the **Bay** box and look at the choices.
   Expected: every bay reads either **(free)**, for example **Bay A2 (free)**, or **(occupied by job** and a job number**)**.
9. Click **Tunde Akinyemi**.
   Expected: his row is outlined and the bar button now reads **Assign and send to Tunde Akinyemi**.
10. In **Bay**, choose a bay marked **(free)**, for example **Bay A2 (free)**.
11. In **Note to technician (optional)**, type `Customer is waiting in the lounge.`
12. Click **Assign and send to Tunde Akinyemi**.
    Expected: the button shows **Assigning** for a moment, then a green message **Job 2026000034 sent to Tunde Akinyemi**. The header changes to **With: Tunde Akinyemi (Technician) since** (today's date and time). A line **Technician assigned: Tunde Akinyemi, Bay A2.** appears with a button **Change technician or bay**.
13. Open the **Job file** (button at the top right), then the **Activity** tab.
    Expected: a new line **Technician and bay assigned (Diagnosis)** with your name and the time.

Pass if: only this branch's technicians are listed with jobs in hand and a label, each mistake is named under its field, and the job is now with the technician.

## B. The technician records findings on a phone

1. Sign in as the **Technician** (Tunde Akinyemi). Make the browser phone size (**iPhone 12 Pro**). Open job **LSR-512ST**.
   Expected: one column, no sideways scrolling. **Step 2 of 8: Diagnosis** with a thin progress bar, and **Technician is inspecting the vehicle**.
2. Look at the grey card near the top.
   Expected: **Instruction from the service advisor (Chidi Eze)** with the advisor's text, and **Note from the workshop supervisor (Rotimi Ajayi)** with **Customer is waiting in the lounge.**
3. Look at the bar at the bottom.
   Expected: **Send to service engineer** is grey, and beside it: **Write what you found for the customer request.** Under it: **The service engineer reviews your findings next.** (or the engineer's name, where an Engineer account exists).
4. Look over the whole screen.
   Expected: no prices or ₦ amounts anywhere.
5. Look at the card **1 Engine warning light on**. It is open.
   Expected: **What did you find?** \* with a large text box and **Required. The cause and nature of the defect, in plain words.** under it; **Photos (0)** with an **Add photo** tile; **Work needed** with **No work added.** and **Add work**; **Parts needed** with **No parts added.** and **Add part**; a **Possible warranty** switch, off; and **Saves by itself as you work**.
6. In **What did you find?**, type `Engine misfire on cylinder 2. Ignition coil failed.`
   Expected: within about 2 seconds the line under the card changes to **Saving**, then **Saved** with the time, for example **Saved 16:49**.
7. In Chrome or Edge, look at the microphone button inside the text box.
   Expected: a microphone button **Speak the finding**. (Optional: tap it, allow the microphone, say a few words; they are added to the end of the text. Browsers without voice input show no microphone.)
8. Tap **Add photo** and choose or take a photo.
   Expected: a green message **Photo added**, and **Photos (1)** with your photo. The photo has a small **x** to remove it.
9. Tap **Add work**.
   Expected: a window **Add work needed** with a **Search work** box.
10. Type `ignition`.
    Expected: **Replace ignition coil and spark plugs** in the list, with its code under it, and no price.
11. Tap **Replace ignition coil and spark plugs**.
    Expected: the window closes and the work shows as a blue chip under **Work needed**.
12. Tap **Add part**, type `ignition coil` and tap **Ignition coil assembly**.
    Expected: under **Parts needed** a row **Ignition coil assembly** with **Qty**, a minus button, the box **1** and a plus button.
13. Tap the plus button.
    Expected: the quantity changes to **2**.
14. Clear the quantity box and type `0`.
    Expected: in red under the row: **Enter a quantity above 0.** Type `2` again; the message goes.
15. Turn on **Possible warranty**.
    Expected: the switch turns purple. The line under the card returns to **Saved** with the time.
16. Tap the card's title **1 Engine warning light on** to close it.
    Expected: the closed card shows your text on one line and a purple **Possible warranty** label. Tap the title again to open it.
17. Scroll down and tap **Add a finding the customer did not mention**.
    Expected: a new card **Finding the customer did not mention**, with **The advisor will ask the customer before this work is done.** The bar now says **Describe each finding the customer did not mention, or remove it.**
18. In the new card's **What did you find?**, type `Rear wiper blade torn.`
    Expected: **Saved** with the time. **Send to service engineer** turns dark (enabled).
19. Reload the page (press **F5**).
    Expected: everything is still there: the text, the photo (**Photos (1)**), the work, the part with quantity **2**, the purple switch and the second finding.
20. Tap **Send to service engineer**.
    Expected: the button shows **Sending**, then a green message **Job 2026000034 sent to service engineer**. The header says **With: Service engineer since** and the time. An amber banner says **Waiting for the service engineer. You can view this step but only the service engineer can update it.** and the findings are now a read-only list.

Pass if: findings, photos, work and parts save by themselves and survive a reload, no price is shown, and the job moves to the service engineer.

## C. Someone else's step is read only

1. Sign in as the **different technician** (Kingsley Okoro). Open job **LSR-513ST** (2026000035).
   Expected: an amber banner **Waiting for Tunde Akinyemi (Technician). You can view this step but only the technician can update it.** A read-only card **Findings so far by Tunde Akinyemi**. No text boxes, no **Add work** or **Add part**, and no **Send to service engineer**.
2. Sign in as the **Service advisor** (Chidi Eze). Open job **LSR-524ST** (2026000046).
   Expected: the banner **Waiting for the service engineer. You can view this step but only the service engineer can update it.** A table **Diagnosis by Tunde Akinyemi** without edit buttons, and no main button in the bar.
3. Sign in as the **Service advisor at another branch** (Fatima Bello). Search for **LSR-512ST**.
   Expected: the job is not in her list. If you paste the job's page address from another window into the address bar, the page says **You cannot open this job card**.

Pass if: nobody but the owner of the current part can change anything, and another branch cannot open the job.

## D. The service engineer returns the job, then confirms it

1. Sign in as the **Service engineer** (on the test site, the Administrator). Open job **LSR-512ST**.
   Expected: **Service engineer is reviewing the findings**. A line **Technician assigned: Tunde Akinyemi, Bay A2.** A card **Diagnosis by Tunde Akinyemi** with the columns **Customer request**, **Finding (cause and nature of defect)**, **Work needed**, **Parts needed**, **Photos**, **Possible warranty**. Row **1 Engine warning light on** has a purple **Possible warranty** label; the row **Not mentioned by the customer** shows **Rear wiper blade torn.** and **No**. Parts show as **Ignition coil assembly (qty 2)**.
2. Look at the card **Routing** on the right (below the table on a narrow screen).
   Expected: a purple box: **1 finding is flagged as possible warranty.** and **This job goes to the warranty officer next.** Under it: **Jobs with customer-pay items only go straight to the service advisor.**
3. Look at the bar.
   Expected: **Return to technician** and the main button **Confirm and send to warranty officer**.
4. Point the mouse at the pencil button at the end of row 1.
   Expected: a small tip **Edit finding**.
5. Click **Return to technician**.
   Expected: a window **Return to technician**: "Tunde Akinyemi gets a notification and sees your note at the top of the job." with **Note to the technician** \*.
6. Without typing, click the window's **Return to technician** button.
   Expected: in red: **Write what the technician should check again.**
7. Press **Esc**, then click outside the window.
   Expected: the window stays open and keeps what you typed.
8. In **Note to the technician**, type `Check the spark plug on cylinder 2 as well.` and click **Return to technician**.
   Expected: the window closes, a green message **Job 2026000034 sent to Tunde Akinyemi**, and the header says **With: Tunde Akinyemi (Technician) since** and the time.
9. Sign in as the **Technician** and look at the bell at the top right.
   Expected: a notification **Job returned to you** reading "Job returned to you: 2026000034, ..., LSR-512ST. Step: Diagnosis. Note: Check the spark plug on cylinder 2 as well."
10. Open job **LSR-512ST**.
    Expected: an amber banner at the top: **Returned by** (the engineer's name), the date and time, and under it **Check the spark plug on cylinder 2 as well.** The findings can be changed again.
11. Add `Spark plug worn.` to the end of the first finding, wait for **Saved**, then tap **Send to service engineer**.
    Expected: **Job 2026000034 sent to service engineer**.
12. Sign in as the **Service engineer** again, open **LSR-512ST**, and click **Confirm and send to warranty officer**.
    Expected: a green message **Job 2026000034 sent to warranty officer**. The title changes to **Step 3 of 8: Warranty**. The step **2 Diagnosis** shows a tick with your name and the time, and a line **Diagnosis completed by** (your name), the date and time.
13. Click that **Diagnosis completed by** line.
    Expected: it opens read-only: **Technician** Tunde Akinyemi, **Bay** Bay A2, **Findings** with both texts, **Possible warranty** **1 finding**, **Confirmed by** your name and the date and time.
14. Open the **Job file**, then **Activity**.
    Expected: in order, newest first, lines such as **Moved from Diagnosis to Warranty**, **Send to service engineer (Diagnosis)**, **Return to technician (Diagnosis)** with the note, **Send to service engineer (Diagnosis)** and **Technician and bay assigned (Diagnosis)**, each with who and when.

Pass if: a return needs a note and reaches the technician, and confirming a flagged job sends it to the warranty officer.

## E. Nothing warranty related: straight to the service advisor

1. As the **Service engineer**, open job **LSR-526ST** (2026000048).
   Expected: the **Routing** card is grey: **The vehicle is not under warranty, has no open campaign and no finding is flagged as possible warranty.** and **This job goes to the service advisor next. The warranty step is skipped with the reason Not under warranty.** The main button reads **Confirm and send to service advisor**.
2. Click the pencil button **Edit finding** at the end of row 1.
   Expected: a window **Edit finding** with **Request 1: Periodic service (100,000 km)**, the box **Finding (cause and nature of defect)** \* and the same photo, work, parts and switch as the technician's screen.
3. Change the text to `Due for the 100,000 km service. Front tyres near the wear limit.` and click **Save and close**.
   Expected: the button shows **Saving**, the window closes, and the table shows the new text.
4. Click **Confirm and send to service advisor**.
   Expected: a green message **Job 2026000048 sent to** (the job's service advisor). The title changes to **Step 4 of 8: Estimate**. The step **3 Warranty** is grey with **Skipped** under it, and the list of finished steps has **Warranty skipped. Not under warranty.**

Pass if: a job with nothing warranty related skips the warranty step with that reason.

## F. Lost connection on the phone

1. Sign in as the **Technician**, phone size, and open job **LSR-525ST** (2026000047).
   Expected: an amber banner **Returned by** ... with **Check the wheel alignment readings and the front suspension bushes before we quote.**
2. Go offline (see "Offline" above).
3. Change the finding's text to `Front tyres worn unevenly. Alignment out by 2 degrees.`
   Expected: after a moment, in red under the card: **Not saved. Check your connection and try again.** with a **Retry** button. Your text stays in the box.
4. Tap **Send to service engineer** while still offline.
   Expected: a red message **Some findings are not saved. Press Retry on the finding marked Not saved, then send again.** The job does not move.
5. Go back online, then tap **Retry**.
   Expected: **Saving**, then **Saved** with the time. The text is exactly what you typed.

Pass if: nothing typed is lost when the connection drops, and Retry saves it.

## G. Phone, tablet and keyboard

1. As the **Technician**, open **LSR-513ST** at **iPhone 12 Pro**, then **iPad Mini**, then **Responsive** 1024 by 768.
   Expected: at every size there is no sideways scrolling, buttons are large and easy to tap, and the main button stays at the bottom.
2. As the **Service engineer**, open **LSR-524ST** at the same three sizes.
   Expected: at phone size the table becomes one card per request (finding, **Work needed**, **Parts needed**, **Photos**, the warranty label and a pencil button). At tablet size and wider it is a table. No sideways scrolling of the page.
3. As the **Workshop supervisor**, open **LSR-513ST** and click **Change technician or bay**.
   Expected: the technician list, the **Bay** box and the note, with **Keep the current technician** on the left of the bar. Click **Keep the current technician** to go back without changes.
4. On a normal screen, use only the keyboard on the supervisor's technician list: press **Tab** until a technician's round button is outlined, then press the **Down arrow**.
   Expected: the next technician is chosen and the bar button names them. **Tab** reaches **Bay**, the note and the bar buttons in order, and **Enter** on a button presses it.
5. As the **Technician** on **LSR-513ST**, press **Tab** through the finding.
   Expected: each control has a visible outline when reached: the text box, **Speak the finding** (Chrome and Edge), **Add photo**, **Add work**, **Add part**, the minus and plus buttons, **Possible warranty** (press **Space** to switch it) and the bar.

Pass if: every screen fits each size without sideways scrolling and can be used with the keyboard alone.

## Always report

Report any of these straight away, on any screen:
- Emojis, odd symbols, question marks or boxes where words should be.
- Garbled letters such as "â‚¦" instead of "₦".
- The words "undefined", "null" or "NaN", or codes in capitals with underscores such as SEND_TO_ENGINEER or ENGINEER_REVIEW.
- A price or ₦ amount on the technician's or engineer's diagnosis screens.
- Dates not in the form 26 Nov 2026, 16:25.
- A pop-up box from the browser itself (grey, plain, with an OK button) instead of the app's own messages.
- A button that does nothing, or a grey button with no sentence explaining why.
- Text you typed that disappears after an error, a reload or a lost connection.
- Having to scroll sideways to see the whole page.

## Not in this phase

- **Step 3, Warranty** still shows the older warranty card and "who pays" lines. Phase 4 replaces it with the warranty officer's screen and the service history check.
- **Step 4, Estimate** still shows the older estimate and advance sections, and the findings are not yet copied into the estimate. Phase 5 builds the estimate from the findings.
- Skills (for example "Brakes", "AC") are not shown beside technicians; the workshop team is shown instead, when the technician is linked to an employee record. There is no **On leave** label, because the system has no leave records yet.
- The test site has no Engineer accounts; an administrator does the engineer's part until one is created, and no one receives the "Job sent to you" notification for the engineer's part until then.
- Voice input appears only in browsers that have it built in (Chrome, Edge).
- The printed job card does not show the findings yet. Phase 11 rebuilds the print.

## Results table

| Step | Pass or Fail | What I saw |
|---|---|---|
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
| A13 | | |
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
| B12 | | |
| B13 | | |
| B14 | | |
| B15 | | |
| B16 | | |
| B17 | | |
| B18 | | |
| B19 | | |
| B20 | | |
| C1 | | |
| C2 | | |
| C3 | | |
| D1 | | |
| D2 | | |
| D3 | | |
| D4 | | |
| D5 | | |
| D6 | | |
| D7 | | |
| D8 | | |
| D9 | | |
| D10 | | |
| D11 | | |
| D12 | | |
| D13 | | |
| D14 | | |
| E1 | | |
| E2 | | |
| E3 | | |
| E4 | | |
| F1 | | |
| F2 | | |
| F3 | | |
| F4 | | |
| F5 | | |
| G1 | | |
| G2 | | |
| G3 | | |
| G4 | | |
| G5 | | |

## How to report a problem

For each problem, send:
1. The phase and step number from this guide, for example "Phase 3, step B12".
2. The job number, for example 2026000034.
3. The role you were signed in as.
4. What you expected, copied from the guide.
5. What actually happened.
6. A screenshot. On Windows, press Windows + Shift + S and drag over the screen.
