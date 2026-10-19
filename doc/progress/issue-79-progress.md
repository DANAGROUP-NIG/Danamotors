# Issue #79 Progress

## Status Summary
| Phase | Report/Item | Status | Notes |
|---|---|---|---|
| 0 | Framework, permissions, indexes | In progress | Implementation complete; typecheck and production frontend build pass; live QA pending |
| 1 | M6–M10 | In progress | Services/UI/tests implemented; desktop/mobile/print/workbook preview checked; legacy SQL and live QA pending |
| 2 | M2–M4 | In progress | Services/tests implemented; nullable metadata, engineer and booking service type added; live QA pending |
| 3 | Parts VAT, M1 | In progress | Default OFF; snapshots/settings/category picker and all regressions pass; live DB QA pending |
| 4 | Corporate master, M5 | In progress | Admin maintenance, reviewed VIN upload and audited memberships implemented; live QA pending |
| 5 | Documentation and verification | In progress | Walkthrough/fixture and automated checks complete; live DB/legacy SQL verification pending |
| Additional request | Kia Plaza source → current development DB seed | Blocked | Connected source cohort received and validated; LAN seed script prepared. Target apply and live reconciliation pending; no target writes by this agent |

## Plan
Existing: receipt register, SheetJS export, finance report screens, decimal money helpers, billing transactions, delivery lifecycle, warranty snapshots and coverage, priced job lines, vehicle ownership history. No generic workshop reports framework.

Add server reports module, permission-scoped monthly hub, reusable filter/table/print/export UI. Work in issue delivery order: framework; delivery/warranty/history; unbilled/bookings/estimates; flagged parts VAT/tax register; corporate master/bills; docs and verification.

Planned additive migrations: report permissions/indexes; nullable booking service type and estimate metadata/standalone references; part tax category master preserving free-text legacy values, invoice tax snapshots and settings; corporate group/vehicle link. Targets deferred pending confirmation. Never backfill invoice amounts.

## Discrepancies Between Issue and Code
| Issue claim | Actual code | Decision taken |
|---|---|---|
| Daily framework dependency | #75 open; no workshop framework in checkout | Build reusable framework here |
| Warranty merged | #64 reopened, but models/services exist locally | Verify local implementation; do not infer readiness from issue state |
| Estimate metadata and standalone estimate | Required jobCardId, no number/date | Add nullable metadata and standalone references; preserve existing workflow |
| Booking service type | serviceId references older Service | Add nullable workshop service type; keep legacy service readable |
| Engineer/job type | Neither exists | Engineer nullable; hide unconfirmed job type |
| Tax category enum | Arbitrary free text | Small master with separate canonical link, preserve original values |
| Legacy SQL in project | Neither named SQL exists among tracked/workspace files | Requested location; implement explicit issue sections, flag legacy parity pending |
| Engineer label in opening UI | Existing field labelled Engineer actually stored technicianId | Preserve technicianId as Technician; add distinct optional engineerId/Engineer role |
| CLOSED warranty case | Can close before submission | CLOSED is generated only with submission history evidence |
| Existing Excel helper | Writes TSV with an XLSX filename | Use already-installed SheetJS for genuine multi-sheet XLSX; no new dependency |
| Existing quotations list | Assumes every estimate has a jobCard | Retain job-linked list behavior; standalone estimates supported by monthly storage/reporting, daily issue owns creation UI |

## Open Questions / Assumptions
| Question | Option chosen | Why | How to change later | Business confirmation |
|---|---|---|---|---|
| Parts VAT | Default OFF | Preserve billing | Enable only after acceptance | Y |
| Corporate link | One current group per vehicle | Issue asks vehicle group | Change relationship if multiple memberships required | Y |
| Delivery targets | Omit until confirmed | No invented targets | Add target master later | Y |
| Legacy SQL parity | Pending source files | Cannot verify missing queries | Compare when supplied | Y |
| Unknown warranty | Explicit UNKNOWN | Missing data is not beyond warranty | Confirm handling | Y |
| Historic cash/credit classification | Stored type on new bills; approved-credit job flag for old bills | Paid/unpaid is not bill type | Introduce explicit billing type entry if business needs a different rule | Y |
| Fleet history | Current vehicle membership | Historical membership not recorded | Add membership history later if required | Y |

