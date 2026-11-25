# Job card revamp, phase 0: manual test guide

## What changed in this phase

Every job card now records which **step** it is at. A step is one stage of the job's journey through the workshop: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing, Delivery, and at the end Closed or Cancelled. The **Job Cards** list has a new **Step** column that shows it. When you do everyday work on a job, such as starting work, sending it for the quality check or billing it, the step moves on by itself. The job card page itself does not look different yet; the new page comes in phase 1.

## Before you start

**Address.** Open the test site address your administrator gave you. If you are testing on the developer's computer, open `http://localhost:3000`.

**Test accounts.** Use the password your administrator gave you for each one.

| Role | Account |
|---|---|
| Service advisor (main branch) | advisor1@kiamotors.com |
| Technician (main branch) | tech1@kiamotors.com |
| Billing (creates and cancels bills) | admin.lagos@danamotors.com, or a billing officer account if your administrator gave you one |

**Words used in this guide.**
- **Job card**: the record of one vehicle visit to the workshop.
- **Step**: where the job is now. Each step belongs to one person, for example the technician during Repair.
- **Status**: the older word for where the job is (Open, In progress, Ready and so on). It is still shown and still used by reports.
- **Bill**: the job's invoice.

**Demo jobs.** The demo data includes one fictional job at every step, all at the main branch. Find them on the **Job Cards** list by plate number (type the plate in the search box at the top of the list).

| Plate | Step you should see | Status you should see |
|---|---|---|
| KJA-482TX | Check-in | OPEN |
| LSR-512ST | Diagnosis | OPEN |
| LSR-513ST | Diagnosis | OPEN |
| KJA-514ST | Warranty | OPEN |
| LSR-515ST | Estimate | OPEN |
| LSR-516ST | Repair | WAITING PARTS |
| LSR-517ST | Quality check | QC |
| LSR-518ST | Billing | QC |
| LSR-519ST | Delivery | BILLED |
| LSR-520ST | Cancelled | CANCELLED |
| LSR-303DM (the newer of its two jobs) | Billing | READY |
| ABJ-202DM (Abuja branch) | Repair | IN PROGRESS |

Job numbers are created by the system, so write down the job number next to each plate the first time you see it.

**Phone and tablet size.** In Chrome, press **F12**, click the small phone and tablet icon at the top left of the panel that opens (device toolbar), then choose a size from the list at the top of the page, for example **iPhone 12 Pro** (390 wide) or **iPad Mini** (768 wide).

**Settings.** None for this phase.

## A. Every job shows a step

1. Sign in as the **Service advisor**. In the left menu, click **Job Cards**.
   Expected: the list loads. It has a column headed **Step** to the right of **Status**.
2. Look at the **Step** column for every row on the first page.
   Expected: every row shows a coloured label with a step name: Check-in, Diagnosis, Warranty, Estimate, Repair, Quality check, Billing, Delivery, Closed or Cancelled. No row shows a code in capitals with underscores, a blank, "undefined" or "null".
3. Type **KJA-482TX** in the search box.
   Expected: one job, **Step** shows **Check-in** (amber label).
4. Search for each plate in the demo jobs table above, one at a time.
   Expected: the **Step** and **Status** for each plate match the table.
5. Clear the search and look at older jobs (finished jobs from before this phase).
   Expected: delivered jobs show **Closed** (grey), cancelled jobs show **Cancelled** (red), ready jobs show **Billing**, in-progress jobs show **Repair**.

Pass if: every job shows a step name, and the demo jobs match the table.

## B. Starting work moves the job to Repair

6. Sign out, then sign in as the **Technician**. Open **Job Cards** and search for a job of your own that is open, has an approved estimate and an advance payment. If you have none, ask the advisor to prepare one, or use a new job you created yourself.
   Expected: the job's **Step** is Check-in or Estimate and its **Status** is OPEN.
7. Click the job number to open it. Scroll to **Workshop actions**. In **Next action**, choose **Start work**.
   Expected: the option is available. If it reads **Start work (advance required)** and is greyed out, the job has no advance payment yet: record one first.
8. Click **Save diagnosis & findings**.
   Expected: a green message **Job card updated** appears at the bottom right.
9. In the left menu, click **Job Cards** and search for the job again.
   Expected: **Status** is IN PROGRESS and **Step** is **Repair** (blue label).
10. Open the job again. In **Next action**, choose **Job done: send for QC**, then click **Save diagnosis & findings**.
    Expected: **Job card updated**. On the list the **Step** is now **Quality check**.

Pass if: the step follows the technician's actions without anyone changing it by hand.

## C. Billing moves the job to Delivery, and cancelling the bill moves it back

11. Sign in as the **Billing** account. Open **Job Cards** and search for **LSR-303DM**. Open the newer of its two jobs (Step **Billing**, Status READY).
    Expected: the job card page opens.
