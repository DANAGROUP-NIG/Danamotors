# Job card revamp, phase 8: manual test guide

## What changed in this phase

Step 7 of a job card, **Billing**, is rebuilt. After the quality check passes, the service advisor presses **Mark ready and notify customer** and records how they told the customer (phone call or SMS). That starts the storage counter: storage is free for 48 hours, then ₦2,000.00 per day is proposed on the invoice, never added without someone saying yes. The page shows three cards: **Customer notified** (with **Send again** and a **Vehicle washed** tick box), **Estimated and actual** (what the customer approved against what is charged), and **Invoice** (customer total, advance paid, balance due and the payment status). Billing staff create the invoice from the job, the cashier records the payment, and a service manager can approve delivery on credit. **Send to delivery** stays grey until the balance is paid, credit is approved, or the customer has nothing to pay.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000063.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery, shown as numbered circles near the top of the job (on a phone, as "Step 7 of 8: Billing" with a bar).
- **Notice**: a record that the customer was told the vehicle is ready, by phone call or SMS. The app does not send SMS itself yet: the advisor sends it from the workshop phone and records it here.
- **Storage charge**: terms clause 3. The customer has 48 hours to collect after the first notice; after that, ₦2,000.00 per full day is proposed on the invoice.
- **Estimated and actual**: the table from the paper job card. "Estimated" is what the customer approved; "Actual" is what is being charged. Both are before VAT.
- **Advance**: money the customer paid before work started. It is taken off the invoice.
- **Delivery on credit**: a manager lets the vehicle go before the balance is paid, for customers with agreed credit terms.
- **Bar**: the strip fixed at the bottom of the job page with the main buttons. When the main button is grey, a sentence beside it says why.
- **Header**: the top of the job, with the line **With: (name and role) since (date)**, which says who holds the job now.
- **Toast**: the short green (or red) message that appears for a few seconds at the top right of the screen.
- **Job file**: the button at the top of the job that opens a side panel with tabs, including **Activity** (the job's history).

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com (Chidi Eze) |
| Billing officer (creates the invoice, records payments) | financemgr@kiamotors.com | Joseph Stan | superadmin@danamotors.com (Super Admin; the developer's data has no billing officer) |
| Service manager (approves credit) | servicemanager@kiamotors.com | Mark Folorusho | servicemanager@kiamotors.com (Mr Mark) |
| Technician (for the read-only check) | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com (Tunde Akinyemi) |

On the test site the service advisor's role may also be allowed to create invoices. If **Create invoice** is not grey for the advisor there, that comes from the role settings, not this phase.

**Demo jobs.** All are at **Main Branch**, customer names are fictional. To open one, use **Job Cards** in the left menu, type the plate in the search box, then click the three-dot **Actions** button at the end of the row and **View details**. The job numbers are the ones on the test site; on the developer's computer they are in brackets.

| Plate | Job number | Where it is | Used in section |
|---|---|---|---|
| LSR-540ST | 2026000063 (2026000045) | Billing. Quality check passed; not marked ready yet | A, B, H |
| LSR-541ST | 2026000064 (2026000046) | Billing. Marked ready about four days before the demo data was loaded (phone call, then an SMS reminder), washed. Storage days are due | C, D, G |
| LSR-542ST | 2026000065 (2026000047) | Billing. Invoiced; the ₦10,000.00 advance is taken off; a balance is left | E |
| LSR-543ST | 2026000066 (2026000048) | Billing. Invoiced and unpaid, for a credit approval | F |

Sections A to F change their jobs. After testing, ask the developer to reload the demo data before you test them again.

The service line shows the service type's name as written in the service type list, **PAID SERVICE**, in capitals. That is the master data, not a code.

**Tablet or phone size (Chrome).** Press **F12**, click the device toolbar icon (a phone and tablet, top left of the panel), then type **768** in the width box for a tablet, or choose **iPhone 12 Pro** (390 wide) for a phone. Press **F12** again to go back.

**Settings to check first.** Sign in as an administrator, click **Settings** in the left menu, then **Company & Branch Settings**. Under **Branch rules**, choose **Branch: Main Branch** and find the group **Storage charge**. Expected: **Free storage (hours)** shows 48 and **Storage charge per day (₦)** shows 2000. If not, enter those values and click **Save branch rules**. Do not change anything else.

## A. Mark the vehicle ready and tell the customer (advisor, desktop)

1. Sign in as the **Service advisor** on a normal desktop window.
   - **Expected:** the dashboard opens with your name, Chidi Eze, at the top right.
2. Open job **LSR-540ST** (Job Cards, search the plate, **Actions**, **View details**).
   - **Expected:** the header shows the green badge **QC passed** and "With: Chidi Eze (Service advisor) since (date and time)". Circles 1 to 6 are ticked, circle 7 **Billing** is current. The step heading reads **Step 7 of 8: Billing** with "Waiting for the advisor to mark the vehicle ready" under it.
3. Look at the three cards under the step heading.
   - **Expected:** **Customer notified**: "The customer has not been told yet. Marking the vehicle ready records the notice.", a grey box "Storage charge of ₦2,000.00 per day starts 48 hours after the customer is told the vehicle is ready (terms clause 3).", and a **Vehicle washed** tick box. **Estimated and actual**: a table with the columns Item, Estimated, Actual, Difference and the rows Parts, Oil, Labour, Service charge and Total, all amounts with ₦ and lined up on the right. **Invoice**: "The invoice amounts appear here once the vehicle is marked ready.", Payment status **Not invoiced**, and a grey **Create invoice** button with "Mark the vehicle ready before creating the invoice." under it.
4. Look at the Difference column.
   - **Expected:** every row shows ₦0.00 (the parts, labour and service charge used match what the customer approved). A row that cost more would show a plus sign, for example "+₦8,500.00", in red; less would show a minus sign in green.
5. Look at the bar at the bottom.
   - **Expected:** a dark **Mark ready and notify customer** button.
6. Click **Mark ready and notify customer**.
   - **Expected:** a window titled **Mark ready and notify customer** with "The vehicle is marked ready for collection. Record how you told the customer: this starts the storage counter.", "Customer phone: (the customer's number)", two choices **Phone call** and **SMS**, a **Note (optional)** box with "For example, when the customer will collect." under it, and the buttons **Cancel** and **Mark ready and save notice**.
7. Click **Mark ready and save notice** without choosing anything.
   - **Expected:** under the choices, in red: "Choose how you told the customer: phone call or SMS." The window stays open.
8. Click **SMS**.
   - **Expected:** a grey box appears: "The app does not send SMS yet. Send the message from the workshop phone, then record it here."
9. Click **Phone call** instead, and type in **Note (optional)**: `Customer will collect tomorrow morning.`
   - **Expected:** the SMS box disappears; Phone call is selected.
10. Click **Mark ready and save notice**.
    - **Expected:** the button shows a spinner and "Saving", then the window closes and a green toast says "Job 2026000063 marked ready. The customer notice is recorded." The header badge changes to **Ready** and "With: Billing officer since (now)".
11. Look at **Customer notified**.
    - **Expected:** a green box "Phone call to (number) on (today's date), (time)", for example "Phone call to +2348099900105 on 27 Nov 2026, 16:31", with "By Chidi Eze. Customer will collect tomorrow morning." and a **Send again** button. The grey box now reads "Storage charge of ₦2,000.00 per day starts after (the date and time 48 hours later) (terms clause 3)."
12. Look at the bar.
    - **Expected:** a grey **Send to delivery** button with "Create the invoice before sending the job to delivery." beside it.
13. Look at the **Invoice** card.
    - **Expected:** "Not created yet. The amounts are what the invoice will show.", then Customer total, Advance paid ₦10,000.00 and a red **Balance due** row (total less the advance), all with ₦ and lined up on the right. The **Create invoice** button is grey with "Only billing staff can create the invoice." under it (on the test site it may be dark for the advisor, see "Test accounts").
14. Click the words **Vehicle washed**.
    - **Expected:** the box is ticked at once with a small spinner, then a green toast "Vehicle washed recorded." Your name and the time appear at the right of the row.

**Pass if:** the ready window will not save without a choice, the notice shows the right time in Lagos time, the storage line moves to 48 hours later, the header says Ready and Billing officer, and Send to delivery is grey with its reason.

## B. Someone else's step (technician) and no access

15. Sign out, and sign in as the **Technician**. Open job **LSR-540ST**.
    - **Expected:** the same three cards and figures, but no **Send again**, no **Mark ready** or **Send to delivery** button in the bar, no **Create invoice** or **Record payment** buttons, and the **Vehicle washed** box is greyed out (it cannot be clicked).
16. Sign out.

**Pass if:** the technician can see the billing but cannot change anything.

## C. Create the invoice with a storage charge (billing officer)

17. Sign in as the **Billing officer**. Open job **LSR-541ST**.
    - **Expected:** the header badge **Ready**. **Customer notified** shows "SMS sent to (number) on (date), (time)" with **Send again**, a link "Earlier notices (1)", and the grey box ending "N days so far: ₦X will be proposed on the invoice." (for example "2 days so far: ₦4,000.00 will be proposed on the invoice."). **Vehicle washed** is ticked with a name and time.
18. Click **Earlier notices (1)**.
    - **Expected:** a line "Phone call to (number) on (date about four days ago), (time), by Chidi Eze. Told the customer the vehicle is ready for collection."
19. Click **Create invoice** in the **Invoice** card.
    - **Expected:** a window **Create invoice** with "Invoice for job 2026000064. Advances already paid are applied.", the invoice lines (Front brake pads set, Engine oil 5W-30, 4 litres, Replace front brake pads, PAID SERVICE) each with its amount, then Parts, Labour, Service charge, VAT, Round-off and **Total before storage**. Below that, a yellow box "Storage charge proposed: ₦X (N days at ₦2,000.00 per day after (date), terms clause 3)." with two choices **Add to the invoice** and **Remove, with a reason**, and the line "Need a discount? Use Billing, Create job bill."
20. Click **Create invoice** inside the window without choosing.
    - **Expected:** in red: "Accept the storage charge, or remove it with a reason." Nothing is created.
21. Click **Remove, with a reason**, then click **Create invoice**.
    - **Expected:** a box **Reason for removing the storage charge** with a red star, and in red: "Give the reason for removing the storage charge."
22. Type the reason `Customer was abroad. Waived by the service manager.`
    - **Expected:** the red message goes away when you click Create invoice in the next step.
23. Press **Esc**, then click on the grey area outside the window.
    - **Expected:** the window stays open and your reason is still there.
24. Click **Create invoice**.
    - **Expected:** the button shows "Creating invoice", the window closes, and a green toast says "Invoice (number) created." The **Invoice** card now reads "Invoice (number), (date), (time)", with Customer total, Advance paid ₦10,000.00, Balance due, Payment status **Unpaid** (amber), and the buttons **View invoice** and **Record payment**. The storage line now ends "Counted to the invoice: N days, ₦X."
25. Click **View invoice**.
    - **Expected:** the invoice page opens. There is no storage line on it (you removed it). Go back with the browser's back button.
26. Sign out, sign in as the **Service advisor** and open **LSR-541ST**.
    - **Expected:** "With: Chidi Eze (Service advisor)". The bar shows a grey **Send to delivery** with "Balance of ₦(the balance) not yet paid."

To test **Add to the invoice** instead, ask the developer to reload the demo data and repeat 17 to 24 choosing **Add to the invoice**. Expected then: a note "The storage charge is added as a service line, with VAT, when the invoice is created.", and the invoice page shows a line "Storage charge, N days at ₦2,000.00 per day (terms clause 3)".

**Pass if:** the invoice cannot be created without a storage answer, a removal needs a reason, the invoice appears with the advance taken off, and Send to delivery names the exact balance.

## D. Send again, keyboard only, and a lost connection (advisor, 1024 wide)

27. Still as the **Service advisor** on **LSR-541ST**, make the browser 1024 wide (F12, device toolbar, width 1024).
    - **Expected:** the cards sit two side by side, the Invoice card below; nothing runs off the right edge and there is no sideways scrolling.
28. Press **Tab** until **Send again** is highlighted with a visible outline, then press **Enter**.
    - **Expected:** a window **Record another notice**: "Record that you told the customer again. The storage counter keeps the first notice."
29. Press **Esc**.
    - **Expected:** the window stays open.
30. Press **Tab** to reach **SMS** and press **Space**, then **Tab** to **Note (optional)** and type `Second reminder.`
    - **Expected:** SMS is selected and the note is typed.
31. Turn the connection off: in Chrome press **F12**, open the **Network** tab and choose **Offline** (or turn Wi-Fi off). Click **Save notice**.
    - **Expected:** a red box in the window: "The notice could not be saved. Check your connection and try again. Your entries are kept." SMS is still selected and "Second reminder." is still in the box.
32. Turn the connection back on (**No throttling**, or Wi-Fi on) and click **Save notice**.
    - **Expected:** the window closes, a green toast "Customer notice recorded." The green box now shows "SMS sent to (number) on (now)". The storage line has not changed (it counts from the first notice).
33. Press **Tab** to the **Cancel** button in a new Send again window and press **Enter**.
    - **Expected:** the window closes without saving.

**Pass if:** everything works with the keyboard, Esc never throws away a form, and nothing typed is lost when the connection drops.

## E. Record the payment and send to delivery (billing officer, then advisor)

34. Sign in as the **Billing officer**. Open job **LSR-542ST**.
    - **Expected:** **Invoice** card: "Invoice (number), (date), (time)", Customer total ₦83,850.00 (₦104,850.00 on the developer's computer), Advance paid ₦10,000.00, Balance due ₦73,850.00 (₦94,850.00) in large red, Payment status **Unpaid**.
35. Click **Record payment**.
    - **Expected:** the existing **Payment receipt** window opens with the customer's name, the invoice in the list with 73850 filled in (94850 on the developer's computer), and **Amount received (NGN)** the same.
36. Set **Mode** to **Cash** and click **Save receipt**.
    - **Expected:** the window closes, a green toast "Payment receipt created". The Invoice card shows Payments received ₦73,850.00 (₦94,850.00), Balance due ₦0.00, Payment status **Paid** (green), a grey **Record payment** with "The invoice is paid in full." under it.
37. Sign out, sign in as the **Service advisor** and open **LSR-542ST**.
    - **Expected:** the bar shows a dark **Send to delivery** with "The job goes to the Delivery step with the service advisor." under it.
38. Click **Send to delivery**.
    - **Expected:** a green toast "Job 2026000065 sent to Chidi Eze". The step heading reads **Step 8 of 8: Delivery**, circle 7 is ticked, and the header reads "With: Chidi Eze (Service advisor) since (now)". The page shows the existing **Deliver the vehicle** form and the Invoice card (read only, Paid).
39. Click **Job file**, then the **Activity** tab.
    - **Expected:** at the top, "Moved from Billing to Delivery", then "Step owner changed (Billing)" (the invoice), then "Mark ready and notify customer (Billing)", each with a name and time. Close the panel.
40. Click the bell at the top right.
    - **Expected:** a notice "Job sent to you" for this job, step Delivery (it may also list the earlier ones).

**Pass if:** the payment turns the badge green and Paid, Send to delivery only works after that, and the job reaches Delivery with the advisor named.

## F. Delivery on credit (service manager)

41. Sign in as the **Service manager**. Open job **LSR-543ST**.
    - **Expected:** the Invoice card with Balance due ₦73,850.00 (₦94,850.00 on the developer's computer), **Unpaid**, and a link **Approve delivery on credit**.
42. Click **Approve delivery on credit**.
    - **Expected:** a window **Approve delivery on credit**: "Job 2026000066 can go to delivery before the balance of ₦73,850.00 is paid. Approve only for customers with agreed credit terms.", a box **Reason for credit approval** with a red star.
43. Click **Approve delivery on credit** in the window without typing.
    - **Expected:** in red: "Enter why delivery on credit is approved."
44. Type `Lakeside fleet account on 30-day credit terms.` and click **Approve delivery on credit**.
    - **Expected:** the window closes, a green toast "Delivery on credit approved for job 2026000066." The Invoice card shows a green box "Credit approved by Mark Folorusho (Service manager), (date), (time)." Payment status stays **Unpaid**.
45. Sign out, sign in as the **Service advisor**, open **LSR-543ST**.
    - **Expected:** the same green credit line, and a dark **Send to delivery** in the bar (not grey), even though the balance is unpaid.

**Pass if:** the credit needs a reason, the screen names who approved it and when, and the job can then go to delivery unpaid.

## G. Tablet and phone sizes

46. As the **Service advisor**, open **LSR-541ST** at **768** wide (tablet).
    - **Expected:** the three cards stack one under another; the money columns stay lined up on the right; no sideways scrolling.
47. Choose **iPhone 12 Pro** (390 wide).
    - **Expected:** "Step 7 of 8: Billing" with a bar at the top of the step, the cards stacked, the Estimated and actual table fits or scrolls inside its own card only, the bar at the bottom shows the reason on one line and the full-width **Send to delivery** button. Nothing on the page scrolls sideways.
48. Return to the normal desktop size.

**Pass if:** every card is readable and usable at 768 and 390 wide, and only the table (if anything) scrolls sideways inside itself.

## H. Money and dates

49. On any of the jobs, look at every amount on the Billing step.
    - **Expected:** every amount starts with ₦ (never "N", "NGN" or a strange symbol) and has two decimals, for example ₦73,850.00. Amounts in tables line up on the right.
50. Look at every date and time.
    - **Expected:** day, short month, year and a 24-hour time, for example "27 Nov 2026, 16:31", in Lagos time.

**Pass if:** all money and dates follow that format everywhere on the step.

## Always report

Report any of these, wherever you see them:
- emojis or odd symbols (ticks, arrows, stars typed as text);
- the words "undefined", "null" or "NaN";
- codes in capitals with underscores, for example PHONE_CALL, NOT_INVOICED or SEND_TO_DELIVERY;
- garbled characters, for example "â‚¦" instead of ₦, or a black diamond with a question mark;
- browser pop-ups (grey system boxes) instead of the app's own windows;
- buttons that do nothing when clicked;
- grey buttons with no sentence saying why;
- anything you typed that disappears after an error;
- the page scrolling sideways.

## Not in this phase

- **Delivery** (step 8) still shows the old **Deliver the vehicle** form (delivery advisor, late reasons, remarks). Phase 9 replaces it with the hand-over screen: belongings, collector check, signature and gate pass.
- The app does not send SMS. Choosing SMS only records that the advisor sent one.
- Discounts are not on the Create invoice window; use **Billing, Create job bill** for a discounted bill.
- **Print** (job card and gate pass) is unchanged. Phase 11 rebuilds the printed job card and gate pass. There is no new print view in this phase.
- JC-S09 (LSR-519ST), an older demo job, may show at Billing with an unpaid invoice rather than at Delivery. That is the new rule (an invoiced job waits at Billing until it is paid), not a fault.
- The header's coloured badges for older steps and the workshop board are unchanged (phase 10).

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
| 49 | | |
| 50 | | |

## How to report a problem

For each problem, send:
- the phase and step number (for example "Phase 8, step 24");
- the job number;
- the role you were signed in as;
- what you expected (copy the **Expected** line);
- what happened instead;
- a screenshot: press **Windows + Shift + S**, select the area, and paste it into your message.
