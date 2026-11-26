# Job card revamp, phase 2: manual test guide

## What changed in this phase

A new job card now starts at step 1, **Check-in**, and the service advisor completes it in three parts: **Details**, **Walk-around** and **Customer consent**. On Walk-around you record the fuel level, mark damage on a drawing of the car, tick the 25 accessories from the paper job card and take up to five photos; it saves by itself as you go. On Customer consent you hand the screen to the customer, who checks their vehicle details, reads the job card terms and signs with a finger. Only then can you send the job to the workshop supervisor with **Send to workshop supervisor**. Opening a job card is now shorter: you no longer choose a bay or technician, and there are no prices on the opening form.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000012.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery.
- **Check-in**: the first step. The service advisor confirms the details, walks round the car and gets the customer's signature.
- **Walk-around**: looking round the car with the customer and recording its condition: fuel, damage, accessories and photos.
- **Customer consent**: the customer confirms what was recorded, accepts the terms and signs.
- **Handoff**: passing the job to the next person with the main button at the bottom of the page.
- **Workshop supervisor**: the workshop manager account plays this role. They assign the technician and bay in the next step.
- **Booking**: an appointment made before the customer arrives. It can be turned into a job card.
- **Bar**: the strip fixed at the bottom of the job card page with the main buttons.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account | Name you will see |
|---|---|---|
| Administrator (for the terms) | admin.lagos@danamotors.com | |
| Service advisor (main branch) | advisor1@kiamotors.com | Chidi Eze |
| Workshop manager, playing the workshop supervisor | wm.lagos@kiaamotors.com (note the double "a" in kiaamotors) | Rotimi Ajayi |
| Technician | tech1@kiamotors.com | Tunde Akinyemi |
| Service manager | servicemanager@kiamotors.com | |
| Abuja branch administrator | admin.abuja@kiamotors.com | |

**Demo jobs.** All are at the main branch. Find each one by typing its plate in the search box at the top of the **Job Cards** list. To open a job, click the three-dot **Actions** button at the end of its row, then **View details**. Job numbers are made by the system. The numbers below are the ones on the test site; on another copy of the data, write each one down the first time you see it.

| Plate | Job number on the test site | Customer | Where it is | Used in section |
|---|---|---|---|---|
| KJA-482TX | 2026000033 | Adaeze Okafor | Check-in, nothing recorded on the walk-around yet. Last reading 43,100 km | B, C, D, F, H, I |
| KJA-521ST | 2026000043 | Tobi Adeyemi | Check-in, walk-around done, waiting for the customer to sign. Last reading 24,600 km | E, G |
| LSR-522ST | 2026000044 | Lakeside Courier Services Ltd | Check-in, signed, ready to send | F |
| KJA-523ST | Not yet a job | Adaeze Okafor | A booking, not yet a job card | A |
| LSR-512ST | 2026000034 | | Diagnosis (already past check-in) | G |

Sections A, C, D, E and F change their jobs. After testing, ask the developer to reload the demo data before you test them again.

**Phone and tablet size.** In Chrome, press **F12**. Click the small phone and tablet icon at the top left of the panel that opens (device toolbar). Then choose a size from the list at the top of the page: **iPhone 12 Pro** (390 wide), **iPad Mini** (768 wide), or **Responsive** and type 1024 by 768 for a tablet held sideways. To go back to normal, click the phone and tablet icon again.

**A photo to use.** Keep two or three ordinary photos of a car on your computer (any JPEG or PNG under 10 MB). On a tablet or phone you can take a photo instead.

**Settings: enter the job card terms first (Administrator, once).** The customer cannot sign until the terms are set.
1. Sign in as the **Administrator**.
2. In the left menu, click **Settings**, then the **Terms & Conditions** tile.
3. In **Document**, choose **Job card**. In **Applies to**, leave **All branches (company)**.
4. In the box **Terms (one per line, printed in this order; up to 20)**, type the 12 terms from the back of the paper job card, **one term per line, in the paper card's order, without numbers** (the app numbers them). For example, the first three lines are:
   - `The vehicle is driven and tested, including test drives outside the workshop, at the customer's risk.`
   - `Delays caused by events outside our control may extend the delivery date.`
   - `The customer will collect the vehicle within 48 hours of being told it is ready. After that, storage is charged at ₦2,000.00 per day.`
