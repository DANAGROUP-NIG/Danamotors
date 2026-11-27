# Job card revamp, phase 5: manual test guide

## What changed in this phase

Step 4 of a job card, **Estimate**, is now three parts: **Prepare**, **Customer approval** and **Advance and release**. The service advisor presses **Prepare estimate** and the system prices every item the technician found, using the catalogue prices, and splits them into what the customer pays and what warranty pays, with VAT and a suggested advance. The customer then approves or declines each item on a tablet and signs, or the advisor records an approval given on the phone; the customer signs that one at delivery. Declined items are kept as "Recommended, declined" and shown at the vehicle's next visit. If the customer declines everything, the system proposes the estimation charge (terms clause 4), which a manager can waive. Before work starts, a checklist shows the approval, the advance payment and the parts request that is sent to the store automatically, and **Release to workshop** passes the job to the technician.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000035.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery, shown as numbered circles near the top of the job.
- **Estimate**: the list of work and parts with prices that the customer approves before work starts. **Revision 1** is the first version.
- **Customer pays** and **Warranty**: who pays for each line. The warranty officer decided this in step 3. Warranty lines are never added to the customer's total.
- **VAT**: 7.5%, worked out on the customer's total.
- **Advance**: money the customer pays before work starts. The **cashier** (the person who records receipts) records it.
- **Estimation charge**: the fee in terms clause 4 when a customer declines all the work: the larger of ₦25,000.00 and 10% of the estimate total.
- **Waiver**: a manager agreeing not to charge the estimation charge.
- **Parts request**: a message to the store listing the approved parts, so the store can prepare them. It does not take parts out of stock.
- **Bar**: the strip fixed at the bottom of the job page with the main button. A grey main button has a sentence beside it saying why it cannot be pressed yet.
- **Header**: the top of the job, with the line **With: (name or role) since (date)**, which says who holds the job now.
- **Toast**: the short green (or red) message that appears at the top right for a few seconds.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com (Chidi Eze) |
| Cashier (billing officer) | financemgr@kiamotors.com | Joseph Stan | superadmin@danamotors.com (Super Admin) |
| Service manager | servicemanager@kiamotors.com | Mark Folorusho | servicemanager@kiamotors.com (Mr Mark) |
| Workshop manager | wm.lagos@danamotors.com | Rotimi Ajayi | wm.lagos@kiaamotors.com (Rotimi Ajayi) |
| Technician | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com (Tunde Akinyemi) |

**Demo jobs.** All are at **Main Branch** and at step 4, Estimate. Open **Job Cards** in the left menu, type the plate in the search box above the list, then click the three-dot **Actions** button at the end of the row and **View details**. The job numbers are the ones on the test site; on the developer's computer they are in brackets.

| Plate | Job number | Where it is | Used in section |
|---|---|---|---|
| KJA-530ST | 2026000052 (2026000035) | Nothing prepared yet. Brakes, AC (compressor and its labour on warranty) and the periodic service | A, B, E, I |
| LSR-531ST | 2026000053 (2026000036) | Estimate prepared as a draft (out of warranty) | C, G, H |
| LSR-532ST | 2026000054 (2026000037) | Estimate prepared and presented to the customer | D |
| KJA-533ST | 2026000055 (2026000038) | First free service with an AC repair on warranty, prepared | F |

The prices below are the test site's. On the developer's computer the brake pads are called "Front brake pads set" and cost ₦45,000.00, so the totals differ; those figures are in brackets. If an administrator has changed a price, follow what the screen shows and check the sums with a calculator.

Sections A to F change their jobs. After testing, ask the developer to reload the demo data before you test them again.

**Settings to check first.** Sign in as an administrator and open **Settings**, **Company and branches**, choose **Main Branch**. Under **Estimation charge** check **Minimum estimation charge (₦)** is **25000** and **Estimation charge, share of the estimate total (%)** is **10**. Under **Billing**, **VAT on labour and service (%)** is **7.5**. These are also the values used when nothing has been saved for the branch.

**Phone or tablet size (Chrome).** Press **F12**, click the device toolbar icon (a phone and tablet, top left of the panel), then choose a size at the top of the page: **iPhone 12 Pro** (390 wide) or type **768** or **1024** in the width box. Press **F12** again to go back.

