# Job card revamp, phase 4: manual test guide

## What changed in this phase

Step 3 of a job card, **Warranty**, is now one screen for the warranty officer. It shows the vehicle's warranty cover with two bars (time used and distance used), and the vehicle's service history checked against the regular-service rule: at least every 3 months or 5,000 km, whichever comes first, in every warranty year. Each year is split into quarters, and each quarter says "On time", "Missed", "Upcoming" or "No service due" in words. The officer can add a service done at another Kia dealer, with a photo of the stamped service book, and the history updates straight away. For each item the technician listed, the officer chooses who pays: Warranty, Goodwill, Campaign or Customer pay. When a service was missed, warranty or goodwill needs a written reason. **Return to service advisor** then passes the job to the advisor for the estimate. At check-in, the advisor now sees how many services were missed on a vehicle in warranty.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000049.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery, shown as numbered circles near the top of the job.
- **Warranty year**: a year counted from the day the vehicle was sold. Year 1 is the first 12 months after the sale.
- **Quarter**: a 3-month part of a warranty year, shown as Q1 to Q4.
- **Missed service**: a gap between two services longer than 3 months, or longer than 5,000 km.
- **Outside service record**: a service done at another authorised Kia dealer, copied from the customer's stamped service book.
- **Who pays** (the "decision"): **Warranty** (the manufacturer pays), **Goodwill** (Dana Motors pays as a favour to the customer), **Campaign** (a recall or campaign pays), **Customer pay**.
- **Bar**: the strip fixed at the bottom of the job card page with the main button. A grey main button has a sentence beside it saying why it cannot be pressed yet.
- **Header**: the top of the job, with the line **With: (name or role) since (date)**, which says who holds the job now.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Warranty officer | warranty@kiamotors.com | Madam Kemi | warranty@kiamotors.com, Folake Adebayo |
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com |
| Technician | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com |
| Administrator | admin.lagos@danamotors.com | Adaeze Okonkwo | admin.lagos@danamotors.com |

**Demo jobs.** All are at **Main Branch**. Open **Job Cards** in the left menu, type the plate in the search box above the list, then click the three-dot **Actions** button at the end of the row and **View details**. The job numbers are the ones on the test site; on the developer's computer they are in brackets.

| Plate | Job number | Where it is | Used in section |
|---|---|---|---|
| KJA-527ST | 2026000049 (2026000026) | Warranty, nothing decided yet. One missed service in year 2, quarter 2. Seven items: AC check and recharge, AC compressor, AC refrigerant, brake pad labour, brake pads, periodic service, engine oil | A, B, C, H |
| KJA-528ST | 2026000050 (2026000027) | Warranty, nothing decided yet. Regular service history, linked to the recall RC-DM-2601 | D, E, H |
| KJA-529ST | 2026000051 (2026000028) | Warranty, nothing decided yet. No sale date recorded | F, G |
| LSR-515ST | 2026000037 (2026000016) | Estimate. The Warranty step was skipped ("Not under warranty") | I |
| KJA-482TX | 2026000033 (2026000012) | Check-in. A Sportage under warranty with no periodic service since it was sold | J |

The dates in this guide are for demo data loaded on 26 Nov 2026. If the data was reloaded on another day, every date moves by the same number of days; follow what the screen shows.

Sections B, C, E and G change their jobs. After testing, ask the developer to reload the demo data before you test them again.

**Phone or tablet size (Chrome).** Press **F12**, click the device toolbar icon (a phone and tablet, top left of the panel), then choose a size at the top of the page: **iPhone 12 Pro** (390 wide) or type **768** or **1024** in the width box. Press **F12** again to go back.

**Settings to check first (Administrator, once).**

1. Sign in as **Administrator**. Open **Settings**, then **Warranty**, then the tab **Service history rule**.
   Expected: **Service every (months)** 3, **Or every (km)** 5000, **Services per year** 4, **Grace (days)** 0, **Grace (km)** 0. A **Save rule** button, grey until you change something.