5. Leave **Footer message** as it is, or type `Thank you for servicing your Kia at Dana Motors.`
6. Click **Save terms**.
   Expected: the word **Saved.** appears under the boxes. The ₦ sign shows correctly.
7. Sign out (click your initials at the top right, then **Sign out**).

## A. Open a job card from a booking

1. Sign in as the **Service advisor**. In the left menu, click **Appointments**, then **Service Appointments**.
   Expected: the list of bookings.
2. Find the booking for **KJA-523ST** and open it.
   Expected: the booking page with a **Service booking** section.
3. In the **Service booking** section, click **Convert to job card**.
   Expected: a window with the job card opening terms and a tick box.
4. Scroll to the end of the terms in the window (the text under them says **Scroll to the bottom of the terms to show the consent checkbox.**). Tick the box that appears and click **Continue to job card**.
   Expected: the **Open job card** window. At the top it says **Job number assigned on save** and today's date and time, like **26 Nov 2026, 10:42**.
5. Look at the window.
   Expected: one page with **Vehicle**, **Warranty and campaign check**, the customer card, **Customer requests** and **Promised delivery and advisor**. There is **no Bay**, **no Technician**, **no Engineer**, **no service charge** and **no amounts (₦)** anywhere on it. The two requests from the booking are already filled in: **Periodic service (20,000 km)** and **Rattle from the rear when driving over bumps**.
6. Under **Mileage**, check the helper text.
   Expected: **Last recorded 16,050 km. The reading cannot go lower unless the odometer was replaced.**
7. Type `21400` in **Mileage**.
8. If the **Warranty and campaign check** card asks you to acknowledge, tick the acknowledgement box.
9. In **Promised date**, choose the day after tomorrow. In **Promised time**, choose **04**, **00**, **PM** and click **Done**.
10. In **Received by (service advisor)**, choose **Chidi Eze**.
11. Click **Open job card**.
    Expected: the button shows **Opening job card** and cannot be clicked twice. Then a green message **Job card (number) opened. Continue with check-in.** and the new job card page opens.
12. Look at the page.
    Expected: the header badge says **Check-in**, the line says **With: Chidi Eze (Service advisor) since** today's date and time, step **1 Check-in** is current, and under the heading **Step 1 of 8: Check-in** there are three tabs: **Details**, **Walk-around**, **Customer consent**. **Walk-around** is selected, with the text **Walking round the vehicle** under the heading.

**Pass if:** the job opens without a bay, technician or prices, the booking's requests and mileage carry over, and you land on Check-in.

## B. Details

1. Open job **KJA-482TX**. Click the **Details** tab.
   Expected: on the left, **Customer and vehicle** (Name **Adaeze Okafor**, Phone, Vehicle, Plate **KJA-482TX**, VIN) with an **Edit customer** link and a **Bill to** box; then **Visit details**. On the right, **Customer requests** (three numbered requests, each with **Defect code (optional)** and **Description**, no amounts) and **Instructions to technician**.
2. Look above the cards.
   Expected: a blue note starting **Not a repeat visit.** and an amber note **This vehicle is under warranty. Warranty items will need the warranty officer's review.** with a **View warranty** link.
3. Click **View warranty**.
   Expected: the **Job file** panel opens on **Warranty and campaigns**. Press **Esc** to close it.
4. Under **Mileage**, read the helper text.
   Expected: **Last recorded 43,100 km**.
5. Clear the **Mileage** box and click **Continue to walk-around** in the bar.
   Expected: red text under Mileage **Enter the current mileage**. You stay on Details and nothing else you typed is lost.
6. Type `40000` in **Mileage** and click **Continue to walk-around**.
   Expected: red text **Mileage cannot be lower than the last recorded 43,100 km. Check the reading, or tick Odometer replaced and give a reason.**
7. Tick **Odometer replaced (the reading can go below the last one)** and click **Continue to walk-around**.
   Expected: a new box **Reason for the odometer replacement** with red text **Give a reason for the odometer replacement**.
8. Untick **Odometer replaced** and type `48250` in **Mileage**.
9. In **Promised delivery date**, choose today. In **Promised delivery time**, choose a time one hour ago (for example **09**, **00**, **AM** if it is now 10:30 am) and click **Done**. Click **Continue to walk-around**.
   Expected: red text under the time **Promised delivery must be in the future**.
