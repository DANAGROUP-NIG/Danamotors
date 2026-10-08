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

Selecting a catalogue service pre-fills its price as the job-card service charge. If the API caller omits the charge, job opening snapshots the catalogue price; an explicit zero remains a waiver. Unbilled, open job cards can correct the charge in Workshop actions. Bills show the selected service name and saved charge exactly once, including zero-value service lines; they never reprice from the current catalogue. Existing issued bills remain immutable.

## Estimate-to-payment workflow

1. Open the card and confirm the selected service charge. Service types retain their existing charging behavior.
2. In **Estimate & Approval**, draft the service, parts and labour scope. The selected service appears once. Part estimates use retail rates; labour uses model-specific pricing. Explicitly mark any parts or labour included in the service package: these remain recorded but carry no additional bill charge.
3. Submit a priced revision and record the bill-to customer's approval or decline, with decision notes. Saved revisions and decisions are immutable. Only the newest revision may be approved; saving another revision pauses authorization until that revision is approved.
4. Record actual parts and labour within approved quantities/hours and rate limits. Additional work requires a revised estimate. Unused approved work is not billed. Returning parts reduces actual quantities.
5. Record a passed QC and mark the vehicle Ready. Readiness validates the recorded scope. Revising a Ready job returns it to QC, clears its QC result and prior credit approval, and requires another approval and QC pass.
6. Review **Approved estimate vs actual charges** when billing. Differences are shown before discounts/VAT/round-off. Unknown lines, excess quantities and higher rates block billing even if the overall total is lower. Approved package inclusions become zero-charge bill lines. The service charge is carried from the approved revision; its estimate ID is recorded in the billing status-history entry.
7. Receive payment against the bill. Delivery requires a fully paid bill or explicit admin credit approval; credit can be approved for Ready or Billed jobs. Receipts and bill cancellation retain their existing accounting safeguards.

Existing issued bills are unchanged. Existing unbilled jobs must obtain an approved estimate before additional work or billing. This change uses the existing estimate tables and requires no schema migration. Included package components are stored as INCLUDED_PART / INCLUDED_LABOUR estimate line types. Drafts are local until submitted; every saved submission is a new immutable revision.

## Credit application approval (issue #77, phase 1)

Credit application requests validate against `Invoice.outstandingAmount`, including receipt allocations, rather than recomputing outstanding from `Payment` rows. Amounts use the existing Decimal-backed money helpers. Requests that round below 0.01 and applications against cancelled invoices are rejected.

Approval through `POST /api/portal/credit/applications/:id/decision` locks and rechecks the application, customer, and invoice in a serializable transaction. It checks the current available credit and invoice outstanding before writing a Credit payment, a USED credit transaction, the wallet deduction, the reduced invoice outstanding, the invoice status, and a `CREDIT_APPLICATION_APPROVED` audit record. Zero outstanding means Paid; a remaining balance means Partially Paid, matching receipt settlement. Confirmed P2034 serialization rollbacks retry at most twice with backoff, with 5-second acquisition and 15-second execution limits. Timeouts are not replayed. A repeated decision returns a conflict without another financial write. Declining uses a conditional Pending update so it cannot overwrite an approval. Notifications run after commit.

The accountant dashboard sums active invoice `outstandingAmount`, including standalone customer invoices and overdue balances, under the existing branch scope. Portal credit decisions already invalidate invoice, credit, dashboard, and profile queries, so phase 1 requires no frontend change.

This phase needs no migration and does not repair historical approvals. Wallet unification and historical balance repair are delivered in later issue #77 phases.