12. Click **Create Job Bill**.
    Expected: the **Create job bill** form opens with **Job card ready for billing** filled in.
13. Leave **Parts discount (%)** and **Labour discount (%)** at **0** and click **Create job bill**.
    Expected: a green message **Job bill [number] created**. Amounts show the naira sign with two decimals, for example ₦95,350.00.
14. Go back to **Job Cards** and search for **LSR-303DM**.
    Expected: the job shows **Status** BILLED and **Step** **Delivery** (green label).
15. Open the job. In the **Invoices** section, find the new bill and choose **Cancel bill**.
    Expected: a window opens asking for a **Cancellation remark**. It is not a plain grey browser pop-up.
16. Type **Wrong discount entered** and click **Cancel job bill**.
    Expected: a green message **Job bill cancelled**.
17. Go back to **Job Cards** and search for **LSR-303DM**.
    Expected: **Status** READY and **Step** **Billing** again.

Pass if: billing moves the job to Delivery and cancelling the bill brings it back to Billing.

## D. Everyday saving still works

18. Sign in as the **Service advisor**. Open the job for **LSR-515ST** (Step **Estimate**).
    Expected: the page opens as it did before this phase.
19. In **Workshop actions**, type **Customer mentioned a rattle from the rear on rough roads** in **Observations** and click **Save diagnosis & findings**.
    Expected: **Job card updated**. The text is still there after you reload the page (F5). The **Step** on the list is still **Estimate**.

Pass if: saving notes works and does not change the step.

## E. Mistakes the screen should catch

20. As the **Technician**, open the job for **LSR-517ST** (Step **Quality check**). Look at **Next action**.
    Expected: the technician cannot mark the vehicle ready; **Mark vehicle ready** is not offered to the technician.
21. As the **Service advisor**, open the job for **LSR-518ST** (Step **Billing**, QC passed). In **Next action**, choose **Mark vehicle ready** and click **Save diagnosis & findings**.
    Expected: **Job card updated**. On the list, **Status** READY and **Step** still **Billing**.

Pass if: the existing rules about who can do what still apply.

## F. Phone and tablet size

22. Press **F12**, turn on the device toolbar and choose **iPhone 12 Pro**. Open **Job Cards**.
    Expected: the list fits the screen or scrolls inside the table only; the whole page does not scroll sideways. The **Step** labels are readable and not cut off.
23. Choose **iPad Mini** and look at the list again.
    Expected: same as above.

Pass if: no sideways page scrolling and the Step labels are readable.

## G. Keyboard only

24. On the **Job Cards** list, press **Tab** repeatedly.
    Expected: a visible outline moves through the search box, filters and rows. You can open a job by pressing **Enter** on its job number.
25. On a job's **Workshop actions**, press **Tab** to reach **Next action**, use the arrow keys to choose an option and **Tab** to **Save diagnosis & findings**, then press **Enter**.
    Expected: the action saves as in section B.

Pass if: everything in this guide can be done without a mouse.

## H. Loading and errors

26. Press **F12**, open the **Network** tab and choose **Offline** in the throttling list. Reload the **Job Cards** list.
    Expected: the list shows its loading state and then an error message from the app, not a blank page or garbled text.
27. Set the **Network** tab back to **No throttling** and reload.
    Expected: the list loads normally with the **Step** column.

Pass if: being offline shows a clear message and the page recovers.

## Always report

- Emojis or odd symbols, question marks or boxes where words should be.
- "undefined", "null" or "NaN" anywhere.
- Codes in capitals with underscores, such as QUALITY_CHECK or WAITING_PARTS, in the **Step** column.
- Garbled characters such as "â‚¦" instead of "₦".
- A plain grey pop-up from the browser instead of the app's own messages.
- A button that does nothing, or a greyed-out option with no explanation.
- A form that loses what you typed after an error.
- Having to scroll the whole page sideways.

## Not in this phase

- The job card page looks the same as before. The header, 8-step progress bar, bottom action bar and side panel arrive in **phase 1**.
- There is no **With:** line or step owner shown on screen yet, and no new step buttons such as **Send to workshop supervisor**. They arrive in **phase 1** and later phases. Behind the scenes, the system already records who holds each job.
- Check-in consent, walk-around and diagnosis screens arrive in **phases 2 and 3**. Demo jobs that are past check-in were created without a check-in signature.
- Older jobs show their finished steps without names, because they were created before steps existed. This is expected.
- The **Status** column still uses the older wording; it is replaced in **phase 1**.

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

## How to report a problem

For each problem, write down:
1. The phase and step number, for example "Phase 0, step 14".
2. The job number.
3. The role you were signed in as.
4. What you expected, copied from this guide.
5. What happened.
6. A screenshot: on Windows press **Windows + Shift + S** and drag over the screen.