## Decisions Log
| Date | Decision | Reason |
|---|---|---|
| 2026-10-14 | Screenshots guide fields only | User requests modern UI |
| 2026-10-14 | No counter-sales or transaction-summary report | Outside the ten reports in issue #79 |
| 2026-10-14 | Default PDI read grants only Admin/SuperAdmin; other users need explicit grant | Follow pdi:read from #69; inclusion off by default |
| 2026-10-14 | Whole-kobo largest-remainder allocation for category discounts | Prevent negative final-category discount when multiple buckets round up |
| 2026-10-14 | Read-only source/target inspection before any requested seed | User authorized Kia Plaza data import; both connections unavailable |

## Migrations Added
| Name | Purpose | Reversible? | Data impact |
|---|---|---|---|
| 20261014100000_monthly_report_framework | Permissions and report indexes | Manual rollback | Grants additive; no financial changes |
| 20261014110000_monthly_report_dimensions | Engineer, booking service type, nullable standalone estimate metadata | Manual rollback only after checking standalone estimates | Existing estimate currency untouched; new default NGN |
| 20261014120000_parts_vat_snapshots | Tax category master/link, settings, bill type, VAT snapshots, invoice issuance link | Manual rollback | Known A/B/C mapped; original free text retained; no invoice amounts backfilled |
| 20261014130000_corporate_groups | Group master and vehicle membership | Manual rollback | Existing vehicles remain ungrouped |

## Endpoints Added
Ten GET /api/reports/<permission-slug> endpoints, plus report selections; corporate options/master/membership; billing settings. Schemas in report.validation.ts. Ordinary users scoped to their assigned branch; only Admin/SuperAdmin may choose another branch or all branches.

## Permissions Added and Default Grants
Ten report permissions and corporate:manage added. WorkshopManager/Admin/SuperAdmin all; Accountant/BillingOfficer M1/M4/M5; WarrantyOfficer M8/M9; ServiceAdviser M6/M7/M10. pdi:read added with Admin/SuperAdmin defaults; history requests require it separately. Engineer role receives jobcard:read/workshop:read. Corporate master mutation additionally requires Admin/SuperAdmin because it is global.

## Test Results
Commands invoke `C:/Program Files/nodejs/node.exe` directly because the shell shim reports no configured Node version.

| Check | Result |
|---|---|
| Initial backend/client `tsc --noEmit` | Passed |
| Initial report rules | 11/11 passed |
| First combined billing/report suites | One credit-default mock assertion failed after adding settings reads; narrowed assertion to the intended defaultCreditDays lookup |
| Second report/service tests | One deliberately incomplete booking mock lacked customer; optional phone handling added |
| First full backend suite | 48 passed suites, 633 passed tests; 10 database suites/39 tests skipped without TEST_DATABASE_URL |
| Frontend `eslint .` final | Exit 0, 0 errors, 69 existing warnings |
| Frontend `next build` final | Passed; 65 pages generated; temporary preview route absent |
| Backend typecheck/build | Passed on the final settled code, before full test run |
| Full suite during allocation edit | 635 passed, 1 failed, 39 skipped; running transform had old allocation code while new regression was added |
| Standalone final parts VAT test | 6/6 passed, including six-bucket rounding and byte-for-byte OFF regression |
| Latest complete backend suite | Passed: 48 suites, 636 tests; 10 database suites/39 tests skipped without TEST_DATABASE_URL |
| Final backend typecheck/build and full tests after fixture role correction | Exit 0 for all three commands; 636 passed/39 skipped again |
| Prisma schema validate | Passed |
| Browser UI preview | Actual component at desktop 1440px and emulated mobile 390px; bodyWidth=390; print header/layout inspected; real XLSX ZIP/XML verified |
| Source inspector PowerShell parser | Valid syntax; source unavailable, no query results obtained |

No applicable AGENTS.md at start. `next dev` generated client AGENTS.md during preview; read its relevant installed Next docs for page routing/useSearchParams, then removed generated scaffolding after stopping dev. #65/#67 closed; #64/#75 open at inspection.

