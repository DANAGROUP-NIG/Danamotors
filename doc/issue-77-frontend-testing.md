# Issue #77 frontend test walkthrough — source notes

This working document supplies the final Word walkthrough requested by the user. Export and visually verify the completed .docx after all five implementation phases. Do not describe unfinished flows as available.

## Prerequisites

Use a migrated test database and staff accounts for Admin, Accountant/BillingOfficer, and a user without receipt:adjust. Refresh sessions after permission changes. Select the intended branch in the header. Create a test customer and unposted invoices/receipts. Keep a second branch/customer for access tests. Do not run testing against production financial records.

## Phase 2: advances, openings and adjustments

1. Open Customer → Account. Record an opening **credit of NGN 2,000** with a date before the planned adjustment and a narration. Expect available credit 2,000. Only Admin/SuperAdmin with the opening permission sees the action.
2. Open Finance → Payment Receipt, choose the customer, receive **NGN 5,000** without allocating it. Expect a receipt advance of 5,000 and combined available credit **7,000** on the Account tab and portal.
3. Create an unposted invoice with outstanding **NGN 10,000**. Open its receipt capture and choose **Use existing advances / credits**. The adjustment workspace should preselect the customer.
4. Select that invoice as Debit and the advance receipt as Credit. Enter **3,000** on both sides. Expect difference 0 and enabled Save. Save once. Invoice outstanding becomes **7,000**, receipt available becomes **2,000**, combined credit becomes **4,000**. Net outstanding stays **3,000** because adjustment moves equal debit and credit amounts.
5. Enter unequal amounts, more than an available document balance, zero, a negative amount, or three decimal places. Expect inline validation and disabled Save. Changing pages preserves selected amounts and totals. Refresh balances clears the selection.
6. Enable FIFO. Expect oldest date/number first and editable amounts. With the preceding fixture, it should match remaining credit **4,000** against the invoice. Save; invoice outstanding becomes **3,000**, credits become **0**. No new cash receipt or Tally adjustment journal is created.
7. As Admin, reverse the FIFO batch from Recent adjustments with a reason. Expect invoice outstanding **7,000**, combined credit **4,000**, status Reversed and saved reason. A second reversal is rejected. Accountant/BillingOfficer can adjust but cannot reverse or record openings.
8. Try changing the original receipt amount or cancelling it while the manual batch is active. Expect a message requiring reversal first. Narration-only editing should preserve balances. Reverse the manual batch, then cancellation may proceed if the receipt is unposted.
9. Export/post an involved test invoice or receipt using the existing Tally flow. Try reversal; expect rejection with no balance change. Use a separate test fixture/company backup for Tally.
10. Record an opening **debit** with date/narration. Expect it in Debits and in Account outstanding; it may be matched against a receipt or opening credit. It must never appear in Tally posting batches.
11. As an assigned branch user, search and direct navigation must not expose a foreign branch party or documents. Admin can select another branch. A party with no matching documents shows an empty state.
12. Create a credit application for an invoice, approve it in the customer portal, and verify invoice outstanding plus available credit decrease by the approved amount. Approval uses the same canonical allocation records; repeated approval creates no second adjustment. Decline changes no balance.

Evidence to capture: before/after Account totals, invoice outstanding, debit/credit grids, FIFO amounts, reversal reason/status, permission/access errors, and Tally reversal rejection. Browser screenshots and executed manual results will be recorded separately from automated test evidence.

## Remaining walkthrough coverage

Add delivered flows for phase 3 reports/printing/Excel, phase 4 debit and credit notes/registers/Tally, and phase 5 recalculation/overdue/letters before generating the final Word document.

Accountant access check: the customer directory and customer detail/document/history reads must stay within the assigned branch. An Accountant without a branch cannot read these screens. Global duplicate lookup is unavailable to Accountant. Admin can open another branch’s customer Account tab.
