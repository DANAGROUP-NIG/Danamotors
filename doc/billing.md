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

## Credit application approval (issue #77, phases 1–2)

Credit application requests validate against `Invoice.outstandingAmount`, including receipt allocations, rather than recomputing outstanding from `Payment` rows. Amounts use the existing Decimal-backed money helpers. Requests that round below 0.01 and applications against cancelled invoices are rejected.

Approval through `POST /api/portal/credit/applications/:id/decision` locks and rechecks the application, customer, and invoice in a serializable transaction. It checks the current available credit and invoice outstanding before writing a dated adjustment batch, canonical ReceiptAllocation pairs, the consumed receipt/note balances, a compatibility USED credit transaction, the reduced invoice outstanding, the invoice status, and a `CREDIT_APPLICATION_APPROVED` audit record. Phase 2 does not insert a duplicate Credit Payment or hand-edit a separate wallet. Zero outstanding means Paid; a remaining balance means Partially Paid, matching receipt settlement. Confirmed P2034 serialization rollbacks retry at most twice with backoff, with 5-second acquisition and 15-second execution limits. Timeouts are not replayed. A repeated decision returns a conflict without another financial write. Declining uses a conditional Pending update so it cannot overwrite an approval. Notifications run after commit.

The accountant dashboard sums active invoice `outstandingAmount`, including standalone customer invoices and overdue balances, under the existing branch scope. Portal credit decisions already invalidate invoice, credit, dashboard, and profile queries, so phase 1 requires no frontend change.

Phase 1 required no migration. Phase 2 uses the party_adjustments migration below; historical outstanding repair remains phase 5.

## Party accounts and advance adjustment (issue #77, phase 2)

Available customer credit is the sum of active receipt advances and unadjusted credit notes/opening credits. Customer.creditBalance is retained as a read-only compatibility cache maintained by database triggers. Account and portal reads also aggregate the canonical documents. The legacy manual wallet endpoint is disabled. Legacy CustomerCreditTransaction records remain historical compatibility records; they are not the source of available credit.

Open **Finance → Advance Adjustment** (also in the sidebar), or **Customer → Account → Adjust balances**. Invoice payment capture has a preselected **Use existing advances / credits** link. Select the branch in the header, search the party by name/code, then select debit and credit documents. Both sides accept editable positive amounts with two decimal places. Save becomes available only when debit and credit adjusted totals are equal, positive and within current balances. The grids are paginated; selections persist across pages up to 200 per side. Each batch is capped at NGN 1,000,000,000,000 to keep currency totals within safe API numeric bounds.

FIFO previews the oldest 200 open documents per side in date/number order, matching the smaller total. It fills amounts for review and editing; it does not save automatically. Save and repeat for larger parties. Recent history shows 20 batches. Admin/SuperAdmin can reverse a batch with a remark; the API supports any batch ID. Reversal restores both document balances and retains each allocation with its reversal timestamp. Any involved invoice, receipt, note or batch exported/posted to Tally prevents reversal. No adjustment journal is produced.

All adjustments use ReceiptAllocation, including receipt advances applied after receipt capture and approved credit applications. PartyAdjustmentBatch groups the dated pairs and stores source, actor, amount, retry key and reversal metadata. Invoice status follows Paid/Partially Paid/Unpaid from its remaining balance; overdue calculation follows in phase 5. Financial writes lock the party and selected documents inside a bounded serializable transaction with at most two confirmed P2034 retries. Timeouts are not replayed. Retry with the same key **and identical date/details** after an uncertain response. A changed request with an already committed key returns 409. Refresh balances clears the current selection and starts a new request.

Receipt amount edits/cancellation are blocked while any later adjustment batch is active. Reverse those batches first. Narration-only receipt edits preserve allocations. Receipt editing and cancellation retain old rows with reversedAt instead of deleting allocation history; new entry adjustments use their edit date. Customer merges move canonical notes and batches along with receipts and invoices, retaining document branch snapshots and using the same serializable retry wrapper. Admin reversal follows the stored document IDs across the merged party, preserving receipt/note branch snapshots. New adjustments still require all selected documents in one branch. Standalone invoices continue to derive their branch from the customer, as in existing billing.

