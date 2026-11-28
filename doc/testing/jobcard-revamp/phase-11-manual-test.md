# Phase 11 manual test: printed job card and gate pass

## What changed in this phase

You can now print the job card the way staff know it from the paper form: page 1 is the filled-in form, page 2 the 12 terms and conditions. Everything on it comes from what was recorded in the app: the customer, the vehicle, the requests, the walk-around, the technician's findings, the estimated and actual amounts, the signatures and the last two visits. The gate pass is now a small slip of its own (A6, a quarter of an A4 sheet) for the security post. Both are opened from the **Print** menu at the top of a job, from the **Job file** panel, and the gate pass also opens by itself when a delivery is completed. Nothing is typed on these pages: they only show and print.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000070.
- **Print preview**: the window Chrome opens when you print. It shows the pages exactly as they will come out of the printer, with the number of sheets at the top right.
- **Save as PDF**: a choice in the print preview that saves the pages as a file instead of printing them on paper.
- **Gate pass**: the slip the security guard checks before the vehicle leaves. It has its own number.
- **Checklist**: the 25 items the advisor checks on the vehicle at check-in (service book, jack, mirrors and so on).
- **Findings**: what the technician found for each customer request (the paper form's "Cause and nature of defect").
- **Estimated and actual**: the amounts the customer was quoted on the estimate against what the job really cost.
- **Job file**: the button at the top of the job that opens a side panel with tabs, including **Documents and prints**.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account on the test site | Name you will see | Account on the developer's computer |
|---|---|---|---|
| Service advisor | advisor1@danamotors.com | Chidi Eze | advisor1@kiamotors.com (Chidi Eze) |
| Technician (for the "who may print" checks) | tech1@danamotors.com | Tunde Akinyemi | tech1@kiamotors.com (Tunde Akinyemi) |
| Administrator (to check the terms) | the administrator account you normally use | | admin.lagos@danamotors.com |

**Demo jobs.** All are at **Main Branch**; customer names are fictional. To open one, use **Job Cards** in the left menu, click **Table** at the top right if the board is showing, type the plate in the search box, then click the three-dot **Actions** button at the end of the row and **View details**. If a plate has more than one job, open the newest. The job numbers are the ones on the test site; on the developer's computer they are in brackets.

| Plate | Job number | What it is | Used in section |
|---|---|---|---|
| LSR-548ST | S37_SERVER (2026000055) | Closed, delivered to Ọlá Ògúnlẹ̀yẹ̀ (a Yoruba name with accents). Nine long customer requests, so the form runs onto a second sheet. Two earlier visits on the same vehicle | A, B, C, E, H, I |
| LSR-547ST | 2026000070 (2026000052) | Closed, delivered to Adaeze Okafor. Two requests, so the form fits one sheet | D |
| LSR-544ST | 2026000067 (2026000049) | Waiting at Delivery, not delivered yet. If someone has delivered it since, use LSR-545ST 2026000068 (2026000050) instead | F, G |

**Phone and tablet size.** In Chrome press **F12**, click the device toolbar icon (a phone and tablet, top left of the panel), and choose **iPhone 12 Pro** (390 wide) or **iPad Mini** (768 wide) from the list at the top of the page. Press **F12** again to go back to the normal size.

**Print settings in Chrome, once.** The first time you open the print preview in sections A to E: set **Destination** to **Save as PDF**, **Pages** to **All**, open **More settings**, set **Margins** to **Default** and **Scale** to **Default**, and untick **Headers and footers** (otherwise Chrome adds the web address and the date along the edge). Chrome remembers these settings.

**Settings to check first.** Sign in as an administrator, click **Settings** in the left menu, then **Terms & Conditions**, and choose the document **Job card**. Expected: 12 numbered clauses, starting "Vehicle is driven and tested (including test drive outside workshop)". Do not change them. Sign out.

## A. Print the job card from the Print menu (advisor, laptop)

A1. Sign in as the **service advisor** and open job **LSR-548ST**.
Expected: the job page shows **Closed job**, "Delivered to Ọlá Ògúnlẹ̀yẹ̀" and the date.

A2. Click **Print** at the top right of the job.
Expected: a menu opens with **Print job card**, **Print gate pass**, **Print estimate**, **Print signed job-opening approval** and **Print picking list** (the last ones only if your account may print them).

A3. Click **Print job card**.
Expected: a new page with **Back to job card** at the top left and a dark **Print job card** button at the top right. Below them a white sheet titled **Job card**, with "Dana Motors Limited" and the branch name, address and phone at the top. No print window opens yet.

A4. Look at the box at the top right of the sheet.
Expected: **Warranty** with an empty box and **Non-warranty** with a ticked box (this vehicle is out of warranty).

A5. Look at the four boxes across the top.
Expected: **Job number** S37_SERVER, **Service advisor** Chidi Eze, **Km (odometer)** 50,240 km, **Date** the day the job was opened, written like "28 Nov 2026".

A6. Look at **Customer details** and **Vehicle details**.
Expected: Name Ọlá Ògúnlẹ̀yẹ̀ with every accent mark showing, the phone, the address "14 Sample Way, Lekki, Lagos"; Model "Kia Sorento 2020", Reg. no. LSR-548ST, VIN KNAPM81DMK7000538, Engine no. "Not provided", Sold by and Sold on (a date like "30 Aug 2020").

A7. Look at **Customer requests** and **Instructions to technician**.
Expected: 9 numbered requests in the customer's words, starting "Periodic service (50,000 km), including the engine oil and filter change recommended in the service book". The instructions list the advisor's note.

A8. Look at **Body and paint damage** and **Fuel level**.
Expected: a car drawn from above with a circled **S** at the back and a circled **D** on the right front door, and beside it "S Scratch on rear bumper: Light scratch" and "D Dent on front right door". The fuel gauge needle points straight up and reads **Half (1/2)**.

A9. Look at **Service checklist (25 items)**.
Expected: 25 numbered items. Every item has a ticked box except **7. Hub caps**, which says **Missing** with an empty box, and **16. AC working**, which says **Not working** with an empty box.

A10. Look at **Cause and nature of defect (diagnosis)**.
Expected: 9 findings, each ending with the request it answers, for example "(Request 2)". Under them "Confirmed by" and "Checked and certified roadworthy by", each with a name and a date.

A11. Look at **Estimated and actual**.
Expected: rows **Delivery date**, **Delivery time**, **Parts**, **Oil**, **Labour**, **Service charges** and **Total** (in bold), with **Estimated** and **Actual** columns. Amounts have the naira sign, commas and two decimals, for example ₦45,000.00, and line up on the right. Delivery date and time show the promised and the actual delivery, for example "12 Dec 2026" and "28 Nov 2026", and times like "16:00". Under the table: "Amounts the customer pays, before VAT and discounts."

A12. Look at the five signature boxes.
Expected: **Service advisor** (Chidi Eze and a date, blank signature line), **Technician** (Tunde Akinyemi and a date, blank signature line), **Service manager** (a name, a drawn signature and a date), **Customer authorisation** (the sentence "I authorise the work requested above and accept the terms and conditions overleaf.", a drawn signature, Ọlá Ògúnlẹ̀yẹ̀ and a date), **Customer delivery** (the sentence "I have taken delivery of the vehicle and I am satisfied with the repairs.", a drawn signature, Ọlá Ògúnlẹ̀yẹ̀ and a date).

A13. Look at **Vehicle history** at the bottom.
Expected: **Last visit:** a date, the job number, 40,060 km, "Periodic service (40,000 km), Brake check". **Second last visit:** a date, the job number, 30,120 km, "Periodic service (30,000 km)". Under it a grey line "Printed 28 Nov 2026, 10:15, Lagos time" (today's date and time).

**Pass if:** every box on page 1 is filled with this job's details as described, accents and naira signs show correctly, and nothing says "undefined", "null" or shows a code in capitals.

## B. The back page: terms and conditions

B1. Scroll down below the first sheet.
Expected: a second white sheet with the company name, "Job S37_SERVER" at the top right, and a dark bar **Terms and conditions**.

B2. Count the clauses.
Expected: 12 clauses, each with its number in a small dark square, the same text as in Settings. Clause 3 shows "₦2,000/-" and clause 4 "₦25,000/-" with the naira sign, not a box or odd letters.

**Pass if:** the 12 clauses are numbered 1 to 12, readable, and the naira signs show correctly.

## C. Print to PDF: the long job

C1. Click **Print job card** at the top right.
Expected: Chrome's print preview opens. The app's menus, header and buttons are not on the pages.

C2. Look at the sheet count at the top right of the print preview.
Expected: 3 sheets. Sheets 1 and 2 are the front of the form (the long requests push the lower sections onto sheet 2); sheet 3 is the terms.

C3. Scroll through the preview pages.
Expected: no box is cut in half across two sheets (each box is whole on one sheet). The dark title bars print dark with white words. The bottom right of each sheet says "Page 1 of 3", "Page 2 of 3", "Page 3 of 3".

C4. Click **Save**, save the file to your desktop as "S37 job card", and open it.
Expected: the PDF shows the same 3 pages. The naira signs (₦) and the name Ọlá Ògúnlẹ̀yẹ̀ show correctly, with the dots under the letters and the accents above them.

**Pass if:** the printout has 3 sheets, no box is split, and ₦ and the accents print correctly in the PDF.

## D. A short job fits on one sheet each side

D1. Click **Back to job card**, then open job **LSR-547ST**.
Expected: the job shows **Closed job**.

D2. Click **Print**, then **Print job card**, then the **Print job card** button.
Expected: the print preview shows 2 sheets: the whole form on sheet 1 and the terms on sheet 2. Customer "Adaeze Okafor". **Vehicle history** says "No earlier visit recorded" twice.

D3. Click **Cancel** in the print preview.
Expected: the preview closes and the job card sheet stays on screen.

**Pass if:** a short job prints on exactly 2 sheets, front and back.

## E. The gate pass slip

E1. Click **Back to job card** and open job **LSR-548ST** again. Click **Job file** at the top right.
Expected: a panel opens on the right.

E2. Click the tab **Documents and prints** and find the card **Other prints**.
Expected: "Job card, front and back" with **Print job card**, and "Gate pass" with its number and **Print gate pass**.

E3. Click **Print gate pass**.
Expected: a page with a small slip: the company name, a dark bar **Gate pass**, then **Job number** S37_SERVER, **Gate pass number** (in bold), **Registration (plate)** LSR-548ST (in bold), **Model** Kia Sorento 2020, **Customer** Ọlá Ògúnlẹ̀yẹ̀, **Collected by** Ọlá Ògúnlẹ̀yẹ̀, **Delivered by** Chidi Eze, **Date and time** like "28 Nov 2026, 10:21". Under them **Security signature:** and **Time out:** with blank lines to sign.

E4. Click **Print gate pass** at the top right.
Expected: the print preview shows 1 small sheet (A6, 105 by 148 mm) with the slip only.

E5. Click **Cancel**, then **Back to job card**.
Expected: the job page with **Closed job**.

E6. In the **Gate pass** card on the job page, click **Print gate pass**.
Expected: the slip page opens and the print preview opens by itself straight away. Click **Cancel**.

**Pass if:** the slip shows every line listed, prints on one small sheet, and opens from the Print menu, the Job file and the Gate pass card.

## F. A job not delivered yet

F1. Click **Back to job card** and open job **LSR-544ST**.
Expected: the job shows "Step 8 of 8: Delivery".

F2. Click **Print** at the top right.
Expected: the menu has **Print job card** but no **Print gate pass**.

F3. Click **Print job card**.
Expected: the form opens. In **Customer delivery** the name line is blank and **Date:** has a blank line to fill in by hand. In **Estimated and actual**, **Delivery date** and **Delivery time** under **Actual** say "Not provided".

F4. Click **Back to job card**, then **Job file**, **Documents and prints**, and look at "Gate pass" in **Other prints**.
Expected: "Issued when the vehicle is delivered" in grey, and no print link.

**Pass if:** a job still in the workshop prints with blank lines where nobody has signed yet, and offers no gate pass.

## G. Someone who may not print the job card

G1. Sign out. Sign in as the **technician** and open job **LSR-548ST**.
Expected: the job shows **Closed job**.

G2. Click **Print**.
Expected: the menu shows **Print gate pass** but not **Print job card** (the job card carries the customer's signatures and amounts).

G3. Press **Esc**, then type the job card's print address: click the address bar, add "/print" to the end of the job page address, and press **Enter**.
Expected: a box "You cannot print this job card" with "Printing the job card needs the estimate print permission. Service advisors, service managers and workshop supervisors can print it." There is no print button.

G4. Click **Back to job card**, then **Print**, then **Print gate pass**.
Expected: the slip opens and can be printed.

**Pass if:** the technician cannot print the job card and is told who can, but can print the gate pass.

## H. Loading, offline and errors

H1. Sign out, sign in as the **service advisor**, open job **LSR-548ST**, click **Print**, then **Print job card**. While it loads, watch the page.
Expected: grey placeholder blocks for a moment, then the sheet.

H2. Press **F12**, click the **Network** tab, and change **No throttling** to **Offline**. Press **F5** to reload.
Expected: "Could not load the job card" with "Check your connection and try again." and a **Try again** button.

H3. Change **Offline** back to **No throttling** and click **Try again**.
Expected: the job card sheet appears.

H4. Click **Back to job card** and open job **LSR-544ST**. Click the address bar, add "/gate-pass/print" to the end of the job page address, and press **Enter**.
Expected: "The gate pass is not available yet" with "The gate pass is issued when the vehicle is delivered. Complete the Delivery step first."

**Pass if:** loading shows placeholders, the offline error offers Try again and recovers, and a gate pass that does not exist yet is explained.

## I. Keyboard only

I1. Open the job card print page for **LSR-548ST** (job page, **Print**, **Print job card**). Press **Tab** until **Back to job card** has an outline around it (the left-hand menu comes first).
Expected: the outline is clearly visible.

I2. Press **Tab** once.
Expected: the outline moves to the **Print job card** button.

I3. Press **Enter**.
Expected: the print preview opens. Press **Esc** to close it.

I4. On the job page, press **Tab** until the **Print** button is outlined, and press **Enter**.
Expected: the menu opens with its first item, **Print job card**, outlined.

I5. Press the **Down arrow** once.
Expected: **Print gate pass** is outlined. (**Tab** also moves down the menu, and **Esc** closes it and puts the outline back on **Print**.)

I6. Press **Enter**.
Expected: the gate pass slip opens.

**Pass if:** both documents can be opened and printed with the keyboard only, and you can always see where you are.

## J. Phone and tablet

J1. Open the job card print page for **LSR-548ST**. Make the browser phone size (**iPhone 12 Pro**, 390 wide).
Expected: the sheet becomes one column: the four top boxes in two rows, then each section one under another. Nothing is cut off at the right and the page does not scroll sideways.

J2. Make the browser tablet size (**iPad Mini**, 768 wide).
Expected: two columns where they fit, no sideways scrolling.

J3. Open the gate pass slip at phone size.
Expected: the slip fits the screen width with no sideways scrolling.

**Pass if:** both documents can be read on a phone and tablet without sideways scrolling. (Printing is done from a laptop; the printed page is always A4 or A6 whatever the screen size.)

## K. Handing over: delivery prints the gate pass

This section completes a delivery, so it changes the job. Do it last.

K1. As the **service advisor**, open job **LSR-544ST** and follow the delivery steps in the phase 9 guide, section A, up to and including the customer's delivery signature.
Expected: **Complete delivery and print gate pass** in the bar at the bottom is dark (enabled).

K2. Click **Complete delivery and print gate pass**.
Expected: the toast "Job 2026000067 delivered. Gate pass (its number) issued.", then the gate pass slip for this job opens and the print preview opens by itself.

K3. Click **Cancel** in the print preview, then **Back to job card**.
Expected: **Closed job**, "Delivered to Adaeze Okafor" and the date, the header badge **Delivered**, and no **With:** line (nobody holds a closed job). **Job file**, then **Activity**, lists the delivery at the top of **Step changes**.

K4. Click **Print**, then **Print job card**.
Expected: the **Customer delivery** box now has the signature, "Adaeze Okafor" and today's date; **Estimated and actual** shows today's date and time under **Actual** for delivery.

**Pass if:** completing delivery opens and prints the gate pass, and the job card then shows the delivery signature.

## Always report

Report any of these wherever you see them, even if the step passed:
- emojis or odd symbols used as icons;
- the words "undefined", "null" or "NaN";
- codes in capitals with underscores, such as NOT_WORKING;
- garbled characters, such as "â‚¦" instead of ₦, or a box or question mark instead of an accented letter;
- browser pop-ups (small grey boxes with OK and Cancel) instead of the app's own messages;
- buttons or links that do nothing;
- grey buttons with no sentence saying why;
- anything you typed that disappears;
- sideways scrolling on screen;
- on paper or in the PDF: a box cut in half across two sheets, the web address or date printed along the edge (untick **Headers and footers**), or the app's menus printed.

## Not in this phase

- The company logo is not on the printed pages: the app has only a white logo made for the dark menu, which would not show on paper. The company name prints instead.
- The gate pass number uses the app's existing numbering (for example 2026000009), not "GP-2026-001234" as in the design picture.
- Staff signatures for the service advisor and the technician are blank lines to sign by pen; the app does not capture them on a screen. The **Service manager** box shows the signature given at the quality check.
- PDI jobs keep their own documents and have no **Print job card**.
- Removing leftover old job card code, the final settings checklist and the full end-to-end walk come in phase 12.

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
| C1 | | |
| C2 | | |
| C3 | | |
| C4 | | |
| D1 | | |
| D2 | | |
| D3 | | |
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
| G1 | | |
| G2 | | |
| G3 | | |
| G4 | | |
| H1 | | |
| H2 | | |
| H3 | | |
| H4 | | |
| I1 | | |
| I2 | | |
| I3 | | |
| I4 | | |
| I5 | | |
| I6 | | |
| J1 | | |
| J2 | | |
| J3 | | |
| K1 | | |
| K2 | | |
| K3 | | |
| K4 | | |

## How to report a problem

For each problem, send:
- the phase and step number, for example "Phase 11, step C2";
- the job number;
- the role you were signed in as;
- what you expected (copy it from the step);
- what happened instead;
- a screenshot: press **Windows + Shift + S**, drag over the problem, and paste it into your message. For a printing problem, attach the PDF you saved.
