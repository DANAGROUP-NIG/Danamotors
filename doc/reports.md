# Workshop monthly reports

Open **Reports → Monthly**. Ten cards are visible only with their individual `report:<slug>` permission. The Receipt Register is now under Finance at `/reports/finance/receipt-register`; its API remains unchanged. Monthly APIs live at `GET /api/reports/<slug>`, with OpenAPI descriptions at `/api/docs`.

| Code | Slug | Print |
|---|---|---|
| M1 | tax-register | A4 landscape / 132 columns |
| M2 | booked-vs-availed | A4 portrait / 80 columns |
| M3 | estimate-vs-job | A4 landscape / 132 columns |
| M4 | unbilled-parts | A4 landscape / 132 columns |
| M5 | corporate-bills | A4 portrait / 80 columns |
| M6 | delivered-model | A4 portrait / 80 columns |
| M7 | delivered-service | A4 portrait / 80 columns |
| M8 | warranty-attended | A4 portrait / 80 columns |
| M9 | warranty-parts | A4 portrait / 80 columns |
| M10 | vehicle-history-card | A4 portrait, section breaks |

All period reports require an ordered `from`/`to` range of at most 366 inclusive days. Dates use Lagos calendar days including the entire end day. Cancelled/void jobs and bills are excluded. PDI services (`preDelivery` or code PDI) are excluded except history with explicit `includePdi=true` plus `pdi:read` from issue #69. No portal route exposes the internal history card. Portal job reads exclude PDI and internal staff names.

Ordinary users are forced to their branch; missing branch assignment or another branch ID returns 403. Admin/SuperAdmin may select a branch or omit it for all branches. Screen data comes from server queries and aggregation, with `{rows,groups,totals,filters,warnings}`. Filters stay in the URL when Run is selected. Changed filters apply on Run; exporting or printing uses the last successful result. Excel is a genuine XLSX workbook using the already-installed SheetJS dependency. Each section is a sheet, with identical rows and server totals. Browser print handles printer, copies and page range.

Amounts use existing Prisma.Decimal money helpers. Unknown tax IDs and free-service sequence are blank because those fields are not recorded. Unknown warranty coverage is counted separately rather than declared beyond warranty. Missing opening snapshots use historical job date/mileage and current policy, with a **calculated** marker; later vehicle mileage is never substituted for missing historical mileage.

M2 ignores appointment status for conversion. A matching linked job or same-vehicle job must fall within the booked day and grace days (default 0), using local calendar days. Jobs without appointment links remain walk-ins. M3 matches parts by part ID and labour by operation ID/code; returns reduce actual quantities. Standalone estimates require branch/customer/vehicle metadata. Legacy estimates use createdAt and their ID when number/date are absent. New job-linked estimates receive a document number/date. The daily issue's standalone estimate creation/approval UI remains separate; this issue adds storage and reporting support.

M4 deducts net accepted returns and active billed quantities. New invoice lines retain the exact job-line link; legacy invoice quantities are allocated once over chronological matching customer-paid part lines. Warranty/FOC/goodwill lines stay unbilled unless an active invoice explicitly links them; exact links are deducted regardless of who pays. Accessories count as spares. Unclassified legacy categories are visible with Both and excluded by specific category filters.

M1 reads authoritative stored invoice VAT and amounts. The tax register exposes the issue's spares, oil, accessories, discount, taxable parts, parts VAT, labour, service charge, labour VAT, round-off and net total.  Cash/credit/both, displayed bill-number or date ordering, address, bill-type page breaks and detail/annexure modes apply. Counter-sale selection is hidden.

An annexure row whose category/rate is unknown stays unallocated. Partial or inconsistent snapshots receive an explicit `UNALLOCATED_DIFFERENCE` VAT adjustment, so annexure VAT always equals selected stored bill VAT; no database values change. Unknown money remains blank, while a confirmed absent category is zero. Legacy report snapshots can supply recorded labour VAT without implying a category split for parts. Missing historical bill types are **UNCLASSIFIED**, included with Both and excluded from Cash/Credit; no payment-status or later approval inference. New bills keep the existing explicit approved-credit classification.

M5 groups invoices by the **current vehicle corporate group**, independently of customer ownership. Historical fleet membership is not recorded. Admin/SuperAdmin manage shared groups, active status and VIN memberships at `/reports/corporate-groups`. Excel import reads the first sheet's VIN column, displays values for review, and applies on Add vehicles. Unknown VINs reject the whole import. Moving an existing membership requires an explicit checkbox. Every change is audited. Inactive groups remain reportable for historical bills.

