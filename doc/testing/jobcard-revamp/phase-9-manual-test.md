# Job card revamp, phase 9: manual test guide

## What changed in this phase

Step 8 of a job card, **Delivery**, is rebuilt for the moment the customer collects the vehicle. The advisor goes through it with the customer on a tablet: the work done in plain words, the work the customer declined (recommended for the next visit), and the customer's belongings from check-in, each ticked **Returned** as it is handed back. The advisor chooses who is collecting the vehicle: the owner, the person who signed the job card at check-in, or someone else; someone else needs a service manager's or workshop manager's approval with a reason (terms clause 7). If the customer approved the estimate on the phone, they sign for it first. After the promised time, the advisor must choose 1 to 6 reasons for the late delivery. The customer signs, the advisor presses **Complete delivery and print gate pass**, the gate pass prints, and the job closes with the follow-up call date shown.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000067.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery, shown as numbered circles near the top of the job (on a phone, as "Step 8 of 8: Delivery" with a bar).
- **Belongings**: loose items recorded at check-in (service book, registration documents, jack and handle, tool kit, floor mats, spare wheel, fire extinguisher) plus anything the advisor noted, such as "Umbrella in boot".
- **Estimate approved by phone**: the customer agreed the price on the phone while away from the workshop. They still owe a signature for it, which they give at delivery.
- **Terms clause 7**: the vehicle is released only to the owner or the person who signed the job card.
- **Gate pass**: the slip the security guard checks before the vehicle leaves. It has its own number.
- **Follow-up call**: the call to the customer a few days after delivery to ask whether they are satisfied (post-service follow-up, PSF).
- **Bar**: the strip fixed at the bottom of the job page with the main button. When the button is grey, a sentence beside it says why.
- **Header**: the top of the job, with the line **With: (name and role) since (date)**, which says who holds the job now.
- **Toast**: the short message that appears for a few seconds at the top right of the screen.
- **Job file**: the button at the top of the job that opens a side panel with tabs, including **Activity** (the job's history).

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com (Chidi Eze) |
| Service manager (approves release to someone else) | servicemanager@kiamotors.com | Mark Folorusho | servicemanager@kiamotors.com (Mr Mark) |
| Technician (for the read-only check) | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com (Tunde Akinyemi) |
| Administrator (settings and the follow-up screen) | the administrator account you normally use | | admin.lagos@danamotors.com |

**Demo jobs.** All are at **Main Branch**; customer names are fictional. To open one, use **Job Cards** in the left menu, type the plate in the search box, then click the three-dot **Actions** button at the end of the row and **View details**. The job numbers are the ones on the test site; on the developer's computer they are in brackets.

| Plate | Job number | Where it is | Used in section |
|---|---|---|---|
| LSR-544ST | 2026000067 (2026000049) | Delivery. Paid. Owner Adaeze Okafor. The air filter was declined; a rear wiper blade was added during the repair. Two estimates approved by phone, not signed yet | A, B, C, D, J |
| LSR-545ST | 2026000068 (2026000050) | Delivery. On credit (Lakeside Courier Services Ltd). The promised time has passed | E, G |
| LSR-546ST | 2026000069 (2026000051) | Delivery. Paid. Owner Tobi Adeyemi; his brother Kunle Adeyemi signed the job card at check-in | F |
| LSR-547ST | 2026000070 (2026000052) | Closed. Already delivered to Adaeze Okafor | H, I |

Sections A to F change their jobs. After testing, ask the developer to reload the demo data before you test them again.

**Tablet size.** Most of this phase is used on a tablet. In Chrome press **F12**, click the device toolbar icon (a phone and tablet, top left of the panel), and choose **iPad Mini** (768 x 1024) from the list at the top of the page. For a phone choose **iPhone 12 Pro** (390 wide). Press **F12** again to go back to the normal size.

**Printing.** **Complete delivery and print gate pass** opens the browser's print window. Click **Cancel** in that window unless you want to print; the delivery is already saved.

**Settings to check first.** Sign in as an administrator, click **Settings** in the left menu, then **Company & Branch Settings**. Under **Branch rules**, choose **Branch: Main Branch** and find the group **Follow-up call**. Expected: **Follow-up call after delivery (days)** shows 2. If not, enter 2 and click **Save branch rules**. Do not change anything else. Sign out.

## A. The handover screen (advisor, tablet)

1. Make the browser tablet size (see above). Sign in as the **Service advisor**. Open job **LSR-544ST**.
   - **Expected:** under the step circles, the heading **Step 8 of 8: Delivery** and the line "Waiting for the customer to collect". The header badge reads **Ready**, and the header line reads **With: Chidi Eze (Service advisor) since** a date and time.
2. Look at the card **Work done**.
   - **Expected:** one line per piece of work, each with a green tick icon, including "Replace rear wiper blade (added with your approval)".
3. Look at the card **Declined, recommended for next visit**.
   - **Expected:** "Air filter element".
4. Look at the card **Estimate approved by phone**.
   - **Expected:** two boxes, "Revision 1, approved on the phone by Adaeze Okafor (+2348099900105), (date), (time)" and "Revision 2, ...", each listing the items with amounts like ₦12,500.00 on the right and **Approved total with VAT**. Below: the sentence "I confirm that I approved this work on the phone, as listed, and I accept the estimate terms.", **Name of the person signing** filled with "Adaeze Okafor", a signature box, and **Save estimate signature**.
5. Look at the card **Your belongings**.
   - **Expected:** eight rows: Service book, Registration documents, Jack and handle, Tool kit, Floor mats, Spare wheel, Fire extinguisher, Umbrella in boot, each with an empty **Returned** tick box, and a **Tick all returned** button.
6. Look at the card **Collected by**.
   - **Expected:** two choices: "Adaeze Okafor (owner)" with a green badge **Matches job card signer**, and "Someone else". Nothing is chosen yet.
7. Look at the card **Customer signature**.
   - **Expected:** the sentence "I am taking delivery of the vehicle and I am satisfied with the repairs." and below it "The customer signs the estimate approved by phone first. Then they sign here." (no signature box yet).
8. Look at the bar at the bottom.
   - **Expected:** a grey **Complete delivery and print gate pass** button and beside it "The customer must first sign the estimate they approved on the phone. 3 more things to do before delivery."

**Pass if:** all six cards show with the right content, nothing shows codes or odd symbols, and the main button is grey with the reason.

## B. The customer signs the estimate approved by phone

9. In **Estimate approved by phone**, click **Save estimate signature** without signing.
   - **Expected:** "Ask the customer to sign in the box." in red under the box. Nothing is saved.
10. Clear the **Name of the person signing** box and click **Save estimate signature**.
    - **Expected:** "Enter the name of the person signing." in red under the name.
11. Type `Adaeze Okafor` in **Name of the person signing**, sign in the box with the mouse or a finger, and click **Save estimate signature**.
    - **Expected:** the button shows "Saving signature" briefly, then the toast "The customer signed the estimate they approved on the phone." The card **Estimate approved by phone** disappears. **Customer signature** now shows a signature box with "Choose who is collecting the vehicle, then ask them to sign." under it.

**Pass if:** the estimate signature is needed before the delivery signature, and both mistakes are caught with a message under the field.

## C. Mistakes the screen catches

12. In **Your belongings**, click **Tick all returned**.
    - **Expected:** all eight boxes are ticked and the button disappears.
13. Untick **Returned** for **Umbrella in boot**.
    - **Expected:** the bar reads "Tick Returned for every belonging: 1 is not ticked yet. 2 more things to do before delivery." **Tick all returned** is back.
14. In **Collected by**, choose **Someone else**.
    - **Expected:** an amber box: "Terms clause 7: the vehicle is released only to the owner or the person who signed the job card. A service manager or workshop manager must approve releasing it to someone else, with a reason." Below it **Name of the person collecting** and **Ask a manager to approve**.
15. Leave the name empty and click **Ask a manager to approve**.
    - **Expected:** "Enter the full name of the person collecting." in red.
16. Choose **Adaeze Okafor (owner)** again.
    - **Expected:** the amber box goes. Under the signature box: "Signing as Adaeze Okafor." The bar no longer mentions the collector.

**Pass if:** every missing item is named in the bar, and someone else cannot be chosen without a manager.

## D. Complete delivery and the gate pass

17. Tick **Returned** for **Umbrella in boot**.
    - **Expected:** the bar reads "The customer must sign to take delivery."
18. Sign in the **Customer signature** box.
    - **Expected:** **Complete delivery and print gate pass** turns dark (it can be clicked); the sentence beside it changes to "The job closes and the gate pass prints."
19. Click **Complete delivery and print gate pass**.
    - **Expected:** the button shows a spinner, then the toast "Job (number) delivered. Gate pass (number) issued.", and the browser's print window opens showing the gate pass. Click **Cancel** in the print window.
20. Look at the page.
    - **Expected:** the heading **Closed job**; a green panel "Delivered to Adaeze Okafor, (today's date), (time)", for example "Delivered to Adaeze Okafor, 28 Nov 2026, 15:20"; a card **Gate pass** with the number and **Print gate pass**; "Follow-up call scheduled for (date two days after today)."; a card **Handover** (Collected by "Adaeze Okafor, +2348099900105", Collector "Owner", Customer signed, Handed over by "Chidi Eze", Belongings returned listing all eight); **Work done**; **Declined, recommended for next visit**; and the **Invoice** card with ₦ amounts and the badge **Paid**.
21. Look at the step circles.
    - **Expected:** all 8 steps have a tick, including **Delivery**. Under the circles there is a line "Delivery completed by Chidi Eze, (date), (time)."
22. Look at the header.
    - **Expected:** no **With:** line (nobody holds a closed job) and no main button in the bar.
23. Click **Print gate pass**.
    - **Expected:** the print window shows the gate pass with the gate pass number, job card, customer, vehicle, plate, delivered date and time and delivery advisor. Click **Cancel**.
24. Click **Job file**, then the **Activity** tab.
    - **Expected:** the newest line reads "Vehicle delivered. Job closed", by Chidi Eze, with the note "Delivered to Adaeze Okafor". Close the panel with **Esc**.

**Pass if:** the delivery saves once, the gate pass prints, the job closes with all 8 steps ticked, and the follow-up date shows.

## E. Late delivery, keyboard only and a lost connection (advisor, 1024 wide)

25. Make the browser 1024 wide (device toolbar, **Responsive**, type 1024 in the width box). Open job **LSR-545ST**.
    - **Expected:** a card **Reasons for late delivery** with the amber line "Delivered after the promised time of (date), (time)." and six reasons to tick (for example "Spare unavailable"), plus **Delay remark (optional)**. There is no **Estimate approved by phone** card (it was signed before).
26. Using only the keyboard: press **Tab** until **Tick all returned** is highlighted, then press **Enter**.
    - **Expected:** every **Returned** box is ticked.
27. Press **Tab** until the circle next to "Lakeside Courier Services Ltd (owner)" is highlighted, then press **Space**.
    - **Expected:** the owner is chosen; "Signing as Lakeside Courier Services Ltd." shows under the signature box.
28. Sign in the **Customer signature** box with the mouse.
    - **Expected:** the bar reads "The promised time has passed. Choose 1 to 6 reasons for late delivery." and the main button stays grey.
29. Tick the first reason, then click in **Delay remark (optional)** and type `Parts arrived late from the supplier.`
    - **Expected:** the main button turns dark.
30. Turn the connection off: Chrome **F12** > **Network** tab > change **No throttling** to **Offline**. Click **Complete delivery and print gate pass**.
    - **Expected:** a red message "The delivery could not be saved. Check your connection and try again. Your entries are kept." The ticked reason, the remark and all other entries are still there.
31. Set **Offline** back to **No throttling**. Click **Complete delivery and print gate pass** again.
    - **Expected:** the toast "Job (number) delivered. Gate pass (number) issued."; the print window opens (click **Cancel**); the **Handover** card shows **Reasons for late delivery** with the reason you ticked and **Delay remark** "Parts arrived late from the supplier."

**Pass if:** late reasons are required after the promised time, the keyboard can do everything except signing, and nothing typed is lost when the connection drops.

## F. Someone else collects, with a manager's approval

32. Make the browser full size. As the **Service advisor**, open job **LSR-546ST**. Look at **Collected by**.
    - **Expected:** three choices: "Tobi Adeyemi (owner)" (no badge), "Kunle Adeyemi (signed at check-in)" with the green badge **Matches job card signer**, and "Someone else".
33. Choose **Someone else**. In **Name of the person collecting** type `Bola Ade`, then click **Ask a manager to approve**.
    - **Expected:** the toast "Asked Mark Folorusho to approve the release." (on the test site it may name more than one manager, for example "Asked Mark Folorusho and (name) to approve the release.").
34. Sign out. Sign in as the **Service manager**. Click the bell icon at the top.
    - **Expected:** a notice "Approval needed to release a vehicle: (job number), Tobi Adeyemi, LSR-546ST. Collected by Bola Ade, not the owner or the job card signer". Click it.
    - **Expected:** job LSR-546ST opens. The yellow banner says "Waiting for Chidi Eze (Service advisor). You can view this step but only the service advisor can update it." The **Collected by** card shows the amber clause 7 box and the button **Approve release to someone else**.
35. Click **Approve release to someone else**, then click **Approve release** without typing anything.
    - **Expected:** three red messages: "Enter the full name of the person collecting.", "Enter the phone number." and "Write why the vehicle can be released to this person (at least 10 characters)."
36. Type `Bola Ade` in **Full name of the person collecting**, `123` in **Their phone number**, and click **Approve release**.
    - **Expected:** "Enter a Nigerian mobile number, for example 0803 555 0142."
37. Change the phone number to `0803 999 8888`. In **Reason** type `The owner phoned to send his driver, who showed his ID.` Press **Esc**, then click outside the window.
    - **Expected:** the window stays open both times, with everything you typed.
38. Click **Approve release**.
    - **Expected:** the toast "Release to Bola Ade approved." The window closes. **Collected by** shows a green box "Release to Bola Ade (08039998888) approved by Mark Folorusho (Service manager), (date), (time). Reason: The owner phoned to send his driver, who showed his ID."
39. Sign out. Sign in as the **Service advisor** and open job **LSR-546ST**. Choose **Someone else**.
    - **Expected:** the same green approval box; no amber box, no **Ask a manager to approve**.
40. Click **Tick all returned**, sign in the **Customer signature** box.
    - **Expected:** "Signing as Bola Ade." under the box.
41. Click **Complete delivery and print gate pass**, then **Cancel** in the print window.
    - **Expected:** "Delivered to Bola Ade, (date), (time)". In **Handover**: Collected by "Bola Ade, 08039998888" and Collector "Someone else, approved by a manager".

**Pass if:** the check-in signer is offered, someone else needs a manager, the manager's form catches every mistake and keeps the entries, and the approved person is the one who signs.

## G. Someone else's step (technician)

Use job **LSR-545ST** before section E, or any job at Delivery.

42. Sign in as the **Technician**. Open job **LSR-545ST**.
    - **Expected:** the yellow banner "Waiting for Chidi Eze (Service advisor). You can view this step but only the service advisor can update it." The cards **Work done**, **Declined, recommended for next visit**, **Your belongings** (each item reads "To return", no tick boxes), **Collected by** (names only, no choices) and **Reasons for late delivery** (greyed out) show. There is no signature box and no **Complete delivery and print gate pass** button.

**Pass if:** the technician can see the handover but cannot change anything.

## H. A delivered job, at every size

43. Sign in as the **Service advisor**. Open job **LSR-547ST**.
    - **Expected:** the heading **Closed job**, the green panel "Delivered to Adaeze Okafor, (date), (time)", the **Gate pass** card with a number and **Print gate pass**, "Follow-up call scheduled for (date).", **Handover**, **Work done**, **Declined, recommended for next visit** ("The customer did not decline any recommended work.") and the **Invoice** card with **Paid**. Nothing can be edited.
44. Make the browser phone size (390 wide). Scroll through the page.
    - **Expected:** everything fits the width; no sideways scrolling; the step circles show as "Step 8 of 8" style progress; the cards are one under another.
45. Make it tablet size (768), then 1024 wide, then full size.
    - **Expected:** no sideways scrolling at any size; at full size the cards sit two side by side.

**Pass if:** the delivered job is read only and readable at every size.

## I. The follow-up call

46. Sign in as an administrator. In the address bar, add `/psf` after the site address and press **Enter**. In **Job no.** type the job number of **LSR-547ST** and click **Open**.
    - **Expected:** the job's follow-up page. In the row of details: **Delivered** (date), **Call due** (two days after delivery, for example "29 Nov 2026"), **Follow-up date** "Not provided" (nobody has called yet).

**Pass if:** the call due date matches the date on the job's delivered summary.

## J. Money and dates

47. Check every amount you saw in sections A, D and H.
    - **Expected:** each has the ₦ sign, commas for thousands and two decimals, for example ₦12,500.00, lined up on the right in lists. No amount shows as "NaN" or without ₦.
48. Check every date and time.
    - **Expected:** day, short month and year, then a 24-hour time, for example "28 Nov 2026, 15:20". The follow-up date has no time. No date shows as numbers with dashes or with a "T" in it.

**Pass if:** money and dates follow the formats above everywhere.

## Always report

Report any of these, wherever you see them:
- emojis or odd symbols (ticks, arrows, stars typed as text);
- the words "undefined", "null" or "NaN";
- codes in capitals with underscores, for example CHECK_IN_SIGNER, BELONGINGS_NOTE or DELIVER;
- garbled characters, for example "â‚¦" instead of ₦, or a black diamond with a question mark;
- browser pop-ups (grey system boxes) instead of the app's own windows (the print window in sections D, E and F is expected);
- buttons that do nothing when clicked;
- grey buttons with no sentence saying why;
- anything you typed that disappears after an error;
- the page scrolling sideways.

## Not in this phase

- The customer signs on the screen with a finger or the mouse; there is no keyboard way to sign. Everything else works from the keyboard.
- **Print gate pass** prints the existing simple gate pass. Phase 11 rebuilds the printed job card and the A6 gate pass layout.
- If a job reaches Delivery and is then found unpaid (only possible on older jobs), a red box names the balance with **Open the invoice in Billing** and the main button stays grey. The demo data has no such job; the payment rule itself is tested in phase 8, section E.
- PDI jobs keep their own screens and are not delivered from this step.
- The follow-up call is scheduled, but the follow-up worklist is not yet sorted by the due date. The calls themselves are recorded on the existing follow-up screen.
- The workshop board (phase 10) and the printed job card (phase 11) are not part of this phase.

## Results table

| Step | Pass or Fail | What I saw |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |
| 11 | | |
| 12 | | |
| 13 | | |
| 14 | | |
| 15 | | |
| 16 | | |
| 17 | | |
| 18 | | |
| 19 | | |
| 20 | | |
| 21 | | |
| 22 | | |
| 23 | | |
| 24 | | |
| 25 | | |
| 26 | | |
| 27 | | |
| 28 | | |
| 29 | | |
| 30 | | |
| 31 | | |
| 32 | | |
| 33 | | |
| 34 | | |
| 35 | | |
| 36 | | |
| 37 | | |
| 38 | | |
| 39 | | |
| 40 | | |
| 41 | | |
| 42 | | |
| 43 | | |
| 44 | | |
| 45 | | |
| 46 | | |
| 47 | | |
| 48 | | |

## How to report a problem

For each problem, send:
- the phase and step number, for example "Phase 9, step 19";
- the job number and plate;
- the role you were signed in as;
- what you expected (copy the **Expected** line);
- what happened instead;
- a screenshot: press **Windows + Shift + S**, drag over the screen, and paste it into your message.