10. Choose the day after tomorrow, **04**, **00**, **PM**, and click **Done**.
11. In **Customer requests**, click the bin icon on all three requests.
    Expected: each disappears with a message **Request removed** and an **Undo** button.
12. Click **Continue to walk-around**.
    Expected: red text **Add at least one customer request**.
13. Click **Undo** on the messages, or click **Add request** and type `Noise from front left wheel when braking` in **Description**.
14. Click in **Instructions** under **Instructions to technician** and type `Confirm front left braking noise and check the AC cooling.`
15. Click **Save draft** in the bar.
    Expected: the button shows **Saving draft**, then a green message **Draft saved**. You stay on Details.
16. Refresh the page (press **F5**) and open **Details** again.
    Expected: the mileage, promised delivery, requests and instructions are as you saved them.
17. Click **Continue to walk-around**.
    Expected: **Saving details**, then a green message **Details saved**, and the **Walk-around** tab opens. The **Details** tab now shows a tick in its circle.

**Pass if:** every message above appears beside the right field, nothing typed is lost after an error, and Details saves.

## C. Walk-around (tablet size)

Make the browser tablet size (Responsive, 1024 by 768).

1. On job **KJA-482TX**, open the **Walk-around** tab.
   Expected: **Fuel level** (five large buttons **E**, **1/4**, **1/2**, **3/4**, **Full**), **Checklist** (25 items, each **Not checked**), **Body and paint** with a drawing of a car seen from above (**Front** at the top, **Rear** at the bottom), **Service book**, **Personal belongings** and **Photos** with five boxes. In the bar: **Back to details**, **More**, the time of the last save (for example **Saved 10:40**, from the Details you just saved) and **Continue to customer consent**.
2. Tap **1/2**.
   Expected: it turns dark. After about a second the bar says **Saving**, then **Saved** with the time, for example **Saved 10:42**.
3. Tap the back of the car drawing, on the rear bumper.
   Expected: a dashed circle appears where you tapped, and a panel opens with **Position: rear bumper**, **Type of damage** (**Crack**, **Dent**, **Scratch**), **Note (optional)**, **Add photo (optional)**, **Save mark** and **Cancel**.
4. Click **Save mark** without choosing a type.
   Expected: red text **Choose Crack, Dent or Scratch.**
5. Tap **Scratch** and click **Save mark**.
   Expected: green message **Scratch on rear bumper marked**. A round **S** marker appears on the rear bumper and the list under the drawing shows **Scratch on rear bumper**.
6. Tap the right side of the car, level with the front seats (the front right door). Tap **Dent**, click **Add photo (optional)**, choose a photo, and click **Save mark**.
   Expected: a **D** marker, and the list shows **Dent on front right door** with a small photo.
7. In the list, click the bin icon next to **Dent on front right door**.
   Expected: **Remove this mark?** with **Remove mark** and **Keep**.
8. Click **Remove mark**.
   Expected: green message **Dent on front right door removed**; the D marker and its line disappear.
9. Add the dent again as in step 6 (the photo is optional).
   Expected: the D marker is back.
10. In **Checklist**, tap **Hub caps** once.
    Expected: it shows a green **Present** label.
11. Tap **Hub caps** again.
    Expected: a red **Missing** label. Every label shows a word as well as a colour.
12. Tap **AC working** three times.
    Expected: **Present**, then **Missing**, then an amber **Not working**.
13. Click **Mark the rest present**.
    Expected: every other item shows **Present**; Hub caps stays **Missing** and AC working stays **Not working**. The text under **Checklist** says **All 25 items checked: 1 missing, 1 not working.** and the button disappears.
14. Turn on **Service book seen**.
    Expected: a box **Stamps for this warranty year** appears. Type `3`.
15. Tick **No valuables left in the vehicle** and type `Umbrella in boot` in **Items left in the vehicle (optional)**.
16. In **Photos**, click the **Front** box and choose a photo.
    Expected: a spinner, then the photo fills the box and a green message **Front photo saved**. A bin icon appears under it.
17. Click the **Odometer** box and choose a file that is not a photo (for example a PDF), if your computer lets you pick one.
    Expected: red text under the box **Choose a JPEG, PNG or WebP photo.** and a **Try again** link.
18. Look at the bar.
    Expected: **Saved** with a recent time.
19. Refresh the page (F5) and open **Walk-around**.
    Expected: fuel 1/2, the S and D markers, Hub caps Missing, AC working Not working, the service book with 3 stamps, the belongings and the front photo are all still there.