2. Open **Settings**, then **Workshop Masters**. The list shows service types. Click **Edit** on **PAID SERVICE (RG)**.
   Expected: the box **Periodic maintenance (counts in the warranty service history)** is ticked. Click the close button (X) at the top right without saving.
3. Click **Edit** on **SERVICE CAMPAIGN (SC)**.
   Expected: **Periodic maintenance (counts in the warranty service history)** is not ticked. Close without saving.

Pass if: the rule shows 3 months, 5,000 km, 4 per year and no grace, and paid service counts but service campaign does not.

## A. The warranty officer's screen

1. Sign in as **Warranty officer** and open job **KJA-527ST**.
   Expected: the header shows the purple badges **Warranty check** and **Warranty**, and **With: Warranty officer since** (a date). The heading reads **Step 3 of 8: Warranty**, with "Warranty officer is checking cover" under it.
2. Look at the card **Coverage**.
   Expected: a green badge **Active**; "Sold 5 Apr 2025. Expires 4 Apr 2030."; a bar **Time used: 1 year 7 months of 5 years** with **33%**; a bar **Distance: 27,300 of 100,000 km** with **27%**.
3. Look at the card **Campaigns and recalls**.
   Expected: "No open campaigns for this vehicle."
4. Look at the card **Service history**.
   Expected: an amber badge **1 missed service**; the line "Service at least every 3 months or 5,000 km, whichever comes first."; the sentence "Service history has 1 missed service in warranty year 2."
5. Look at the row **Year 1**, "Apr 2025 to Apr 2026".
   Expected: four blocks Q1 to Q4, each with a green **On time** badge, a date and "... km since last service": **29 Jun 2025**, 4,100 km; **22 Sept 2025**, 4,500 km; **16 Dec 2025**, 4,300 km; **11 Mar 2026**, 4,300 km.
6. Look at the row **Year 2 (current)**, "Apr 2026 to Apr 2027".
   Expected: Q1 **On time**, **4 Jun 2026**, 4,300 km since last service. Q2 is pink with a red **Missed** badge and "5 months 1 week and 4,500 km since the last service". Q3 **On time**, **16 Nov 2026**. Q4 grey **Upcoming**, "Due 16 Feb 2027".
7. Scroll down to the card **Items to decide**.
   Expected: "0 of 7 decided" on the right. A table with the columns **Item**, **Type**, **Technician's note** and **Decision**. Each item shows the customer request it is for (for example "For: AC not cooling well"); the three AC items also show a purple **Possible warranty** badge. The **Decision** column shows four choices on each row: **Warranty**, **Goodwill**, **Campaign**, **Customer pay**, none chosen yet.
8. Point the mouse at **Warranty** on the row **AC refrigerant R134a, 500 g**.
   Expected: it is pale and cannot be clicked, and a tip says "This part cannot be claimed under warranty."
9. Point at **Campaign** on any row.
   Expected: pale, with the tip "No campaign is linked to this job."
10. Look at the bar at the bottom.
    Expected: a grey **Return to service advisor** button with "Choose who pays for every item (7 of 7 not decided yet)." beside it.

Pass if: cover, service history, campaigns and the seven items show as above, every status has a word as well as a colour, and the handoff is grey with its reason.

## B. Add an outside service record

1. In **Service history**, click **Add outside service record**.
   Expected: a window **Add outside service record** with the fields **Service date**, **Km reading**, **Dealer**, **Note**, and **Photo of the stamped service book page** with a **Take or choose photo** button.
2. Click **Save record** without filling anything.
   Expected: under each field: "Enter the service date", "Enter the km reading from the service book", "Enter the dealer that did the service", and "Add a photo of the stamped service book page". The window stays open.