## Known Gaps / Follow-ups
- Legacy SQL files missing; location requested. History follows the explicit issue sections; parity cannot be signed off until the SQL is supplied.
- TEST_DATABASE_URL unavailable: real DB integration suite written and skipped, migration replay and live data reconciliation unverified.
- User asked to seed current DB from Kia Plaza SQL Server. Source 10.1.172.133:1433 timed out both in and outside sandbox; user confirmed LAN-only. Configured target is danagroup_danamotors_dev at 209.74.93.26:5432, also unreachable both ways. No source data exported and no target data changed. LAN schema/sample exporter and credential-free target inspector prepared.
- No production/development migrations applied, no deployment, commit or PR created.
- Model targets omitted pending confirmation; job type hidden until specified; customer tax ID and free-service sequence blank rather than invented.
- Standalone-estimate authoring/approval UI remains part of daily issue #75; this change adds nullable storage and monthly comparison support.
- Historical corporate membership is not recorded; fleet reports use current vehicle group.
- Vehicle selections currently bounded to 1,000 options; broader searchable selection and representative-load benchmark remain QA follow-ups.

## Change Log
- 2026-10-14: Read issue #79, dependencies #64/#65/#67/#75 and supplied brief; inspected schema, billing and report patterns; recorded plan before implementation.
- 2026-10-14: Added report framework, monthly hub, filters in URL, shared screen/print/real workbook output; delivery/warranty/history services and initial unit tests.
- 2026-10-14: Added unbilled quantity allocation, booking grace matching, estimate comparison, flagged VAT snapshots, tax register and corporate group administration.
- 2026-10-14: Added QA seed, DB report-chain test, non-developer walkthrough, Swagger/report/billing docs, portal PDI/staff exclusions and invoice VAT breakdown display.
- 2026-10-14: Captured/inspected desktop/mobile/print/export evidence with mock data; removed temporary preview route and browser profiles.
- 2026-10-14: Read-only connection attempts for the additional Kia Plaza seed request failed; prepared LAN schema exporter without embedding supplied credentials.

## Migration and Configuration Steps

1. On a reachable development/QA database, back up as appropriate and run `npm run prisma:deploy` in server. The four migration names are listed above. Then run `npm run prisma:generate` and restart the backend.
2. Keep environment/stored JOB_BILL_PARTS_VAT_ENABLED OFF. Rates default to 7.5%; classify legacy parts explicitly before any business-approved enablement. Existing invoices remain unchanged.
3. Log out/in to refresh report permissions. Migrations add grants without deleting customized permissions; a full role reseed is unnecessary.
4. For synthetic local QA only, set MONTHLY_REPORT_QA_CONFIRMED=true and run `npx ts-node prisma/seed/monthly-reports.ts`. See the walkthrough. This is not a substitute for the requested real Kia Plaza data import.
5. For real source data, run `prisma/legacy/inspect-monthly-report-source.ps1` on the Kia Plaza LAN. Inspect real columns/relationships before constructing the bounded import; do not invent mappings or overwrite existing invoice amounts.

## Complete Changed-file Inventory