### Opening balances

Admin/SuperAdmin, with party:opening:create, can use **Customer → Account → Record opening balance**. Choose Debit (party owes us) or Credit (available to the party), opening date, positive amount and narration. The opening must belong to the customer branch. It creates a numbered PartyNote with type OPENING, its full remaining balance and tallyExcluded=true. Openings appear in the appropriate adjustment grid. Opening balances are excluded from Tally because they represent balances brought forward there. Full commercial debit/credit note capture and vouchers are phase 4.

### Permissions and endpoints

| Endpoint under /api/finance | Permission / restriction |
| --- | --- |
| GET /parties | receipt:adjust; bounded debtor lookup |
| GET /parties/:customerId/account | customer:read |
| GET /parties/:customerId/documents | receipt:adjust; pageSize ≤ 100 |
| GET /parties/:customerId/adjustments | receipt:adjust; latest 20 |
| POST /adjustments/fifo-preview | receipt:adjust |
| POST /adjustments | receipt:adjust |
| POST /adjustments/:id/reverse | Admin/SuperAdmin + receipt:adjust:reverse |
| POST /opening-balances | Admin/SuperAdmin + party:opening:create |

Branch users can only access their own branch and parties registered there. Admin/SuperAdmin can read all branches or select one; saves always name a branch and every selected document must belong to it. Default adjustment grants go to Admin, Accountant and BillingOfficer; reversal/opening grants go only to Admin (SuperAdmin bypass applies). Accountant also receives customer:read to use the Account tab. Refresh staff sessions after migration so new permission grants are reflected.

### Phase 2 deployment and reconciliation

1. Pause financial writes and take a database backup/snapshot. Run server/prisma/party-adjustment-preflight.sql on that snapshot. Review invalid currency, active advances, wallet credits/debits, approved credit applications and their matching legacy Payments. Invalid wallet/application currency aborts migration instead of silently losing value.
2. Apply 20261008120000_party_adjustments with prisma migrate deploy and generate the client, then deploy this application version before resuming writes. Do not use schema push: SQL check constraints, triggers, the partial receipt-entry index and backfill marker are required.
3. Positive legacy wallet balances become opening credits; negative balances become opening debits. Existing receipt advances remain their own independent credits. The expected available credit after cutover is the old positive wallet plus existing active receipt advances. Negative wallet obligations remain visible as debits. No net obligation is discarded.
4. Already approved legacy applications become fully consumed opening credits plus dated batches/allocations, linked to their matching Credit Payment when identifiable. Current invoice outstanding is **not repaired** by this migration. Legacy approvals created before the phase 1 fix must be reconciled in phase 5 before reversal; balance bounds deliberately reject an inconsistent restoration. If a legacy batch is reversed, its linked compatibility Credit Payment is removed atomically to avoid leaving a false payment.
5. Wallet opening dates use migration cutover time because original unspent-credit provenance is unavailable. Historical approval rows use decisionDate (createdAt fallback). Existing receipt allocations use receipt issuedAt; later edits/reversals now retain dates. Old deleted allocation versions cannot be reconstructed.
6. The backfill marker, stable legacy IDs/keys, sequence seeding and guarded inserts make rerunning the migration idempotent. Review PARTY_CREDIT_MIGRATED audit totals, then compare receipt advances plus active credit-note remaining amounts with Customer.creditBalance. Test the migrated snapshot using TEST_DATABASE_URL before production cutover.

New note amounts/batches use Decimal(18,2). Existing Float money columns are retained for compatibility and operated on through the Decimal-backed money helpers. Index comments explain party/date, branch/status, document-side/date and batch-history access paths. Historical as-on reports and their ledger link are phase 3; vendors remain outside scope.