3. Type **Kia Ikeja** in **Dealer**, then press **Esc**.
   Expected: the window stays open and "Kia Ikeja" is still there. Clicking outside the window does not close it either.
4. In **Service date**, choose tomorrow's date (27 Nov 2026). In **Km reading** type **23800**. Click **Take or choose photo** and choose any photo (JPEG or PNG) from your computer.
   Expected: the photo appears in the window with **Replace photo** and **Remove photo** buttons.
5. Click **Save record**.
   Expected: under **Service date**: "The service date cannot be in the future".
6. Change **Service date** to **23 Aug 2026** and click **Save record**.
   Expected: the window closes. A green message "Outside service record added: 23 Aug 2026, 23,800 km, Kia Ikeja". The badge changes to green **Regular** and the sentence to "Service history is regular. No missed services." Year 2, Q2 now shows **On time**, **23 Aug 2026**, "2,300 km since last service, at Kia Ikeja".
7. Under **Outside service records**, click the small photo beside the record.
   Expected: the stamped page opens larger under the record. Click it again to close it.
8. Click **Remove** on the record.
   Expected: a window **Remove outside service record** naming the record, with **Reason for removing**.
9. Click **Remove record** without a reason.
   Expected: "Give the reason for removing this record".
10. Type **Stamp belongs to another vehicle** and click **Remove record**.
    Expected: green message "Outside service record removed: 23 Aug 2026, 23,800 km, Kia Ikeja". The badge is back to amber **1 missed service** and Q2 is **Missed** again.

Pass if: every missing field is named, a future date is refused, the record fills the gap at once, and removing it needs a reason and brings the missed service back.

## C. Decide who pays and return the job

1. On **AC system check and refrigerant recharge**, click **Warranty**.
   Expected: **Warranty** turns purple, the row turns pale purple, and "Saving" shows briefly under the choices.
2. On **AC compressor**, click **Warranty**.
   Expected: the same.
3. On the other five rows (**AC refrigerant R134a, 500 g**, **Replace front brake pads**, **Front brake pads set**, **Periodic maintenance service**, **Engine oil 5W-30, 4 litres**), click **Customer pay**.
   Expected: each turns dark. The card shows "7 of 7 decided".
4. Look under the table.
   Expected: a box **Reason** with a red star, the hint "Needed because the service history is not regular and items are set to warranty or goodwill.", and in red under the box "Write a reason, because the service history is not regular and items are set to warranty or goodwill." The bar says the same beside the grey **Return to service advisor**.
5. Type **Missed service in year 2 is not related to the AC system** in **Reason** and wait 2 seconds.
   Expected: "Reason saved" under the box. The red message goes. **Return to service advisor** turns dark, with "Chidi Eze will prepare the estimate." under it.
6. Reload the page (F5).
   Expected: all seven choices and the reason are still there.
7. Click **Return to service advisor**.
   Expected: a green message "Job 2026000049 sent to Chidi Eze". The heading changes to **Step 4 of 8: Estimate**, the header to **With: Chidi Eze (Service advisor)**, and the Warranty circle in the steps has a tick with your name and the time.
8. Click the line **Warranty completed by Madam Kemi, ...** above the current step.
   Expected: it opens "Read only" with the cover, service history and the items: purple **Warranty** badges on the two AC items, grey **Customer pay** on the rest, and the reason. There are no choices to click.
9. Open **Job file** (top right), tab **Warranty and campaigns**.
   Expected: under **Warranty at creation**, "Warranty case WTY..." with the status **Open**.
10. Sign out and sign in as **Service advisor**. Click the bell at the top.
    Expected: a notification **Job sent to you** reading "Job sent to you: 2026000049, Adaeze Okafor, KJA-527ST. Step: Estimate".
11. Open the job and its **Job file**, tab **Activity**.
    Expected: at the top of **Step changes**: "Moved from Warranty to Estimate", "Madam Kemi" with the date and time, "Sent to Chidi Eze (Service advisor)" and "2 items warranty, 5 items customer pay. Warranty case WTY..."

