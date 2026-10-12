# Issue 77 frontend verification - 2026-10-09

Issue: https://github.com/DANAGROUP-NIG/Danamotors/issues/77

## Scope

This verification covers the receipts + party-account frontend workflows for Issue 77:
- Openings (opening credit / opening debit)
- Advance receipts
- Advance adjustments (manual)
- Adjustment reversal

Additional screens (Debit/Credit notes, Update Outstanding, Outstanding Letters) are reachable; Phase 4+ end-to-end execution is in progress in this run.

## Executed acceptance (today)

A tool-controlled browser session logged in to `http://localhost:3000` as SuperAdmin (Port Harcourt Branch) and executed the Phase 2 party-account scenarios (openings, advance receipt, manual adjustment + reversal, FIFO preview/save + reversal).

Acceptance log: `doc/issue-77-frontend-acceptance-results.md`

## Key outcome

- Reproduced a blocking backend validation error preventing manual adjustments from saving: `Adjustment date cannot precede a selected document`.
- Fixed the validation to compare on calendar-day boundaries (UTC) so same-day adjustments work as intended.
- Found a FIFO preview edge-case where same-day documents were excluded (timezone/timestamp comparison), causing `No outstanding debits and available credits can be matched`.
- Fixed FIFO preview + funding-credit selection to compare by calendar date (`d.date::date <= ${date}::date`).

Code change:
- `server/src/modules/finance/party-account.service.ts`

## Screens confirmed reachable (smoke)

- `/finance`
- `/finance/receipts/advance-adjustment`
- `/finance/receipts/debit-notes`
- `/finance/receipts/credit-notes`
- `/finance/receipts/update-outstanding`
- `/finance/receipts/outstanding-letters`
- `/payments`