**Offline (Chrome).** Press **F12**, open the **Network** tab, and change **No throttling** to **Offline**. Change it back to **No throttling** afterwards.

---

## A. Prepare the estimate (service advisor, desktop)

1. Sign in as the **service advisor** and open job **KJA-530ST**.
   Expected: the heading **Step 4 of 8: Estimate** with "Prepare the estimate" under it. A card **Estimate** says "The diagnosis has 7 items of work and parts. Prepare the estimate to price them from the catalogue. Who pays for each item comes from the warranty check." The bar shows **Prepare estimate**.
2. Click **Prepare estimate**.
   Expected: toast "Estimate prepared for job 2026000052". Three tabs appear: **Prepare** (dark), **Customer approval**, **Advance and release**. The card **Estimate, revision 1, draft** shows "Last saved:" with today's date and time.
3. Look at the section **Customer pays (6 items)**.
   Expected: PAID SERVICE ₦15,100.00, Replace front brake pads ₦15,000.00, Front brake pad set ₦24,000.00 (Front brake pads set ₦45,000.00), AC refrigerant R134a, 500 g ₦9,000.00, Periodic maintenance service ₦9,500.00, Engine oil 5W-30, 4 litres ₦27,500.00. Each row has a **Type** badge (Service, Labour, Part) and money is right-aligned.
4. Look at the section **Warranty (not charged to customer) (2 items)**.
   Expected: AC system check and refrigerant recharge ₦18,000.00 and AC compressor ₦480,000.00, on a light grey background, with the line "Items paid by warranty, goodwill or a campaign come from the warranty check. Ask the warranty officer to change who pays."
5. Look at **Estimate summary** on the right.
   Expected: Customer subtotal ₦100,100.00 (₦121,100.00), VAT (7.5%) ₦7,507.50 (₦9,082.50), **Customer total ₦107,607.50** (₦130,182.50), the largest number, "Warranty and other payers ₦498,000.00" with "Claimed from the manufacturer or paid by the campaign. Not charged to the customer.", **Suggested advance** with buttons **20%**, **30%**, **60%** (dark) and **Custom**, "Advance (60%) ₦64,564.50" (₦78,109.50), and "Estimated delivery" with the promised date and time.
6. Check with a calculator: 100,100 x 7.5% = 7,507.50, and 100,100 + 7,507.50 = 107,607.50.
   Expected: the screen matches.
7. Click **30%**.
   Expected: "Advance (30%) ₦32,282.25" (₦39,054.75). The card's top right now says "Not saved".
8. In the row **Engine oil 5W-30, 4 litres**, change the quantity box to **0**.
   Expected: under the box in red "Quantity must be more than 0", and the row's amount shows "Check the quantity".
9. Change it to **1.005**.
   Expected: "Enter the quantity as a number with at most 2 decimal places".
10. Change it back to **1**.
    Expected: the red message disappears.
11. Hover over the bin icon at the end of the **Engine oil** row.
    Expected: tooltip "Remove Engine oil 5W-30, 4 litres". Do not click it. The PAID SERVICE row has no bin (the service charge comes from the service type).
12. Click **Add labour** under the Customer pays section, type **brake**, and pick **Replace front brake pads**.
    Expected: a red line "Replace front brake pads is already on the estimate. Change its quantity instead." Nothing is added.
13. Click **Save draft** in the bar.
    Expected: toast "Estimate saved for job 2026000052". The card says "Last saved:" with the new time.
14. Click **Print estimate** in the bar.
    Expected: the estimate print page opens with the sections **Customer pays** and **Warranty (not charged to customer)**, then Customer subtotal, VAT (7.5%), Customer total and the warranty total. Use the browser's back button to return.
15. Click **Present to customer**.
    Expected: toast "Estimate ready for the customer. Hand the tablet to the customer." The **Customer approval** tab is now dark and the page shows **Your estimate for KJA-530ST**.

**Pass if:** the lines and prices match, VAT and totals add up, the advance changes with the percentage, wrong quantities are named, and the estimate is presented.