Pass if: the reason is demanded only because a service was missed, every choice survives a reload, and the job reaches the advisor with a warranty case, a notification and an Activity line.

## D. Someone else's step, and no warranty access

1. Sign in as **Service advisor** and open **KJA-528ST**.
   Expected: an amber banner "Waiting for the warranty officer. You can view this step but only the warranty officer can update it." The cards show, but the items show "Not decided" instead of choices, and there is no **Add outside service record** button. The bar has no **Return to service advisor**.
2. Sign in as **Technician** and open **KJA-528ST**.
   Expected: a card **Warranty check** saying "Only warranty staff can see the warranty evidence. The warranty officer checks the cover and service history, decides who pays for each item, and then returns the job to the service advisor for the estimate." No cover, history or items are shown.

Pass if: the advisor can read but not change anything, and the technician sees the plain explanation instead of the evidence.

## E. A recall item paid by the campaign

1. Sign in as **Warranty officer** and open **KJA-528ST**.
   Expected: **Campaigns and recalls** lists **RC-DM-2601** with an amber **Recall** badge and "Engine wiring harness inspection". **Service history** shows green **Regular** and "Service history is regular. No missed services." Year 1 (current): Q1 **On time** 9 Jun 2026, Q2 **On time** 2 Sept 2026, Q3 **Upcoming** "Due 2 Dec 2026".
2. On **General labour (see estimate notes)** click **Campaign**.
   Expected: **Campaign** turns amber and stays selected.
3. On **Periodic maintenance service** and **Engine oil 5W-30, 4 litres** click **Customer pay**.
   Expected: "3 of 3 decided". No **Reason** box appears (the history is regular).
4. Look at the bar.
   Expected: **Return to service advisor** is dark, with "Chidi Eze will prepare the estimate." under it. You may click it; the job moves to **Step 4 of 8: Estimate**.

Pass if: the campaign can pay for an item when a campaign is linked, and no reason is asked for with a regular history.

## F. No sale date

1. Open **KJA-529ST** as **Warranty officer**.
   Expected: **Coverage** shows an amber **Cannot confirm** and "No sale date is recorded for this vehicle." with the reason "No warranty start (sale) date is recorded for this vehicle." **Service history** shows a grey **Cannot check**, the sentence "Service history cannot be checked. No sale date is recorded for this vehicle." and an amber note "No sale date is recorded for this vehicle. Add the sale date on the vehicle's warranty details (Warranty, Vehicle warranty)."
2. Point at **Warranty** on **AC compressor**.
   Expected: pale, with the tip "Not in warranty when the job opened. Open a warranty case from the Warranty menu first, or choose goodwill."

Pass if: the screen says exactly what is missing and how to fix it, and warranty cannot be chosen for a vehicle not known to be covered.

## G. Offline and saving problems

1. Still on **KJA-529ST**, press **F12**, open the **Network** tab and choose **Offline** in the throttling list (or turn off Wi-Fi).
2. On **AC system check and refrigerant recharge**, click **Goodwill**.
   Expected: **Goodwill** stays selected, and under it in red "Not saved." with the reason and a **Retry** link. A red message also appears at the top right.
3. Set the network back to **No throttling** (or turn Wi-Fi on) and click **Retry**.
   Expected: the red text goes. Reload the page: **Goodwill** is still selected.
Pass if: nothing chosen is lost while offline, and the problem says what to do.

## H. Phone, tablet and keyboard

1. As **Warranty officer** open **KJA-528ST** at **1024** wide.
   Expected: **Coverage** and **Campaigns and recalls** side by side above **Service history**; the items as cards, each with its four choices in one row. No sideways scrolling.
2. Change to **390** wide (iPhone 12 Pro).
   Expected: one column. Each quarter is its own block with its label (Q1, Q2 ...). Each item is a card with the four choices in two rows of two. **Return to service advisor** fills the width of the bar. No sideways scrolling anywhere.
