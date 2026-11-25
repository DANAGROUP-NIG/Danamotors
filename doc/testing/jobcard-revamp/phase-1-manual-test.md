# Job card revamp, phase 1: manual test guide

## What changed in this phase

Opening a job card now shows a new, shorter page instead of the old long one. A header at the top says which job it is, who has it now and when the car is promised. Under it, 8 numbered steps show where the job is in the workshop. Steps that are already finished appear as one-line summaries you can open. A bar fixed at the bottom of the screen holds the one main button that passes the job to the next person. When that button is greyed out, it says why. Everything else about the job (customer, vehicle, past visits, warranty, documents and history) is in a side panel called **Job file**.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop. Each one has a job number, for example 2026000013.
- **Step**: where the job is now. There are 8: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing and Delivery. A finished job is **Closed**; a stopped job is **Cancelled**.
- **Owner**: the one person, or role, who must act on the job now. The header shows them after "With:".
- **Handoff**: passing the job to the next owner with the main button at the bottom of the page.
- **Job file**: the side panel with everything about the job that is not the current step.
- **Workshop supervisor**: the workshop manager. In this system the workshop manager account plays that role.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account | Name you will see |
|---|---|---|
| Service advisor (main branch) | advisor1@kiamotors.com | Chidi Eze |
| Workshop manager, playing the workshop supervisor | wm.lagos@kiaamotors.com (note the double "a" in kiaamotors) | Rotimi Ajayi |
| Technician | tech1@kiamotors.com | Tunde Akinyemi |
| Service manager | servicemanager@kiamotors.com | |
| Abuja branch administrator | admin.abuja@kiamotors.com | |

