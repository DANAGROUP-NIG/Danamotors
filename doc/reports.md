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

M1 reads authoritative stored invoice VAT and amounts. The optional `layout=CATEGORY` exposes the issue's spares, oil, accessories, discount, taxable parts, parts VAT, labour, service charge, labour VAT, round-off and net total. `layout=LEGACY` is now the default and retains the 24 photographed charge columns. Cash/credit/both, numeric displayed bill-number or date ordering, address, bill-type page breaks and detail/annexure modes apply to both layouts. Counter-sale selection is hidden.

An annexure row whose category/rate is unknown stays unallocated. Partial or inconsistent snapshots receive an explicit `UNALLOCATED_DIFFERENCE` VAT adjustment, so annexure VAT always equals selected stored bill VAT; no database values change. Unknown money remains blank, while a confirmed absent category is zero. Legacy report snapshots can supply recorded labour VAT without implying a category split for parts. Missing historical bill types are **UNCLASSIFIED**, included with Both and excluded from Cash/Credit; no payment-status or later approval inference. New bills keep the existing explicit approved-credit classification.

M5 groups invoices by the **current vehicle corporate group**, independently of customer ownership. Historical fleet membership is not recorded. Admin/SuperAdmin manage shared groups, active status and VIN memberships at `/reports/corporate-groups`. Excel import reads the first sheet's VIN column, displays values for review, and applies on Add vehicles. Unknown VINs reject the whole import. Moving an existing membership requires an explicit checkbox. Every change is audited. Inactive groups remain reportable for historical bills.

M6/M7 count delivered jobs once by deliveredAt (two visits by one vehicle are two jobs). Optional delivery detail is included in screen/print/workbook. Targets are omitted pending business confirmation. M9 requires WARRANTY part lines; claim generation means submitted or subsequent status, or submission in status history. Billed-only requires an active invoice, not a stale billedAt timestamp. Technician is obtained from labour lines. Job type is hidden until its business meaning and data exist. Engineer is a distinct optional field and role, not an alias for technician.

Report jobs are capped at 10,000 with an explicit validation error, never silent truncation. Vehicle history searches require narrowing above 100 results; visits are counted in SQL without loading every search result's history. M9 uses `GET /api/reports/vehicle-options` for branch-scoped VIN/registration search and UUID keyset pagination (25 per page, maximum 100), with no 1,000-record cap. Selected IDs are re-resolved inside the same branch scope. Canonical vehicle models and legacy workshop models both appear in model selections. Large-date-range performance must be measured on a representative QA dataset.

Legacy `vehicle_history_card.sql` and `workshop_bill_report.sql` were not supplied or found. Implemented history sections follow the issue's explicit list; legacy-query parity remains pending those files. See [progress](progress/issue-79-progress.md) and [tester walkthrough](testing/issue-79-frontend-walkthrough.md).


## Tax register layout (legacy reference photos)

The optional `layout=LEGACY` returns a 24-column layout grouped into Bill details, Taxable, Tax paid/non-taxable, and Labour/bill total. It includes spares, discounts, handling, taxable amount, government/non-government UPST and surcharge, other charges/subtotals, labour amount, labour VAT, WCT, round off and stored net total. Original legacy document numbers are displayed from the report snapshot. Grouped headings, labels and ordering are shared by screen, print and XLSX; grand totals exclude empty identity columns. Monetary columns use two decimal places. The wide grid scrolls internally on mobile, and landscape print wraps headings to fit.

Optional Invoice.taxRegisterSnapshot stores verified report-only values (schema version 1). New job bills snapshot the current billing calculation; there are no handling/surcharge/WCT inputs in current billing, so these amounts are zero for new bills. Government allocation is unknown where not recorded and remains blank. Historical bills without this snapshot or category breakdown show unknown values as dashes; a total involving an unknown entry stays unknown rather than presenting a misleading partial sum. Stored invoice net total and rounding remain authoritative.