**Pass if:** taps place marks and change chips, the "Saved" time updates, and everything is still there after a refresh.

## D. Customer consent

1. On job **KJA-482TX**, click **Continue to customer consent**.
   Expected: the **Customer consent** tab opens. The **Walk-around** circle shows a tick. The heading reads **Please confirm your vehicle details**.
2. Check the vehicle summary.
   Expected: **KJA-482TX** with the service type, **Mileage 48,250 km**, **Fuel level Half (1/2)**, **Damage noted Scratch on rear bumper, dent on front right door**, **Missing Hub caps**, **Not working AC working**, **Promised delivery** with the date and time you set (for example **28 Nov 2026, 16:00**), and **Your requests** numbered 1, 2, 3. **No prices (₦), no instructions to the technician, no staff names.**
3. Scroll inside the **Terms and conditions** box.
   Expected: the 12 terms you entered, numbered 1 to 12, exactly as typed, with the ₦ sign shown correctly.
4. Without ticking anything, click **Sign and accept**.
   Expected: red text **Tick the box to accept the terms and conditions.** and **Ask the customer to sign in the box.**
5. Under **Who is signing**, click **Representative**.
   Expected: three boxes appear: **Name**, **Phone** and **Relationship**, each marked with a red star.
6. Tick **I have read and accept the terms and conditions.**, sign in the signature box, and click **Sign and accept**.
   Expected: red text **Enter the name of the person signing.**, **Enter the phone number of the person signing, for example 0803 555 0142.** and **Enter how the person is related to the customer, for example driver or spouse.**
7. Click **Owner**.
   Expected: the three boxes go away and the screen says **Signing as Adaeze Okafor**.