**Demo jobs.** All are at the main branch unless marked. Find each one by typing its plate in the search box at the top of the **Job Cards** list (**Search by job #, customer, vehicle...**). To open a job, click the three-dot **Actions** button at the end of its row, then **View details**. Job numbers are made by the system, so write each one down the first time you see it.

| Plate | Step | Used in section |
|---|---|---|
| KJA-482TX | Check-in | A, D, G, H |
| LSR-512ST | Diagnosis, no technician yet | C |
| LSR-515ST | Estimate | E |
| LSR-516ST | Repair, waiting for parts | B, H |
| LSR-520ST | Cancelled | E |
| LSR-706RP | Closed, from before the new steps | B |
| LSR-404FP | Closed, with a gate pass | I |
| ABJ-202DM | Repair (Abuja branch) | F |

Section C and E change their jobs. After testing, ask the developer to reload the demo data before you test them again.

**Phone and tablet size.** In Chrome, press **F12**. Click the small phone and tablet icon at the top left of the panel that opens (device toolbar). Then choose a size from the list at the top of the page: **iPhone 12 Pro** (390 wide), **iPad Mini** (768 wide) or **Responsive** and type 1024. To go back to normal, click the phone and tablet icon again.

**Settings.** None for this phase.

## A. The new page

1. Sign in as the **Service advisor**. In the left menu, click **Job Cards**. Search for **KJA-482TX** and open it with **Actions**, then **View details**.
   Expected: the new page opens. At the top left is a **Job cards** link with a back arrow.
2. Look at the first line of the header.
   Expected: the job number, then **KJA-482TX**, then **Kia Sportage 2026, gravity grey**, separated by thin grey lines.
3. Look at the second line of the header.
   Expected: **Adaeze Okafor, +2348099900105**, an amber label **Check-in** and a purple label **Warranty**.
4. Look at the third line of the header.
   Expected: **With: Chidi Eze (Service advisor) since** followed by a date and time like **25 Nov 2026, 21:31**.
5. Look at the right of the header.
   Expected: **Promised delivery:** with a date and time in the same format, and under it a countdown such as **in 46 h** or **in 2 days**. Grey text when more than 4 hours are left, amber when less than 4 hours are left, red **Overdue by ...** once the time has passed. Next to it, the buttons **Job file** and **Print**.
6. Look under the header.
   Expected: a box with 8 numbered steps: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing, Delivery. Step 1 has a dark ring and a bold label; the others are grey.
7. Look under the steps.
   Expected: the heading **Step 1 of 8: Check-in** and under it **Waiting for the customer's check-in signature**. Below that are the **Job-opening approval**, estimate and advance sections.
8. Scroll down slowly to the bottom of the page.
   Expected: the header stays at the top and a bar stays at the bottom of the screen the whole time.
9. Look at the bottom bar.
   Expected: on the left **More**. On the right a dark button **Send to workshop supervisor**, greyed out, with the sentence **Get the customer's signature on the job-opening approval before sending the job to the workshop.** written beside it.
10. Click **More**.
    Expected: a small menu with **Cancel job** in red. Press **Esc** to close it.

Pass if: the header, the 8 steps, the step heading and the bottom bar appear as described, and the greyed-out button has its reason written beside it.

## B. Finished steps

11. Search for **LSR-516ST** and open it.
    Expected: the header label is amber **Waiting parts**. An amber strip under the steps reads **Work is paused while the job waits for parts.** with a link **View parts**.
12. Look at the steps.
    Expected: Check-in, Diagnosis and Estimate have a dark circle with a tick and a small name and time under them, for example **Chidi Eze, 25 Nov 2026, 21:31**. Warranty has a dashed grey circle and the word **Skipped**. Step 5, Repair, has the dark ring. Steps 6 to 8 are grey.
13. Look under the amber strip.
    Expected: one line per finished step, for example **Check-in completed by Chidi Eze, 25 Nov 2026, 21:31.** and **Warranty skipped.**
14. Click the **Check-in** step in the row of steps.
    Expected: the page scrolls to the Check-in line and it opens. It shows **Read only** and facts such as **Received by**, **Mileage** (for example **97,150 km**), **Service type**, **Promised delivery** and **Customer requests**. There are no boxes to type in.
15. Click the Check-in line again.
    Expected: it closes.
16. Click **View parts** in the amber strip.
    Expected: the page moves to the **Issued parts and collection** section.
17. Search for **LSR-706RP** and open it. This job finished before the new steps existed.
    Expected: all 8 steps have ticks with **Not provided** under them. Each summary line reads like **Check-in completed. Not provided.** The heading is **Closed job** and a **Delivered** section shows when it was delivered.

Pass if: finished steps show who and when, skipped steps say Skipped, a summary opens read only, and the older job shows "Not provided" instead of blanks or errors.

## C. Handing the job on

18. Sign out. Sign in as the **Workshop manager**. Search for **LSR-512ST** and open it.
    Expected: the header shows **Diagnosis** (blue) and **With: Workshop supervisor since ...**. The heading reads **Step 2 of 8: Diagnosis** with **Waiting for a technician to be assigned**.
19. Look at the alert strip and the bottom bar.
    Expected: an amber strip **No technician is assigned to this job.** with a link **Assign a technician**. The main button **Send to service advisor** is greyed out with **Assign a technician to this job first.** beside it.
20. Click **Assign a technician** in the strip.
    Expected: the page moves to the **Technician** section. It shows **Assigned technician: Not assigned**, a field **Technician to assign** and a greyed **Assign technician** button.
21. In **Technician to assign**, choose **Tunde Akinyemi**.
    Expected: the **Assign technician** button becomes dark.
22. Click **Assign technician**.
    Expected: the button reads **Assigning technician** for a moment, then a green message **Technician assigned to job (job number)** appears. The header now reads **With: Tunde Akinyemi (Technician) since ...**, the amber strip is gone, and **Send to service advisor** is dark with no reason beside it.
23. Click **Send to service advisor**.
    Expected: the button reads **Sending** for a moment, then a green message **Job (job number) sent to Chidi Eze**. The header reads **With: Chidi Eze (Service advisor) since ...** and **Awaiting approval** (amber). Step 2 now has a tick and **Rotimi Ajayi** with the time; step 4, Estimate, has the dark ring.
24. Click **Job file**, then the **Activity** tab.
    Expected: under **Step changes**, the newest entry is **Moved from Diagnosis to Estimate**, then **Rotimi Ajayi** with the date and time, then **Sent to Chidi Eze (Service advisor)**.
25. Sign out. Sign in as the **Service advisor**. Click the bell (notifications) at the top of the screen.
    Expected: a notification **Job sent to you** that names the job number, **Adaeze Okafor**, **LSR-512ST** and **Step: Estimate**.

Pass if: assigning the technician removes the reason and enables the button, the handoff names the new owner in the green message and the header, and the Activity tab and notification record it.

## D. Someone else's step

26. Sign out. Sign in as the **Technician**. Open **KJA-482TX**.
    Expected: an amber banner with an hourglass icon: **Waiting for Chidi Eze (Service advisor). You can view this step but only the service advisor can update it.** There is no bar at the bottom and no main button.
27. Sign out. Sign in as the **Service manager**. Open **KJA-482TX**.
    Expected: the same banner. No bar at the bottom.

Pass if: people who do not own the step see the banner with the owner's name and role, and no main button.

## E. Cancelling a job

28. Sign out. Sign in as the **Service advisor**. Open **LSR-515ST**. At the bottom, click **More**, then **Cancel job**.
    Expected: a box titled **Cancel job (job number)** with **LSR-515ST. The job stops at its current step and no one can work on it after this.** It has a field **Reason for cancelling** with a red star and the note **The reason is shown on the cancelled job and kept in the activity log.** The red **Cancel job** button is greyed out.
29. Type a single space in **Reason for cancelling**.
    Expected: the red **Cancel job** button stays greyed out.
30. Press **Esc**, then click on the dark area outside the box.
    Expected: the box stays open and keeps what you typed.
31. Clear the field and type **Customer took the vehicle to another workshop.**
    Expected: the red **Cancel job** button becomes active.
32. Click the red **Cancel job** button.
    Expected: it reads **Cancelling job** for a moment. The box closes and a green message **Job (job number) cancelled** appears. The header label turns red **Cancelled**, the steps turn grey, and a red panel reads **Cancelled by Chidi Eze, (date and time). Reason: Customer took the vehicle to another workshop.** with **View activity**. There is no bar at the bottom.
33. Click **View activity**.
    Expected: the Job file opens on **Activity**. The newest step change is **Job cancelled**, **Chidi Eze** with the time, and the reason.
34. Open **LSR-520ST**, which was cancelled earlier.
    Expected: the red **Cancelled** label, grey steps, and **Cancelled by Chidi Eze, (date and time). Reason: Customer took the vehicle elsewhere**.
35. Open **KJA-482TX** again. Click **More**, then **Cancel job**, then **Keep job**.
    Expected: the box closes and the job is unchanged.

Pass if: cancelling needs a reason, the box never closes by accident, and the cancelled job shows who, when and why.

## F. Not allowed and not found

36. Sign out. Sign in as the **Abuja branch administrator**. Search for **ABJ-202DM** and open it. Copy the address from the browser's address bar.
    Expected: the job opens normally.
37. Sign out. Sign in as the **Service advisor**. Paste the copied address into the address bar and press **Enter**.
    Expected: a box with a padlock icon: **You cannot open this job card**. Under it: **This job card belongs to another branch. Only staff who work at that branch, or staff with access to all branches, can open it. Ask your branch manager or an administrator if you need access.** There is a **Go to job cards** button and no **Try again** button.
38. In the address bar, change the last character of the address to a different letter or number, then press **Enter**.
    Expected: **Job card not found** with **The link may be wrong, or the job card was removed. Find the job on the Job cards list.** and a **Go to job cards** button.
39. Click **Go to job cards**.
    Expected: the Job Cards list opens.

Pass if: another branch's job explains who can open it, a wrong link says the job was not found, and neither shows an error code.

## G. The Job file

40. Open **KJA-482TX**. Click **Job file**.
    Expected: a panel slides in from the right with the title **Job file**, the job number under it, and a close button. The tabs are **Customer and vehicle**, **Visit history**, **Warranty and campaigns**, **Documents and prints** and **Activity**. **Customer and vehicle** is selected.
41. Read the **Customer and vehicle** tab.
    Expected: three cards, **Customer** (with **View full profile**), **Vehicle** and **This visit**. Missing values read **Not provided**, never blank. **Mileage** reads like **48,250 km**. **Service charge**, if shown, has the ₦ sign and two decimals, like **₦15,100.00**.
42. Click **Visit history**.
    Expected: **Last two visits** with either up to two earlier jobs (job number link, opened and delivered dates, mileage, branch, service, requests, work done) or **No earlier visits are recorded for this vehicle.**
43. Click **Warranty and campaigns**.
    Expected: **Linked campaigns** and **Who pays**, each with content or a plain sentence such as **No recall, FPC or campaign work on this job card.** The service advisor also sees either the **Warranty at creation** card or the sentence **Warranty details are shown to staff with warranty access, such as the warranty officer.**
44. Click **Documents and prints**.
    Expected: **Job-opening approval**, **Estimates**, **Bills** and **Other prints**, each with content or a sentence such as **No bill has been created for this job yet.** Estimate amounts have the ₦ sign, for example **₦29,350.00**.
45. Click **Activity**.
    Expected: **Step changes** with at least **Job opened at Check-in**, and **Status changes**. Dates read like **25 Nov 2026, 21:31**.
46. Press **Esc**.
    Expected: the panel closes and you are back where you were on the page.

Pass if: every tab shows information or a clear sentence, money has ₦ and two decimals, and Esc closes the panel.

## H. Loading and errors

47. Open **KJA-482TX** and press **F5** to reload.
    Expected: while it loads you briefly see grey placeholder shapes in the layout of the page (header, a row of 8 circles, two cards), not a blank page and not a spinner.
48. Click **Job cards** at the top left to go back to the list. Wait 5 seconds. Press **F12**, open the **Network** tab, and change **No throttling** to **Offline**.
    Expected: nothing changes yet.
49. On any row of the list other than KJA-482TX, click **Actions**, then **View details**.
    Expected: after a few seconds, a box with **Could not load this job card**, **Check your connection and try again.**, a **Try again** button, a **Go to job cards** button and **If this keeps happening, contact your system administrator.** If instead you see the browser's own "No internet" page, go back online, reload the list, wait 5 seconds and repeat step 48.
50. Change **Offline** back to **No throttling**. Click **Try again**.
    Expected: the button reads **Trying again**, then the job opens normally.

Pass if: loading shows placeholder shapes, and a lost connection shows the message with a Try again button that works once you are back online.

## I. Printing

51. Open **LSR-404FP** (Closed). Look at the current step section.
    Expected: the heading **Closed job** and a **Delivered** card that says when and by whom the vehicle was delivered and gives the gate pass number, with a **Print gate pass** button.
52. Click **Print** in the header.
    Expected: a menu with **Estimate** (if the job has one), **Signed job-opening approval** (if signed), **Picking list** (if your account may print it) and **Gate pass**.
53. Click **Gate pass**.
    Expected: the print preview shows one page with **Gate pass (number)** and the job card number, branch, customer, vehicle, plate, delivery date and time, delivery advisor, and lines for **Security signature** and **Date and time**. The menus, header and buttons do not print. Click **Cancel** in the print window.
54. Open **KJA-482TX**, click **Print**, then **Estimate** (if listed).
    Expected: the existing estimate print page opens, with ₦ amounts.

Pass if: the gate pass prints alone and cleanly, and the Print menu only lists documents that exist for the job.

## J. Phone and tablet

55. Sign in as the **Service advisor**. Open **LSR-516ST**. Switch to **iPhone 12 Pro** size.
    Expected: the header shows the job number, **LSR-516ST**, **Kia Sorento 2020, aurora black**, the **Waiting parts** label and the **With:** line. The customer, warranty label and promised time are hidden. **Job file** and **Print** are icon buttons. Nothing runs off the right edge of the screen.
56. Look at the steps.
    Expected: one line **Step 5 of 8: Repair** with a small arrow and a thin bar about half filled.
57. Tap **Step 5 of 8: Repair**.
    Expected: the 8 steps open as a list, one per line, finished ones with ticks and names. Tap again to close.
58. Tap the **Job file** icon.
    Expected: the panel fills the whole screen. The tabs scroll sideways inside the panel only. Close it with the X.
59. Scroll to the bottom of the job.
    Expected: the bottom bar stays visible and its buttons wrap onto two lines if needed. You never need to scroll sideways.
60. Switch to **iPad Mini** (768 wide), then to **Responsive** at 1024 wide, and look at the same job.
    Expected: the 8 steps show in one row with their labels. The header wraps neatly. Nothing is cut off and there is no sideways scrolling.

Pass if: the page fits every size without sideways scrolling, and the phone shows the short step line that opens into the full list.

## K. Keyboard only

61. Open **LSR-516ST** at normal size. Click once on an empty part of the page, then press **Tab** repeatedly.
    Expected: a dark outline moves through **Job cards**, **Job file**, **Print**, the finished steps, the current step, **View parts**, the summary lines, the buttons in the page, and the bottom bar. You can always see where you are.
62. Tab to the **Check-in** step and press **Enter**.
    Expected: the Check-in summary opens.
63. Tab to **Job file** and press **Enter**. Press **Tab** several times.
    Expected: the outline stays inside the panel. Use the **Right arrow** key on the tabs to move between them.
64. Press **Esc**.
    Expected: the panel closes and the outline returns to **Job file**.

Pass if: everything can be reached and used with Tab, Enter, the arrow keys and Esc, and the outline is always visible.

## Always report

Report any of these straight away, on any screen:
- Emojis, odd symbols, question marks or boxes where words should be.
- Garbled letters such as "â‚¦" instead of "₦".
- The words "undefined", "null" or "NaN", or codes in capitals with underscores such as IN_PROGRESS.
- Prices without the ₦ sign, or dates like 2026-11-25T10:49:00Z.
- A pop-up box from the browser itself (grey, plain, with an OK button) instead of the app's own messages.
- A button that does nothing, or a greyed-out button with no reason next to it.
- A form or box that loses what you typed.
- Having to scroll sideways to see the whole page.

## Not in this phase

These are still the older screens inside the new frame. Later phases replace them, so please do not report their look as a bug (but do report errors, odd symbols or broken buttons):
- Check-in: the job-opening approval, estimate and advance sections. Replaced by Details, Walk-around and Customer consent in phase 2.
- Diagnosis: the Technician and Findings and work done cards. Replaced by supervisor allocation, technician findings and engineer review in phase 3.
- Warranty: the Warranty at creation and Who pays cards. Replaced by the warranty decision screen in phase 4.
- Estimate: the estimate and advance sections, and the button wording **Release to technician**. Replaced in phase 5.
- Repair: Service transactions (with its own **Save work done** and **Mark vehicle ready**), issued parts, recorded labour and **Request part**. Replaced by the technician repair view in phase 6.
- Quality check: **Record QC pass** and **Record QC failure**. Replaced in phase 7.
- Billing: the **Bill** card with **Create job bill**, and **Delivery on credit**. Replaced in phase 8.
- Delivery: the **Deliver the vehicle** form with late-delivery reasons. Replaced in phase 9.
- **Save draft** does not appear yet; it arrives with the steps that keep drafts, from phase 2.
- The printed job card (the whole job on paper) is not in the Print menu. It comes in phase 11.

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

## How to report a problem

For each problem, write down:
1. The phase and step number, for example "Phase 1, step 23".
2. The job number, for example 2026000013.
3. The role you were signed in as.
4. What you expected, copied from this guide.
5. What actually happened.
6. A screenshot. On Windows, press Windows + Shift + S and drag over the screen.
