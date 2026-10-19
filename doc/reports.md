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

M4 deducts net accepted returns and active billed quantities. New invoice lines retain the exact job-line link; legacy invoice quantities are allocated once over chronological matching customer-paid part lines. Warranty/FOC/goodwill lines remain unbilled by nature. Accessories count as spares. Unclassified legacy categories are visible with Both and excluded by specific category filters.

M1 reads stored invoice totals and immutable category/rate snapshots. Historical invoices with no breakdown are labelled **LEGACY_UNALLOCATED** in the annexure; no historical parts/labour VAT is reconstructed. Missing historical bill types use the job's explicit credit approval (otherwise cash); confirm this interpretation before relying on historic cash/credit splits. New bills snapshot this classification. Cash/credit here describes approved credit terms, never current paid/unpaid status. Counter-sales and the screenshot's consolidated transaction summary are outside scope.

M5 groups invoices by the **current vehicle corporate group**, independently of customer ownership. Historical fleet membership is not recorded. Admin/SuperAdmin manage shared groups, active status and VIN memberships at `/reports/corporate-groups`. Excel import reads the first sheet's VIN column, displays values for review, and applies on Add vehicles. Unknown VINs reject the whole import. Moving an existing membership requires an explicit checkbox. Every change is audited. Inactive groups remain reportable for historical bills.

M6/M7 count delivered jobs once by deliveredAt (two visits by one vehicle are two jobs). Optional delivery detail is included in screen/print/workbook. Targets are omitted pending business confirmation. M9 requires WARRANTY part lines; claim generation means submitted or subsequent status, or submission in status history. Billed-only requires an active invoice, not a stale billedAt timestamp. Technician is obtained from labour lines. Job type is hidden until its business meaning and data exist. Engineer is a distinct optional field and role, not an alias for technician.

Report jobs are capped at 10,000 with an explicit validation error, never silent truncation. Vehicle history searches require narrowing above 100 results; visits are counted in SQL without loading every search result's history. Selections currently include up to 1,000 branch vehicles; broader searchable selection is a follow-up. Large-date-range performance must be measured on a representative QA dataset.

Legacy `vehicle_history_card.sql` and `workshop_bill_report.sql` were not supplied or found. Implemented history sections follow the issue's explicit list; legacy-query parity remains pending those files. See [progress](progress/issue-79-progress.md) and [tester walkthrough](testing/issue-79-frontend-walkthrough.md).