## B. The customer approves item by item (tablet size)

Keep job KJA-530ST open from section A. Switch the browser to 768 wide (see "Before you start").

16. Read the top of the page.
    Expected: "Your estimate for KJA-530ST" and "Approve the work you want us to do. You can decline any item." The lines are grouped under the customer's requests in numbered boxes: 1 "Noise from front left wheel when braking", 2 "AC not cooling well", 3 "Periodic service (5,000 km)", and a box **Service** with PAID SERVICE. Only customer-pay lines have prices and **Approve** / **Decline** buttons.
17. Look below the lines.
    Expected: a purple note "Covered by warranty: AC system check and refrigerant recharge, AC compressor. No charge to you." and a green box "You approve ₦107,607.50 including VAT" (₦130,182.50).
18. In the row **AC refrigerant R134a, 500 g**, click **Decline**.
    Expected: the row turns grey and **Decline** is highlighted. The green box changes to **₦97,932.50** (₦120,507.50): ₦9,000.00 plus ₦675.00 VAT less. A line "Declined items will be reminded at your next visit." appears.
19. Under **Who is signing**, click **Representative**, then click **Approve and sign** without filling anything.
    Expected, in red: "Enter the representative's name", "Enter the representative's phone number", "Ask the customer to sign in the box" and "The customer must accept the estimate terms". Nothing is saved.
20. Type **Emeka Okafor** in **Name** and **12345** in **Phone**, then click **Approve and sign**.
    Expected: "Enter a Nigerian mobile number, for example 0803 555 0142".
21. Click **Owner**.
    Expected: "Signing as Adaeze Okafor". The name and phone boxes go away.
22. Tick **I approve the work above at the prices shown and accept the estimate terms and conditions.**
23. Sign in the white box with the mouse (or a finger on a tablet).
24. Click **Approve and sign**.
    Expected: the button says "Saving the approval" for a moment, then toast "Estimate approved and signed for job 2026000052". The **Advance and release** tab is dark.