3. Change back to the normal size. Click in the page above **Items to decide**, then press **Tab** until the outline is on the choices of the first item.
   Expected: a clear focus outline on the selected choice (or the first one).
4. Press the **Right arrow** key twice.
   Expected: the choice moves along and is saved; a disabled choice is skipped.
5. Open **Add outside service record** on **KJA-527ST** with **Enter** on the button, press **Tab** through the fields, then **Esc**.
   Expected: the close button (X) at the top, then the fields in order: Service date, Km reading, Dealer, Note, **Take or choose photo**, **Cancel**, **Save record**. Esc does not close the window. **Cancel** closes it.

Pass if: every width works without sideways scrolling and everything can be done with the keyboard.

## I. A skipped warranty step can still be read

1. As **Warranty officer** open **LSR-515ST**.
   Expected: **Step 4 of 8: Estimate**; in the steps, **Warranty** is grey with a dash and "Skipped".
2. Click the line **Warranty skipped. Not under warranty.**
   Expected: it opens "Read only" with the cover (red **Expired**), the service history and the items with no choices to click.
3. Click the grey **Warranty** circle in the steps at the top.
   Expected: the same read-only view opens.

Pass if: the officer can read the evidence on a job that skipped the warranty step.

## J. The check-in warning

1. Sign in as **Service advisor** and open **KJA-482TX** (at check-in). Click the tab **Details** at the top of check-in.
   Expected: an amber note "Service history has 3 missed services in warranty year 1. Warranty items will need the warranty officer's review." with a **View warranty** link.

If someone has already moved this job past check-in, skip this section and note it in the results table.

Pass if: the advisor is warned at check-in in one plain sentence.

## Always report

Report any of these on any screen, even if the step passed:
- emojis or odd symbols, such as boxes, question marks in place of letters, or "Ã" and "â‚¦";
- the words "undefined", "null" or "NaN";
- codes in capitals with underscores, such as WARRANTY_TO_ADVISOR or ON_TIME;
- money without the ₦ sign, or dates not in the form 23 Aug 2026;
- browser pop-up boxes (the grey ones from the browser itself);
- buttons that do nothing, or grey buttons with no reason beside them or as a tip;
- typing that disappears, or a window that closes on its own;
- sideways scrolling.

## Not in this phase

- The estimate (step 4) still uses the older estimate screen. Phase 5 turns the decided items into the priced estimate, using who pays from this step.
- The claim lines of the warranty case (parts, labour, codes) are still filled in from the **Warranty** menu as before. This step only opens the case.
- The Job file tab **Warranty and campaigns** still shows the older cover card and the job card lines; it is tidied in phase 12.
- Dates show the month "Sept" (for September) everywhere in the app; this comes from the shared date format.
- The grace values (0 days, 0 km) and which service types count as periodic maintenance are waiting for the warranty lead to confirm.

## Results table

| Step | Pass or Fail | What I saw |
|---|---|---|
| Settings 1 | | |
| Settings 2 | | |
| Settings 3 | | |
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
| C8 | | |
| C9 | | |
| C10 | | |
| C11 | | |
| D1 | | |
| D2 | | |
| E1 | | |
| E2 | | |
| E3 | | |
| E4 | | |
| F1 | | |
| F2 | | |
| G1 | | |
| G2 | | |
| G3 | | |
| H1 | | |
| H2 | | |
| H3 | | |
| H4 | | |
| H5 | | |
| I1 | | |
| I2 | | |
| I3 | | |
| J1 | | |

## How to report a problem

For each problem, send:
- the phase and step number, for example "Phase 4, C5";
- the job number;
- the role you were signed in as;
- what you expected (copy it from this guide);
- what happened instead;
- a screenshot (Windows + Shift + S, then paste it into your message).