The supplied Kia Plaza cohort has been enriched via prisma/legacy/enrich-tax-register.cjs, after a dry run. It fills only empty snapshots or missing original-document metadata and refuses conflicting values; financial invoice fields are not updated. Source discountamt is a percentage, while DiscountAmount is the stored parts discount amount. Labour includes internal labour and service charge after labordiscount, plus external labour after its separate discount. Parts with a positive stored tax rate/amount are shown under Taxable; the zero-tax bucket uses the combined Tax paid/non-taxable heading and does not assert VAT exemption. GovtVehicle supplies the source government split. All 75 source bills reconcile within one kobo; seven require a rounding note. Source I/Z billing flags and unverified imported tax-category provenance are not guessed: unclassified imported cash/credit bills appear separately and do not enter Cash-only/Credit-only results. Their category VAT annexure remains legacy-unallocated until category mappings are verified.

Historical seed verification recorded before this local-only audit: 74 active bills, all 24 fields present, original document numbers present, net total NGN 7,422,930. See testing/issue-79-tax-register-verification.json. Synthetic component/print/XLSX evidence is in testing/issue-79-tax-register-preview; it contains no customer export data.


## History and verification

With all detail options enabled, M10 has eleven sections. Current and earlier owners share the customer section; cost per kilometre and repeat jobs share the last section. Staff names appear only in authorized internal job visits. Each section has an explicit column schema even when empty; print starts each subsequent section on a new page and Excel produces one sheet per included section, without an extra summary sheet. Options remove their sections. Portal job queries retain cancellation/PDI exclusions even when a status is requested; internal staff names and PDI-linked credit applications are not exposed.

The audit uses a disposable localhost PostgreSQL database. See [audited progress](progress/issue-79-progress.md), [before/after gaps and actual results](testing/issue-79-audit.md), and [component/XLSX verifier](testing/verify-monthly-report-output.cjs). Existing preview files are historical; current synthetic captures are under ignored `.audit-local/visual`. Authenticated role-matrix and production-scale performance testing are separate from those component checks.


## 19 October output-photo follow-up

Only existing #79 reports are changed. The customer/vehicle sales report and consolidated transaction summary photos are excluded as requested. No output photo was supplied for M3, M6, M8 or M10; those column contracts stay unchanged.

| Report | Photographed main columns, in order |
|---|---|
| M1 | S.No., bill number/date, customer; Taxable spares/discount/handling/taxable amount/UPST government and non-government/surcharge government and non-government/other charges/subtotal; Tax paid/non-taxable total/discount/handling/other/subtotal; labour amount, labour VAT, WCT, round-off, net total |
| M2 | S.No., registration, customer, model, variant, VIN, service, booked date, availed date, variation days |
| M4 | Job date/number, registration, customer, model, variant, requisition number/date, type, part number/description, quantity, retail rate/amount, dealer rate/amount |
| M5 | S.No., model, registration, bill number/date, amount; grouped by fleet, bill type and customer with fleet subtotals |
| M7 | Date/service, free service, paid service, running repair, others, Total, Accidental; separate 1FS/2FS/3FS free-service breakdown |
| M9 | VIN, part number/description, quantity, dealer rate, amount, job date, warranty claim number/date |

The same explicit column contracts drive screen, print and XLSX, including grouped Retail/Dealer headings. M7 follows the photo's arithmetic: Total excludes the separately displayed Accidental column; the all-delivery count is retained as delivered. Known service-master codes/descriptions define the buckets; unknown/custom types stay Others. Free services with no recorded sequence appear as Unspecified so the breakdown still reconciles. Booking grace semantics remain those in #79; historical negative variations in the photo are not copied into matching logic.

Historical dealer-rate snapshots and requisition document numbers are absent in the current schema. Those columns stay blank, with a clear note; current part-master prices or UUIDs are not substituted. Warranty retail amounts remain available in the API for compatibility but are not labelled as dealer amounts. Unbilled non-customer lines have zero customer retail amount. Corporate bills use verified original document numbers from report snapshots when available.
