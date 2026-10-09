# Issue 77 frontend acceptance results - 2026-10-09

Tester: Emma
Role: Super Admin
Branch: Port Harcourt Branch
Environment: Local http://localhost:3000 (disposable test DB confirmed)

This run follows the scenarios in `doc/issue-77-frontend-testing.md` (Phase 2 focus: openings, advances, adjustments, reversal). Where the guide calls for creating an invoice, I used an Opening Debit as a lightweight fixture (still exercises the same party-account adjustment UI and balances).

## Fixture A (Customer I000001)

Customer
- Name: Issue77 Acceptance-20261009
- CustomerId: b63710c1-fbf8-44a1-a4c7-92fc86221bef

Created documents
- Opening credit NOTE: 2026000006 (date 2026-10-01, amount NGN 2,000)
- Advance receipt: 2026000008 (date 2026-10-09, amount NGN 5,000, no allocation)
- Opening debit NOTE: 2026000001 (date 2026-10-09, amount NGN 10,000)

Observed balances (Customer -> Account)
- After opening credit: Unadjusted credits NGN 2,000; Net outstanding -NGN 2,000
- After receipt: Unadjusted credits NGN 7,000; Net outstanding -NGN 7,000
- After opening debit: Outstanding debits NGN 10,000; Unadjusted credits NGN 7,000; Net outstanding NGN 3,000

Attempted actions
- Advance Adjustment: select debit NOTE 2026000001 and receipt 2026000008; enter 3,000/3,000
- Result: Failed with toast `Adjustment date cannot precede a selected document` (HTTP 400). Reproducible.

## Backend fix (enables same-day adjustments)

Problem
- `server/src/modules/finance/party-account.service.ts` compared full timestamps (`document.date > date`), which rejected valid same-day adjustments in this environment.

Fix applied
- Compare by calendar day (UTC) for both document date and latest activity date.
## Backend fix (FIFO preview date filtering)

Problem
- FIFO preview could incorrectly exclude same-day documents and return toast: `No outstanding debits and available credits can be matched`.
- Root cause: FIFO SQL used a full timestamp comparison against `now`/selected date (timezones made "same day" documents appear in the future).

Fix applied
- In `server/src/modules/finance/party-account.service.ts`, FIFO preview and funding-credit selection now compare by calendar date:
  - from `date <= ${date}`
  - to `d.date::date <= ${date}::date`
- Note: an intermediate attempt using `date::date` caused a 500 due to ambiguity; the final fix qualifies the column with alias `d`.


## Fixture B (Customer I000002)

Customer
- Name: Issue77B Acceptance2-20261009
- CustomerId: 81ac8608-d827-4c54-856b-38224c4019bc

Created documents
- Opening credit NOTE: 2026000007 (date 2026-10-09, amount NGN 2,000)
- Advance receipt: 2026000009 (date 2026-10-09, amount NGN 5,000, no allocation)
- Opening debit NOTE: 2026000002 (date 2026-10-09, amount NGN 10,000)

Manual adjustment (post-fix)
- Selected debit NOTE 2026000002 and receipt 2026000009
- Entered 3,000 on both sides and saved successfully
- Observed balances updated:
  - Outstanding: NGN 7,000
  - Unadjusted credits: NGN 4,000
  - Net balance: NGN 3,000
  - Recent adjustments shows: `ADVANCE ADJUSTMENT NGN 3,000 Active`

Manual adjustment reversal (verification)
- Reversed the adjustment once to confirm reversal UI/permissions.
- Reason used: `Issue77 acceptance test reversal`
- Observed:
  - Batch status changed to Reversed and reason displayed
  - Balances returned to: Outstanding NGN 10,000; Unadjusted credits NGN 7,000; Net balance NGN 3,000

Manual adjustment (restored baseline for later phases)
- Created another adjustment of NGN 3,000 between debit NOTE 2026000002 and receipt 2026000009.
- Current balances for Fixture B baseline (with adjustment Active):
  - Outstanding: NGN 7,000
  - Unadjusted credits: NGN 4,000
  - Net balance: NGN 3,000

FIFO scenario (post FIFO-date fix)
- With Fixture B baseline above, executed FIFO preview and saved two FIFO batches:
  - FIFO batch 1: NGN 2,000 (consumed opening credit NOTE)
  - FIFO batch 2: NGN 2,000 (consumed remaining advance-receipt credit)
- Observed after both FIFO batches Active:
  - Outstanding: NGN 3,000
  - Unadjusted credits: NGN 0
  - Net balance: NGN 3,000

FIFO reversal (restore baseline)
- Reversed both FIFO batches to restore the baseline balances (so later scenarios still match the guide numbers).
- Reasons used:
  - `Issue77 FIFO acceptance reversal`
  - `Issue77 FIFO acceptance reversal (opening credit)`
- Observed after reversals:
  - Outstanding: NGN 7,000
  - Unadjusted credits: NGN 4,000
  - Net balance: NGN 3,000

## Notes / gaps

- Phase 2 (openings + advances + manual adjustment + FIFO + reversals) is complete with expected balances.
- `/payments` list view did not surface the newly created unallocated advance receipts in the table (but they were reflected correctly in Customer -> Account and in the Advance Adjustment credits list). This may be expected behavior (list shows allocations), or a UI gap.

## Resume point

- UI is currently in Phase 4 (Debit/Credit Notes). Page: `http://localhost:3000/finance/receipts/debit-notes` with a New debit note modal open for Fixture A (Customer I000001).

## Phase 4 continuation attempt - 2026-10-09

- Attempted to attach Browser to the recorded debit-note page. The tool reported `trusted Node process exited unexpectedly` and reset its kernel.
- Retried browser inventory after the reset. It failed before page access with `windows sandbox failed: helper_unknown_error: setup refresh had errors` (kernel exit code 1).
- No Phase 4 scenario was executed in this continuation; no note was saved and no financial records were changed. This infrastructure error is not a failed application acceptance check.
- Resume with the recorded New debit note for Fixture A: plain AMOUNT debit of NGN 500.00, required narration, then verify its saved number, Active status, outstanding amount and print output. Confirm the current page/form state before submitting.

## Phase 4 automated recheck - 2026-10-09

Executed with `C:/Program Files/nodejs/node.exe` in `server`:

`node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/modules/finance/party-note.test.ts src/modules/finance/tally-notes.service.test.ts src/modules/finance/tally-xml.test.ts`

Result: **3 suites passed; 34 tests passed; 0 failures**. Coverage includes note money/line validation, receipt eligibility/limits, cancellation and branch/permission guards, pending Tally permission isolation and voucher XML.

The PostgreSQL integration suite was not rerun: `TEST_DATABASE_URL` is not configured in this terminal. Earlier integration results are documented in the progress log and are not new acceptance evidence.

Browser was retried and again exited before page access with the Windows sandbox setup-refresh error. Phase 4 live acceptance remains **blocked**, not complete. No note submission, print preview, Excel opening or external Tally-company import was performed in this recheck. Existing fixtures were preserved.