- client/app/(dashboard)/layout.tsx
- client/app/(dashboard)/reports/[report]/page.tsx
- client/app/(dashboard)/reports/billing-settings/page.tsx
- client/app/(dashboard)/reports/corporate-groups/page.tsx
- client/app/(dashboard)/reports/finance/receipt-register/page.tsx
- client/app/(dashboard)/reports/page.tsx
- client/constant.ts
- client/features/appointments/components/AppointmentCreateForm.tsx
- client/features/appointments/schemas/appointment.schema.ts
- client/features/appointments/types/appointment.types.ts
- client/features/auth/roles.ts
- client/features/inventory/components/PartForm.tsx
- client/features/invoices/api/invoice.api.ts
- client/features/invoices/components/InvoiceCreateForm.tsx
- client/features/invoices/components/InvoiceDetailPage.tsx
- client/features/invoices/components/VatBreakdownTable.tsx
- client/features/invoices/types/invoice.types.ts
- client/features/job-cards/api/job-card.api.ts
- client/features/job-cards/components/JobCardCreateForm.tsx
- client/features/job-cards/schemas/job-card.schema.ts
- client/features/job-cards/types/job-card.types.ts
- client/features/reports/components/corporate-groups-page.tsx
- client/features/reports/components/finance-report-nav.tsx
- client/features/reports/components/monthly-report-page.tsx
- client/features/reports/components/parts-vat-settings.tsx
- client/features/reports/components/report-output.tsx
- client/features/reports/components/reports-hub.tsx
- client/features/reports/monthly-config.ts
- client/features/settings/components/role-detail-page.tsx
- client/features/settings/components/roles-page.tsx
- client/features/vehicles/components/VehicleHistoryCard.tsx
- doc/billing.md
- doc/progress/issue-79-progress.md
- doc/reports.md
- doc/testing/issue-79-frontend-walkthrough.md
- doc/testing/issue-79-kia-plaza-import.md
- doc/testing/issue-79-preview/Deliveries-by-model.xlsx
- doc/testing/issue-79-preview/README.md
- doc/testing/issue-79-preview/delivery-print.pdf
- doc/testing/issue-79-preview/desktop.png
- doc/testing/issue-79-preview/mobile.png
- doc/testing/issue-79-preview/print.png
- server/prisma/legacy/inspect-monthly-report-source.ps1
- server/prisma/legacy/inspect-monthly-report-target.cjs
- server/prisma/migrations/20261014100000_monthly_report_framework/migration.sql
- server/prisma/migrations/20261014110000_monthly_report_dimensions/migration.sql
- server/prisma/migrations/20261014120000_parts_vat_snapshots/migration.sql
- server/prisma/migrations/20261014130000_corporate_groups/migration.sql
- server/prisma/schema.prisma
- server/prisma/seed/monthly-reports.ts
- server/src/config/index.ts
- server/src/config/swagger.ts
- server/src/modules/administration/admin.service.ts
- server/src/modules/customer-portal/portal.repository.ts
- server/src/modules/customer-portal/portal.service.ts
- server/src/modules/finance/document-number.ts
- server/src/modules/finance/finance.repository.ts
- server/src/modules/finance/job-billing.service.test.ts
- server/src/modules/finance/job-billing.service.ts
- server/src/modules/finance/parts-vat.test.ts
- server/src/modules/finance/parts-vat.ts
- server/src/modules/inventory/inventory.repository.ts
- server/src/modules/inventory/inventory.service.test.ts
- server/src/modules/reports/billing.report.ts
- server/src/modules/reports/corporate.service.ts
- server/src/modules/reports/delivery-warranty.report.ts
- server/src/modules/reports/history.report.ts
- server/src/modules/reports/monthly-reports.fixture.ts
- server/src/modules/reports/report.logic.test.ts
- server/src/modules/reports/report.logic.ts
- server/src/modules/reports/report.repository.ts
- server/src/modules/reports/report.types.ts
- server/src/modules/reports/report.validation.ts
- server/src/modules/reports/reports.integration.test.ts
- server/src/modules/reports/reports.openapi.ts
- server/src/modules/reports/reports.routes.test.ts
- server/src/modules/reports/reports.routes.ts
- server/src/modules/reports/reports.service.test.ts
- server/src/modules/reports/reports.service.ts
- server/src/modules/reports/variation-parts.report.ts
- server/src/modules/service/job-card-workflow.service.ts
- server/src/modules/service/service.controller.ts
- server/src/modules/service/service.repository.ts
- server/src/modules/service/service.routes.ts
- server/src/modules/service/service.service.ts
- server/src/modules/service/service.validation.ts
- server/src/routes/index.ts
- server/src/shared/constants/roles.ts

Source inspection received and reviewed (14 October 2026). Added metadata-based read-only cohort exporter; PowerShell parser and predicate checks pass. Unrelated inspection samples are insufficient for import. Await connected cohort export and reachable development target; no DB writes performed.

July source cohort validated: ten checked joins match, seven checked parent keys unique, 74 active bills total NGN 7,422,930. Added offline validator and aggregate evidence. Real import remains pending target connectivity and source billing/category flag definitions; no DB writes.

User confirmed target is local-network-only and requested TODO comments for unresolved legacy bill/tax flags. Added explicit mapping TODO to offline validator and import notes; preserve raw values without guessing. Network-side seed execution remains outstanding.

Prepared LAN-run create-only transactional cohort seed and PowerShell wrapper. Offline plan/schema/repeatability/return-bound checks passed; 99 bookings (one skipped), 104 jobs, 75 stored-total invoices plus connected lines/estimates. Live execution remains pending user LAN run. Unverified billing/category and warranty/corporate/staff mappings remain explicitly incomplete.

19 October: fixed missing Role.updatedAt in raw Engineer migration insert. Supplied rolled-back resolve + deployment recovery instructions. Not executed against LAN target; local Docker engine unavailable.