M6/M7 count delivered jobs once by deliveredAt (two visits by one vehicle are two jobs). Optional delivery detail is included in screen/print/workbook. Targets are omitted pending business confirmation. M9 requires WARRANTY part lines; claim generation means submitted or subsequent status, or submission in status history. Billed-only requires an active invoice, not a stale billedAt timestamp. Technician is obtained from labour lines. Job type is hidden until its business meaning and data exist. Engineer is a distinct optional field and role, not an alias for technician.

Report jobs are capped at 10,000 with an explicit validation error, never silent truncation. Vehicle history searches require narrowing above 100 results; visits are counted in SQL without loading every search result's history. M9 uses `GET /api/reports/vehicle-options` for branch-scoped VIN/registration search and UUID keyset pagination (25 per page, maximum 100), with no 1,000-record cap. Selected IDs are re-resolved inside the same branch scope. Canonical vehicle models and legacy workshop models both appear in model selections. Large-date-range performance must be measured on a representative QA dataset.

Legacy `vehicle_history_card.sql` and `workshop_bill_report.sql` were not supplied or found. Implemented history sections follow the issue's explicit list; legacy-query parity remains pending those files. See [progress](progress/issue-79-progress.md) and [tester walkthrough](testing/issue-79-frontend-walkthrough.md).


## Historical tax-register reference (not an output option)

The former 24-column photo layout is no longer an output option. M1 renders the category/VAT columns specified in #79. Stored legacy snapshot data remains available for original document numbers and verified VAT values; this change does not erase or rewrite historical invoice data.

Optional Invoice.taxRegisterSnapshot stores verified report-only values (schema version 1). New job bills snapshot the current billing calculation; there are no handling/surcharge/WCT inputs in current billing, so these amounts are zero for new bills. Government allocation is unknown where not recorded and remains blank. Historical bills without this snapshot or category breakdown show unknown values as dashes; a total involving an unknown entry stays unknown rather than presenting a misleading partial sum. Stored invoice net total and rounding remain authoritative.

The supplied Kia Plaza cohort has been enriched via prisma/legacy/enrich-tax-register.cjs, after a dry run. It fills only empty snapshots or missing original-document metadata and refuses conflicting values; financial invoice fields are not updated. Source discountamt is a percentage, while DiscountAmount is the stored parts discount amount. Labour includes internal labour and service charge after labordiscount, plus external labour after its separate discount. Parts with a positive stored tax rate/amount are shown under Taxable; the zero-tax bucket uses the combined Tax paid/non-taxable heading and does not assert VAT exemption. GovtVehicle supplies the source government split. All 75 source bills reconcile within one kobo; seven require a rounding note. Source I/Z billing flags and unverified imported tax-category provenance are not guessed: unclassified imported cash/credit bills appear separately and do not enter Cash-only/Credit-only results. Their category VAT annexure remains legacy-unallocated until category mappings are verified.

Historical seed verification recorded before this local-only audit: 74 active bills, all 24 fields present, original document numbers present, net total NGN 7,422,930. See testing/issue-79-tax-register-verification.json. Synthetic component/print/XLSX evidence is in testing/issue-79-tax-register-preview; it contains no customer export data.


## History and verification

With all detail options enabled, M10 has eleven sections. Current and earlier owners share the customer section; cost per kilometre and repeat jobs share the last section. Staff names appear only in authorized internal job visits. Each section has an explicit column schema even when empty; print starts each subsequent section on a new page and Excel produces one sheet per included section, without an extra summary sheet. Options remove their sections. Portal job queries retain cancellation/PDI exclusions even when a status is requested; internal staff names and PDI-linked credit applications are not exposed.

The audit uses a disposable localhost PostgreSQL database. See [audited progress](progress/issue-79-progress.md), [before/after gaps and actual results](testing/issue-79-audit.md), and [component/XLSX verifier](testing/verify-monthly-report-output.cjs). Existing preview files are historical; current synthetic captures are under ignored `.audit-local/visual`. Authenticated role-matrix and production-scale performance testing are separate from those component checks.


## Issue scope correction

Issue #79 is authoritative. The duplicate metric cards above report output are removed. Table footers, required subtotals/grand totals, M2's service-type summary and M4's selectable per-job/per-charge summary remain.

M7 is the requested delivery-date by actual service-type grid, with every delivered job counted once. The additional free-service-sequence table, hard-coded service buckets and accidental-excluding total are removed. M5 groups by corporate membership with its required bill columns and one subtotal per corporate; extra customer/bill-type subdivisions are removed. M2, M4 and M9 expose the issue's full column sets, rather than photo-only columns that hid required fields. M1 uses the issue's category/VAT columns; the extra legacy-layout selector is removed. Historical report snapshots remain readable and invoice amounts are unchanged.
