# Billing, Receipts, and Tally

## Job bills

Job bills are created only from job cards in `Ready`, `Completed`, or credit-approved `Delivered` status. Part lines use issued quantity less recorded returns at the part's recorded `retailRate`; labour lines use the recorded job-card hours/rate. The service snapshots each line and calculates all totals on the server. The billing user may enter parts/labour discount percentages (0-100), a service advisor, and notes. A parts discount is rejected when no billable parts remain.

The opening service charge is a separate SERVICE line, without a labour discount. VAT is applied to discounted labour plus the service charge. Configure its percentage with `JOB_BILL_VAT_RATE` (defaults to `7.5`); each invoice stores the rate and computed VAT. Round-off is to the nearest whole currency unit. Document numbers use `YYYY######` and the transactional `DocumentSequence` table. A partial unique index permits one active bill per job card. Cancellation requires a remark, refuses bills with receipts/payments or a Tally posting, and releases the job card for re-billing.

## Receipts

Receipt capture supports `CASH`, `POS`, `CHEQUE`, and `BANK_TRANSFER`. Cheque requires its number and date. All non-cash modes require an active receiving bank; Access Bank (`A0004`) is seeded. A receipt can allocate to multiple invoices for the same customer; the remainder is an advance. Invoice row locks and a serializable transaction protect balances. Edits are limited to amount and narration and are audited; cancellation reverses allocations. Neither is allowed after Tally export or posting. Narration-only edits preserve allocations and advances. Receipt capture uses a stable idempotency key to protect retries.

The receipt register filters by date and the explicit `SERVICE_PARTS` / `SALES_ENQUIRY` category, returns totals by mode and a grand total, and exports to Excel. Branch users are constrained to their assigned branch.

## Tally file exchange

Import ledger rows as tab- or comma-separated `code, name` values. Imported ledger codes are unique; customer mappings and account mappings must reference active imported ledgers. The batch screen selects unexported job bills or receipts for a date, reports unmapped customers/missing account mappings, and downloads Tally voucher XML. Export creates an `EXPORTED` log but does not claim the voucher was posted. After importing the file in Tally, enter the voucher references to confirm; the log and document then become `POSTED` and cannot be exported twice.

Job bill account mappings use `PARTS_SALES`, `LABOUR_SALES`, `SERVICE_SALES`, `PARTS_DISCOUNT`, `LABOUR_DISCOUNT`, `VAT`, and `ROUND_OFF`. Receipt mappings use `BANK` or `CASH`. The XML generator is the integration boundary; direct HTTP posting is intentionally not enabled because server-to-Tally connectivity has not been confirmed.

## Deployment and migration

1. Run the read-only preflight at `server/prisma/billing-migration-dry-run.sql` against a production database snapshot. Resolve any job cards with multiple active bills before deployment; the partial unique index will intentionally reject that data.
2. Review payment-to-receipt conversion candidates and matching legacy receipt rows. The migration links exact invoice/amount/timestamp matches instead of creating a duplicate; historical receipts without an identifiable issuer are imported with a null issuer.
3. Apply the additive migration with `npx prisma migrate deploy`, then run `npx prisma generate`.
4. Configure `JOB_BILL_VAT_RATE` and run the normal role/permission seed if custom role data is maintained separately.
5. Confirm the BillingOfficer role exists, map customer ledgers and Tally accounts, and test XML import against a Tally company backup before production posting.

The migration backfills receipt numbers, customer links, receipt allocations, converted payment receipts, outstanding balances, the Access Bank master, and permission records. Existing invoices without line snapshots remain readable, but their original line composition cannot be reconstructed from the current database alone.

The billing_receipt_integrity migration adds service-charge snapshots, receipt branch snapshots (backfilled from allocation, issuer, or customer), and unique receipt retry keys. Pending Tally batches can be resumed after refreshing the screen. Apply migrations before deploying this application version. Database integration checks require a separate TEST_DATABASE_URL.

Job-bill creation batches line inserts and avoids loading unrelated labour/appointment records. Its serializable transaction allows up to 5 seconds to acquire a connection and 15 seconds to complete. Only confirmed serialization/deadlock rollbacks (P2034) are retried, at most twice with backoff; timeout and connection errors are not replayed. On a busy-database response, refresh the job card and check for an existing bill before retrying.

Receipt creation returns a supported integer from the advisory-lock query (PostgreSQL lock functions return void), batches allocation inserts, and uses the same bounded 5-second acquisition / 15-second execution limits. Confirmed serialization rollbacks are retried twice. Identical requests reuse their original receipt; changed details with a committed request key are rejected. Payment responses include updated invoice balances, and reopening payment capture fetches fresh balances.
