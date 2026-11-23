# Advance receipt layout

- Reuse the completed bill's document structure: header/status/date, customer/payment details, payment table, aligned totals, allocations and received-by footer.
- Both advance and normal receipts render through a shared presentational ReceiptDocument component; fetching and permission checks remain in ReceiptPrint.
- Advance receipts retain their original estimate/version, cumulative advances, paid percentage, estimated balance and excess snapshot. Current allocations remain separate from the amount received.
- Use existing Tailwind tokens and currency/date helpers, with print controls hidden and document tables sized for printing. No financial calculations, API changes, new dependencies or database writes.
- Validation: scoped ESLint, frontend typecheck, editor diagnostics and whitespace checks passed. No browser or production build run; visual print verification remains pending.