Accountant customer-directory access introduced for the Account tab is restricted to the assigned branch, including detail, document and history reads. Missing branch assignment and global duplicate lookup are rejected for this role. Existing directory privileges for other roles are unchanged; finance account/adjustment endpoints independently enforce the finance branch policy.

## Party reports (issue #77, phase 3)

Reports → Finance now includes Party Ledger, Party Outstanding, Age-wise Outstanding and Bill-wise Outstanding. Customer → Account → View ledger preselects the party and its branch. Filters include dates, debtor account selector, party status, inclusive from/to party range, name/code order, branch, and credit-balance inclusion on age/bill reports. Vendor/creditor parties remain disabled through one frontend constant and server validation. Customer profile create/edit exposes CUSTOMER, DEALER and FA_PARTY independently of customer type.

The ledger includes original invoices, receipts, notes/openings, amount edits and cancellation reversals, plus neutral allocation/reversal match entries. Opening is before the first day; closing includes the last day. Adjustments redistribute document balances without changing party net. Age bands have five increasing boundaries (six buckets including the final over-limit band), default 30/60/90/120/180. Credits appear separately. Settings → Party reports lets Admin/SuperAdmin save company defaults with audit; each report run can override them.

All report calendar dates are Africa/Lagos (UTC+1). Cutoffs are next-day exclusive. Database numeric sums/window functions reconstruct as-on balances from original amounts, retained receipt amount edits, effective adjustment dates, reversal times and cancellation times, rather than current balance fields. Invoice branch is snapshotted at creation/backfill and retained across customer merges; receipt/note branches are retained. Newly recorded cancellations retain an explicit timestamp. Existing receipt cancellations use retained audit dates, with cutover as fallback when unknown. The report SQL views read the single ReceiptAllocation store.

API: GET /finance/party-reports (kind ledger/outstanding/age/bill); GET /finance/party-reports/parties; GET /finance/party-reports/export; GET /finance/party-reports/print; GET/PUT /finance/settings/party-reports. The four report permissions are report:party-ledger, report:party-outstanding, report:party-outstanding-age and report:party-outstanding-bill; Admin/SuperAdmin, Accountant and BillingOfficer receive defaults. Each data/print/export endpoint checks the specific report permission. Non-Admin requests are forced to their assigned branch; explicit foreign branch selections are rejected. Settings writes additionally require Admin role and age report permission.

JSON rows are paginated (max 100); totals cover the entire filter. Ledger and bill pages can continue a party, and retain whole-period opening/closing or net in the group header/footer. Print/export include all results in a single repeatable-read snapshot using a database cursor with 500-row fetches; no full register is loaded in server memory. Ledger/bill print starts each party on a new page. Excel export is a real SpreadsheetML XML workbook (.xml), with numeric cells, text escaping, formula-safe strings and totals. Open it in Excel; use Save As if .xlsx is needed. Supporting browsers stream to a chosen disk file; other browsers use a capped 20 MB fallback and require narrower filters above that limit. A disconnected/timed-out download fails rather than silently returning a complete workbook.

Historical limits: deleted legacy allocations and unknown old cancellation provenance cannot be reconstructed; cutover values are explicit. Later-dated matches, reversals, edits and cancellations preserve earlier balances. Backdated new documents are intentional book restatements, so those dates can change a previous report. Adjustment creation now rejects a date before the latest retained balance change on any selected document, preventing restored credits being spent before their reversal. Old outstanding cache inconsistencies remain for the phase 5 repair tool; reports derive amounts from canonical document/allocation history. Party identity/status is current master data, including merges; transactions are not separately duplicated under obsolete identities.


## Debit and credit notes (#77, phase 4)

PartyNote is the canonical debit/credit header. Receipt references and account lines are saved in PartyNoteReceiptLine and PartyNoteAccountLine, with receipt/account/party display snapshots. Creating a note is immutable and idempotent, using the existing party lock, serializable retries, Decimal validation and document sequence. Numbers are YYYY###### in independent debit/credit series (shared with the existing opening-note direction series).