8. Click **Clear signature**, sign again in the box, and click **Sign and accept**.
   Expected: the button shows **Saving signature** and cannot be pressed twice. Then a green message **Customer consent signed for job (number)** and a green panel **Signed by Adaeze Okafor, (today's date), (time)** with the links **View signed copy** and **Print**. Under it, **Consent summary**: **Signed by Adaeze Okafor (Owner)**, **Date and time**, **Method Signed on screen**. All three tabs now show a tick.
9. Click **View signed copy**.
   Expected: a page **Signed job-opening approval** with the job details, a section **Vehicle condition at check-in** (Fuel level Half (1/2), Service book Seen, 3 stamps this warranty year, Belongings, Photos taken 1, Damage noted with both marks, and the 25 checklist items with Present, Missing or Not working), the 12 numbered terms, the signature and **Signed on (date, time), Lagos time**.
10. Press the browser's back button. Click **Print** in the green panel.
    Expected: the same signed copy opens and the print window appears. In **Print preview** (or **Save as PDF**), only the signed copy is printed, with ₦ and dates readable and the signature block not split across pages. Close the print window.

**Pass if:** the customer screen shows only customer information, every missing answer has its own message, and the signed copy includes the walk-around.

## E. Changes after signing, and a failed signature

1. Open job **KJA-521ST** (Tobi Adeyemi). It opens on **Customer consent**.
   Expected: the customer summary shows Fuel **Half (1/2)**, damage on the rear bumper and front right door, Missing **Hub caps**.
2. Turn off the network: press **F12**, open the **Network** tab, and change **No throttling** to **Offline**.
3. Tick the terms box, sign, and click **Sign and accept**.
   Expected: a red message under the form, for example **Network Error** or **The signature was not saved. Check your connection and press Sign and accept again.** The tick, the Owner choice and your signature are still there.
4. Set **Offline** back to **No throttling**. Click **Sign and accept** again.
   Expected: **Signed by Tobi Adeyemi, ...** with **View signed copy** and **Print**. Only one signature is saved (the Activity and Documents show one).
5. Click the **Walk-around** tab and tap **Full** for the fuel level. Wait for **Saved**.
6. Click the **Customer consent** tab.
   Expected: an amber note **The details changed after the customer signed. Ask the customer to check them and sign again.** and the form again, now showing **Fuel level Full**.
7. Look at the bar.
   Expected: **Send to workshop supervisor** is grey, with the reason beside it: **Details changed after the customer signed. Ask the customer to sign again on Customer consent.**
8. Turn the network **Offline** again. Go to **Walk-around** and tap **3/4**.
   Expected: after a moment the bar shows red **Not saved.** with the reason, and a **Retry** button. The 3/4 button stays selected.
9. Turn the network back to **No throttling** and click **Retry**.
   Expected: the bar shows **Saved** with the time.

**Pass if:** nothing is lost when the network fails, Retry works, and a change after signing asks for a new signature.

## F. Hand over to the workshop supervisor

1. Open job **LSR-522ST**. Look at the bar.
   Expected: **Send to workshop supervisor** is dark, with the line **The workshop supervisor will assign a technician and bay.** under it. The **Customer consent** tab shows **Signed by Lakeside Courier Services Ltd, ...**.
2. Click **Send to workshop supervisor**.
   Expected: the button shows **Sending** and cannot be pressed twice. A green message **Job (number) sent to workshop supervisor**. The header badge changes to **Diagnosis**, the line reads **With: Workshop supervisor since** (now), and step 1 **Check-in** shows a tick with your name and time.
3. Click the one-line summary **Check-in completed by Chidi Eze, ...** above the current step.
   Expected: the recorded facts, including **Instructions to technician**, **Fuel level Half (1/2)**, **Damage noted Scratch on rear bumper, dent on front right door**, **Checklist 1 missing, 1 not working**, **Belongings** and **Customer consent Signed by the customer**.
4. Click **Job file** and the **Activity** tab.
   Expected: a line about the move from Check-in to Diagnosis by Chidi Eze, to Workshop supervisor.
5. Sign out and sign in as the **Workshop manager**. Click the bell at the top right.
   Expected: a notice **Job sent to you** with the job number, **Lakeside Courier Services Ltd**, **LSR-522ST** and **Step: Diagnosis**.
6. Open job **KJA-482TX** (finished in section D) as the **Service advisor** and click **Send to workshop supervisor**.
   Expected: the same as step 2 for that job.

**Pass if:** the job moves to Diagnosis, the header names the workshop supervisor, the activity is recorded and the workshop manager is notified.

## G. Blocked hand-over, someone else's step, and no access

1. Sign in as the **Service advisor**. Ask the developer to reload the demo data first if you already finished section C on **KJA-482TX**. Open **KJA-482TX** and click the **Customer consent** tab straight away.
   Expected: **The customer signs once Details and Walk-around are complete.** with the list **Record the fuel level on Walk-around.** and **Check every checklist item on Walk-around (25 not checked).** and a **Go to Walk-around** button.
2. Look at the bar.
   Expected: **Send to workshop supervisor** is grey, with the reasons beside it: **Record the fuel level on Walk-around. Check every checklist item on Walk-around (25 not checked). Get the customer's signature on Customer consent.**
3. Sign out and sign in as the **Technician**. Open **KJA-521ST**.
   Expected: an amber banner **Waiting for Chidi Eze (Service advisor). You can view this step but only the service advisor can update it.** The three tabs still open. On **Walk-around**, the fuel buttons, chips, boxes and photo boxes cannot be changed, there is no **Mark the rest present** and no **Saved** text. On **Customer consent** the screen says **The customer has not signed yet. The service advisor collects the signature.** (or the signed panel if section E was done). There is no **Send to workshop supervisor** button.
4. Open **LSR-512ST** (already at Diagnosis) as the **Service advisor**. Click the summary line for **Check-in**.
   Expected: the check-in facts, read only. Nothing in check-in can be changed now.
5. Sign out and sign in as the **Abuja branch administrator**. In the address bar, open the job card address of **KJA-482TX** (copy it from the advisor's window).
   Expected: **You cannot open this job card**, saying it belongs to another branch.

**Pass if:** the grey button always explains why, other people see check-in read only, and another branch cannot open the job.

## H. Phone size (390 wide)

Make the browser **iPhone 12 Pro** size and open **KJA-482TX** as the **Service advisor** (reload the demo data first if needed).

1. Look at the page.
   Expected: no sideways scrolling. The header shows the plate, model, badge and owner line, and scrolls away with the page (on phones it does not stay fixed, to leave room for the step). The stepper shows **Step 1 of 8: Check-in** with a thin progress bar.
2. Look at the three tabs.
   Expected: the current part shows its full name (for example **Walk-around**); the other two show only their tick or number. Tapping one opens it and shows its name.
3. Open **Details**.
   Expected: the cards are in one column, one under another. Every box fits the screen.
4. Open **Walk-around**.
   Expected: one column: Fuel level, Checklist (one item per row), Body and paint (the drawing, then the list), Service book, Personal belongings, Photos (two per row). The buttons are large enough to tap with a thumb.
5. Open **Customer consent**.
   Expected: one column. The signature box fills the width and you can sign with a finger or mouse. **Sign and accept** is full width.
6. Scroll down.
   Expected: the bar stays at the bottom of the screen. The first row has small buttons with icons only (back arrow, the three dots for **More**, and the **Save draft** disk on Details), plus the **Saved** time on Walk-around. The main button fills the second row. Holding the mouse over an icon button shows its name.

**Pass if:** everything fits in one column with no sideways scrolling and every button can be reached.

## I. Keyboard only

Use only the keyboard on **KJA-482TX** (reload the demo data first if needed).

1. Press **Tab** until the **Details** tab is highlighted, then press the **Right arrow**.
   Expected: the **Walk-around** tab opens and stays highlighted. **Left arrow** goes back.
2. Press **Tab** into the fuel buttons and use the **arrow keys**.
   Expected: the dark button moves with the arrow keys.
3. Press **Tab** to the **Hub caps** item and press **M**.
   Expected: it shows **Missing**. **P** gives **Present**, **N** gives **Not working**. **Enter** or **Space** moves it to the next state.
4. Press **Tab** to **Add a mark with the keyboard** and press **Enter**.
   Expected: a dashed circle in the middle of the car, the panel opens and **Crack** is focused. Press **Shift+Tab** to reach the circle, then the **arrow keys** to move it; **Position:** changes as it moves (for example **roof**, then **rear left door**).
5. Press **Tab** to the damage types, choose one with the **arrow keys**, **Tab** to **Save mark** and press **Enter**.
   Expected: the mark is saved, as in section C.
6. On the job's page, press **Tab** to **More** in the bar, press **Enter**, choose **Cancel job** and press **Enter**.
   Expected: the **Cancel job** window opens. Press **Esc**.
   Expected: the window does not close on Esc (it closes only with **Keep job** or the close button). Click **Keep job** with **Enter**.

**Pass if:** every step can be done without the mouse and the focus ring is always visible.

## Always report

Report any of these straight away, on any screen:
- Emojis, odd symbols, question marks or boxes where words should be.
- Garbled letters such as "â‚¦" instead of "₦".
- The words "undefined", "null" or "NaN", or codes in capitals with underscores such as NOT_WORKING or CHECK_IN.
- Prices without the ₦ sign, or dates like 2026-11-25T10:49:00Z.
- A pop-up box from the browser itself (grey, plain, with an OK button) instead of the app's own messages.
- A button that does nothing, or a greyed-out button with no explanation next to it.
- A form that loses what you typed after an error.
- Having to scroll sideways to see the whole page.
- Being able to change a step that belongs to another role.

## Not in this phase

These are still old or unfinished. Do not report them as bugs.
- **Diagnosis** (assigning the technician and bay, findings, engineer review) still shows the older sections. Phase 3 replaces them.
- The amber note about **missed services in the service history** is not there yet. Only the warranty cover note shows. Phase 4 adds the service history rule.
- **Estimate** still shows the older estimate and advance sections. Phase 5 replaces them.
- The printed **job card** in the paper layout, with the terms on the back, is not available yet. Only the signed copy prints. Phase 11 adds it.
- **Photos of the service book stamps** come in phase 4. **Warranty** and **Delivery** screens come in phases 4 and 9.
- The **Job file > Customer and vehicle** tab still lists tyre and battery details on older jobs; new jobs no longer record them.
- The workshop manager's notice repeats "Job sent to you" in its title and message. This comes from the notice system and is unchanged.

## Results table

| Step | Pass or Fail | What I saw |
|---|---|---|
| Settings 1 to 7 | | |
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
| C12 | | |
| C13 | | |
| C14 | | |
| C15 | | |
| C16 | | |
| C17 | | |
| C18 | | |
| C19 | | |
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
| G1 | | |
| G2 | | |
| G3 | | |
| G4 | | |
| G5 | | |
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
| I6 | | |

## How to report a problem

For each problem, write down:
1. The phase and step number from this guide, for example "Phase 2, step C11".
2. The job number, for example 2026000012.
3. The role you were signed in as.
4. What you expected, copied from the guide.
5. What actually happened.
6. A screenshot. On Windows, press **Windows + Shift + S** and drag over the screen.