25. Read the card **Before work starts**.
    Expected: three rows. 1 (green tick): "Customer approved 7 items", "Signed by Adaeze Okafor, (date and time). 1 declined, kept as recommended work." 2 (yellow): "Advance not received", "Suggested ₦29,379.75 (30%). Any positive amount is accepted." (₦36,152.25) 3 (green tick): "Parts request sent to store automatically: 3 items" and "Chukwuemeka Odu notified" with the time (on the developer's computer the general store manager, Amina Bello).
26. Read the card **Advance**.
    Expected: Approved customer total ₦97,932.50 (₦120,507.50), Suggested advance (30%) ₦29,379.75 (₦36,152.25), **Received ₦0.00** in red, Balance at billing ₦97,932.50 (₦120,507.50).

**Pass if:** the total drops by exactly the declined item plus its VAT, each mistake is named, the signature saves, and the parts request lists 3 items (the declined refrigerant is not included).

## C. Phone approval (desktop)

27. Open job **LSR-531ST**.
    Expected: **Estimate, revision 1, draft** with Customer total **₦97,932.50**: subtotal ₦91,100.00 and VAT ₦6,832.50 (₦120,507.50: ₦112,100.00 and ₦8,407.50).
28. Click **Record phone approval** in the bar.
    Expected: a dialog **Record phone approval** with the blue line "The customer will sign at delivery." **Approved by** is filled with the customer's name, **Date and time of the call** with now ("Lagos time." under it), and every item ticked under **Items approved**.
29. Click outside the dialog, on the grey area.
    Expected: the dialog stays open.
30. Press **Esc**.
    Expected: the dialog stays open.
31. Clear **Approved by**, type **12345** in **Phone number**, and click **Save phone approval**.
    Expected: "Enter who approved on the phone" and "Enter a Nigerian mobile number, for example 0803 555 0142" under the fields.
32. Set **Date and time of the call** to tomorrow and click **Save phone approval**.
    Expected: "The date and time of the call cannot be in the future" (with the other messages).
33. Type **Ngozi Lakeside** in **Approved by**, **0803 555 0142** in **Phone number**, set the date and time back to now, and untick **Engine oil 5W-30, 4 litres**.
34. Click **Save phone approval**.
    Expected: toast "Phone approval saved for job 2026000053. The customer signs at delivery." The dialog closes and **Advance and release** opens.
35. Read the first row of **Before work starts**.
    Expected: "Customer approved 4 items by phone", "Ngozi Lakeside, 08035550142, (date and time). Recorded by Chidi Eze. Customer to sign at delivery. 1 declined."
36. Click the **Prepare** tab.
    Expected: the estimate is read-only now ("Estimate, revision 1, partly approved"), with a **Customer** column: **Approved** on four lines and the grey badge **Recommended, declined** on Engine oil. Under the totals: "Approved by phone by Ngozi Lakeside, 08035550142, (date and time). Recorded by Chidi Eze." and a yellow badge **Customer to sign at delivery**.

**Pass if:** the dialog never closes by accident, each mistake is named, and the job shows the phone approval with "Customer to sign at delivery".

## D. The customer declines everything (estimation charge and waiver)

37. Open job **LSR-532ST** at tablet size (768).
    Expected: **Your estimate for LSR-532ST** with three lines: PAID SERVICE ₦15,100.00, Replace front brake pads ₦15,000.00, Front brake pad set ₦24,000.00 (Front brake pads set ₦45,000.00), and "You approve ₦58,157.50 including VAT" (₦80,732.50).
38. Click **Decline** on all three lines.
    Expected: "You approve ₦0.00 including VAT".
39. Tick the terms box, sign, and click **Approve and sign**.
    Expected: toast "The customer declined all work on job 2026000054". A card **The customer declined all work** with the yellow message "The customer declined all work. An estimation charge of ₦25,000.00 applies (terms clause 4)." and "The charge is the larger of ₦25,000.00 and 10% of the estimate total. A waiver needs manager approval and a reason." Two buttons: **Add estimation charge** and **Request waiver**.
40. Look at the bar.
    Expected: **Send to billing** is grey with "Add the estimation charge, or request a waiver." beside it. There is no **Release to workshop**.
41. Click **Request waiver**, type **no** as the reason, and click **Send waiver request**.
    Expected: "Write the reason for the waiver (at least 5 characters)". Click outside the dialog: it stays open.
42. Change the reason to **Long-standing fleet customer** and click **Send waiver request**.
    Expected: toast "Waiver requested for job 2026000054. The managers have been notified." The card says "Waiver requested by Chidi Eze, (date and time). Reason: Long-standing fleet customer" and "Waiting for a service manager or workshop manager to approve or decline the waiver." The bar says "A manager has not answered the waiver request yet."
43. Sign out and sign in as the **service manager**. Click the bell icon at the top.
    Expected: a notice "Estimation charge waiver requested: 2026000054, ...".
44. Open job **LSR-532ST**.
    Expected: the banner "Waiting for Chidi Eze (Service advisor). You can view this step but only the service advisor can update it.", the estimate read-only (all three lines **Recommended, declined**), and the card with **Approve waiver** and **Decline waiver**.
45. Click **Decline waiver**, then **Decline waiver** in the dialog without a note.
    Expected: "Write why the waiver is declined (at least 5 characters)".
46. Type **The charge applies to fleet customers too** and click **Decline waiver**.
    Expected: toast "Waiver declined for job 2026000054. The estimation charge stays on the bill."
47. Sign in as the **service advisor** again and open job **LSR-532ST**.
    Expected: "Estimation charge ₦25,000.00 added by Chidi Eze, (date and time)." and "Waiver declined by (manager's name), (date and time). Note: The charge applies to fleet customers too". **Send to billing** is now dark.
48. Click **Send to billing**.
    Expected: the stepper moves to **7 Billing** ("Step 7 of 8: Billing"). Repair and Quality check are not needed.
49. Sign in as the **cashier** (or the billing officer) and open **Billing**, **Create job bill** for job 2026000054 (or click **Create job bill** on the job).
    Expected: the bill has one line, "Estimation charge (terms clause 4)", ₦25,000.00.

**Pass if:** the charge is proposed with the right amount, the waiver needs a reason and a manager's decision, and the bill has only the estimation charge.

## E. Advance and release (job from B)

50. As the **service advisor**, open job **KJA-530ST**.
    Expected: **Advance and release**. In the bar, **Release to workshop** is grey with "Ask the cashier to record the advance. Cashier on duty: Joseph Stan." (on the developer's computer: Super Admin), and a button **Notify cashier**.
51. Click **Notify cashier**.
    Expected: toast "Notice sent to Joseph Stan".
52. Sign out and sign in as the **cashier**. Click the bell icon.
    Expected: a notice "Advance payment needed: 2026000052, Adaeze Okafor, KJA-530ST".
53. Open job **KJA-530ST** and, in the **Advance** card, click **Receive advance**.
    Expected: the dialog **Advance payment receipt** with "Advance for job 2026000052. Confirm payment has been received before saving."
54. Type **50000** in **Amount received (NGN)**, choose **Cash** in **Mode**, then click outside the dialog.
    Expected: the dialog stays open and 50000 is still there.
55. Click **Save receipt**.
    Expected: "Advance received and reserved for job 2026000052."
56. Sign in as the **service advisor** again and open job **KJA-530ST**.
    Expected: all three rows of **Before work starts** have green ticks; row 2 reads "Advance received: ₦50,000.00" and "By cash, receipt (number), recorded by Joseph Stan, (date and time)." The **Advance** card shows Received ₦50,000.00 in green and Balance at billing ₦47,932.50 (₦70,507.50). **Release to workshop** is dark with "Tunde Akinyemi will be notified." under it.
57. Click **Release to workshop**.
    Expected: the stepper moves to **5 Repair**. The header says "With: Tunde Akinyemi (Technician) since (now)".
58. Sign in as the **technician** and click the bell.
    Expected: a new notice about job 2026000052 telling the technician the job is theirs.
59. Open the job, click **Job file** in the header, then the **Activity** tab.
    Expected: entries for the steps, the newest "Release to workshop" by Chidi Eze.
60. As the store person (on the test site the store officer of Main Branch), click the bell.
    Expected: one notice "Parts requested: 2026000052, ...". Not two.

**Pass if:** release is blocked until the advance is recorded, the cashier's name is shown, the cashier is notified, and release passes the job to the technician.

## F. Free service with a warranty repair (no advance needed)

61. Open job **KJA-533ST** as the **service advisor**.
    Expected: **Customer pays (1 item)** with FIRST SERVICE ₦0.00, and **Warranty** with AC system check and refrigerant recharge ₦18,000.00 and AC compressor ₦480,000.00. Customer total ₦0.00.
62. Click **Present to customer**.
    Expected: the customer screen shows a box **Service** with FIRST SERVICE ₦0.00, the note "Covered by warranty: AC system check and refrigerant recharge, AC compressor. No charge to you." and "You approve ₦0.00 including VAT".
63. Tick the terms box, sign and click **Approve and sign**.
    Expected: row 2 of **Before work starts** reads "Advance not required: Warranty only" with "Warranty covers all approved work. The customer has nothing to pay." **Release to workshop** is dark.

**Pass if:** no advance is asked for and release is possible straight away.

## G. Someone else's step, and permission denied

64. Sign in as the **workshop manager** and open job **LSR-531ST**.
    Expected: the banner "Waiting for Chidi Eze (Service advisor). You can view this step but only the service advisor can update it." The estimate is read-only ("Estimate, revision 1, partly approved"), with no **Present to customer**, no quantity boxes and no bin icons.
65. Sign in as the **technician** and open job **LSR-531ST**.
    Expected: the same banner and the card "You do not have access to estimates. The service advisor prepares the estimate, takes the customer's approval and releases the job to the workshop." No prices are shown.

**Pass if:** only the service advisor can change the estimate, and staff without estimate access see the reason instead of prices.

## H. Loading, offline and phone size

66. As the **service advisor**, open job **LSR-531ST** with Chrome set to **Offline** (see "Before you start") and reload.
    Expected: the app's error panel "Could not load job ..." with **Try again**. Set Chrome back to **No throttling** and click **Try again**: the job loads.
67. Before section F (or after the demo data is reloaded), open job **KJA-533ST**, set Chrome to **Offline**, change the quantity of **AC compressor** to **2** and click **Save draft**.
    Expected: in red under the table "The estimate was not saved. Your changes are still here. Check your connection and save again." The changed quantity is still there. Set Chrome back to **No throttling** and click **Save draft**: toast "Estimate saved for job 2026000055". Then change the quantity back to **1** and click **Save draft** again.
68. Set the browser to **iPhone 12 Pro** (390 wide) and open job **LSR-531ST**.
    Expected: no sideways scrolling. The tabs show icons, with only the current part's name ("Advance and release"). The bar shows **More** and **Notify cashier** on the first row, the reason under them, and the full-width grey **Release to workshop** fully above the bottom menu.
69. Set the width to **1024** and look again.
    Expected: the checklist and the Advance card side by side or one above the other, nothing cut off, no sideways scrolling.

**Pass if:** the page never loses what was typed when offline, and nothing is cut off or scrolls sideways on a phone or tablet.

## I. Keyboard only, and next visit

70. During section D, at step 41, open **Request waiver** using only the keyboard: press **Tab** until the button is outlined, then **Enter**.
    Expected: the dialog opens with the cursor in **Reason for the waiver**. **Tab** moves to **Cancel** and **Send waiver request**; the focused item has a visible outline. **Esc** does not close it; **Cancel** with **Enter** does.
71. On the customer screen of a presented estimate, press **Tab** to reach **Approve** and **Decline** of a line and press **Enter** on **Decline**.
    Expected: the line turns grey and the total updates.
72. Open job **KJA-530ST**, click **Job file**, then **Visit history**.
    Expected: a card **Recommended, declined** with "The customer has not declined any recommended work on earlier visits." (this visit's own declined item is not an earlier visit). When the vehicle comes back, check-in **Details** on the new job shows the card **Recommended, declined** with "AC refrigerant R134a, 500 g", ₦9,000.00, **Job 2026000052** and the date, and the Visit history tab shows the same card. Ask the developer to open a new job for KJA-530ST if you want to see it now.

**Pass if:** everything works without a mouse and declined work is offered again at the next visit.

---

## Always report

- Emojis or odd symbols (boxes, question marks, ticks typed as text).
- "undefined", "null" or "NaN" anywhere.
- Codes in capitals with underscores, for example ALL_DECLINED or WAIVER_REQUESTED.
- Garbled characters, for example "â‚¦" instead of ₦.
- Browser pop-ups (the grey browser boxes with OK and Cancel).
- Buttons that do nothing when clicked.
- Grey (disabled) buttons without a reason next to them.
- Lost input after an error or after clicking outside a dialog.
- Sideways scrolling on any screen size.
- Money without the ₦ sign or without two decimals, and dates not like "27 Nov 2026, 10:36".

## Not in this phase

- **Repair** (step 5) is still the older screen (Request part, Service transactions, labour). Phase 6 replaces it, with the technician's phone view and the supplementary estimate for new findings.
- The store does not yet see a list of parts requests on its own screen; it gets the notice. Parts collection with the technician's signature comes in phase 6.
- The customer's signature for a phone approval is collected at delivery in phase 9. Until then "Customer to sign at delivery" stays on the job.
- **Billing** and **Delivery** are still the older screens (phases 8 and 9). A job whose waiver was approved is closed with **More**, **Cancel job** (button **Close job without charge**) until phase 9 adds a delivery without a bill.
- The printed job card and gate pass are phase 11.

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
| 51 | | |
| 52 | | |
| 53 | | |
| 54 | | |
| 55 | | |
| 56 | | |
| 57 | | |
| 58 | | |
| 59 | | |
| 60 | | |
| 61 | | |
| 62 | | |
| 63 | | |
| 64 | | |
| 65 | | |
| 66 | | |
| 67 | | |
| 68 | | |
| 69 | | |
| 70 | | |
| 71 | | |
| 72 | | |

## How to report a problem

Send the developer:
- the phase and step number, for example "Phase 5, step 18";
- the job number;
- the role you were signed in as;
- what you expected (copy the "Expected" line);
- what happened instead;
- a screenshot: press **Windows + Shift + S**, drag over the screen, then paste it into your message.