A RECEIPT debit selects active receipts belonging to the party and branch, including fully adjusted or Tally-posted receipts. Each line is positive and no greater than that receipt's full amount; lines equal the header amount. This limit applies per note, not cumulatively across earlier debit notes. Receipt dates cannot be after the note's calendar day. The note creates a new debit; receipt balances and paid invoices are untouched. AMOUNT debits have no detail lines. Credits require active Tally ledger account lines whose Decimal sum equals the credit amount. Credits immediately participate in the derived wallet and existing adjustments/reports.

Note dates are Africa/Lagos calendar dates; future dates are rejected. Notes can be backdated deliberately. Cancellation requires the direction cancel permission, a remark, full remaining balance, no active adjustments and no confirmed Tally posting. After an eligible adjustment is reversed, an unposted restored note can be cancelled. Cancellation sets remaining to zero and records cancelledAt plus an audit; unconfirmed exported XML is invalidated. Opening balances remain excluded from these note APIs and Tally.

Endpoints under /finance:
- POST /party-notes — direction-specific create permission.
- GET /party-notes — direction-specific read permission; direction, from, to, optional branch/customer, page/pageSize.
- GET /party-notes/:id and /:id/print — direction-specific read permission.
- POST /party-notes/:id/cancel — direction-specific cancel permission and remark.
- GET /party-notes/parties, /customers/:id — bounded creation lookups.
- GET /party-notes/receipts — debitnote:create, active receipt number/cheque search, 25 per page.
- GET /party-notes/ledgers — creditnote:create, active code/name search, at most 100.
- GET /party-notes/register, /register/print, /register/export — report:debit-note-register or report:credit-note-register.

Admin/SuperAdmin can read all/selected branches; other users need an assigned branch and cannot request another. Creating a note requires a party registered in the selected branch. Accountant receives note CRUD-with-cancellation and both register permissions; BillingOfficer receives no note/register grants by default. Every input is validated with Zod. Amounts and line totals are validated again by the service.

Registers exclude OPENING notes. Their date filters select document dates; displayed balances and status are current, rather than as-on balances. Face amount totals include active and cancelled notes; cancelled remaining amounts are zero. Rows include saved customer code/name, narration, linked receipts/account splits, remaining, status and Tally reference. Normal pages are bounded to 100; print/Excel reads bounded 250-note pages from one repeatable-read snapshot with backpressure. Export uses the phase 3 Excel XML (.xml) mechanism, browser disk streaming and bounded 20 MB fallback. Historical party reports automatically include note creation and dated cancellation through the existing views.

TallyDocumentType now includes DEBIT_NOTE and CREDIT_NOTE. Debit vouchers debit the mapped party and credit the active account mapped for DEBIT_NOTE / RECEIPT or AMOUNT. Credit vouchers credit the party and debit each saved line's currently active account. Credit bill allocations use Agst Ref for active matches and On Account for any remainder. All voucher entries must balance; missing/inactive mappings or inconsistent balances are skipped with a reason. Saved account code/name is retained for display; Tally resolves the current active master name at export.

Use the existing Tally export/confirm endpoints. XML export records a pending log and audit; confirmed voucher reference sets tallyPostedAt and a posting audit. Note read permission is required for note listing/export/confirmation, and pending batch payloads omit note types the user cannot read. Cancelled/excluded notes are never eligible. An XML file that has already been imported must be confirmed promptly; the app cannot detect an unconfirmed external Tally import. Advance adjustments still generate no journal.

Frontend: Finance → Receipts → Debit Note / Credit Note; Reports → Finance → note registers. Forms use the shared modal, fields, table and picker, read-only party address, editable receipt/account grids and live sticky-footer totals. Account line Enter adds a line. Note details offer print, eligible cancellation with remark, and the existing party adjustment link. Mutations refresh affected party wallet, note, report and Tally query caches.
