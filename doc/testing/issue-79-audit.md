# Issue #79 audit

Audit branch: issue-79/audit-completion. No push, PR, merge, issue mutation or non-local database writes are permitted.

## Before implementation

Read issue #79 in full through the GitHub connector, the original changed-file inventory and progress narrative, report/backend/frontend modules, five report migrations, and CI/deployment workflows. Referenced legacy SQL files are absent. Existing dirty UI/formatting edits are preserved in .audit-local/baseline; unrelated navigation/page edits are not staged by this audit.

| Item | Before | Evidence / gap |
|---|---|---|
| Ten routes/API/validation | DONE | reports.routes.ts; report.validation.ts; reports/[report]/page.tsx; monthly-config.ts |
| Shared screen/print/XLSX | PARTIAL | report-output.tsx; empty history sections/export coverage need checks |
| Cancellation/PDI scope | PARTIAL | report.repository.ts; case-insensitive status/PDI filtering and portal regression tests needed |
| M1 | PARTIAL | billing.report.ts; photographed layout hides issue category fields, annexure cases need coverage |
| M2 | PARTIAL | variation-parts.report.ts; linked booking priority and pure matching/summary needed |
| M3 | PARTIAL | variation-parts.report.ts; operation UUID/code matching and stored actual amounts |
| M4 | PARTIAL | variation-parts.report.ts; non-customer exact billing linkage ignored |
| M5 | PARTIAL | corporate.service.ts and corporate-groups-page.tsx exist; empty group error and unknown bill classification |
| M6/M7 | PARTIAL | delivery-warranty.report.ts; canonical model filter not matched |
| M8 | DONE | warrantyRow already invokes coverageFor on job date/mileage and labels calculated; UNKNOWN is distinct |
| M9 | PARTIAL | warranty/claim/billed filters present; 1,000 vehicle cap and flat detail; portrait already correct |
| M10 | PARTIAL | search/options/link present; 13 output sections, stored amount and section/export/privacy coverage gaps |
| Portal privacy | PARTIAL | portal.service.ts mapper omits staff; repository still fetches technician and other nested paths need tests |
| VAT categories/rates/exemption/customer-only | DONE | parts-vat.ts, PartForm.tsx, category master and stored invoice rows |
| Default OFF compatibility | PARTIAL | new classification/reconciliation validation runs before OFF return |
| Tally VAT | DONE / test gap | tally.service.ts posts invoice.vatAmount to VAT; enabled-parts regression needed |
| Permissions/default grants | DONE | shared/constants/roles.ts; permission SQL; route tests |
| Four requested indexes | DONE | framework migration; schema.prisma |
| Additive/idempotent migrations | PARTIAL | original four guarded; JSONB snapshot ADD COLUMN unguarded |
| Swagger/docs | PARTIAL | examples mostly empty; contradictory progress and stale limitations |
| CI | PARTIAL | failing Jest is caught and reported as absent test script |
| Integration/migration replay | FAILED baseline fixture | 57 migrations deploy on disposable localhost; original fixture violates Vehicle_model_identity_check |
| Legacy/business parity | UNVERIFIABLE | SQL absent; confirm bill flags, job type, delivery targets, corporate history |

Baseline independently executed: backend typecheck/build passed; 54 suites/692 tests passed with 15 DB suites/98 tests skipped. Frontend lint --quiet passed with zero errors; production build passed with 80 pages. PostgreSQL 18 installed locally; disposable cluster initialized under ignored .audit-local/pg and bound only to 127.0.0.1:55479. All 57 migrations replayed successfully. Fixing fixture custom identity lets the original report integration test pass; all five report SQL files then replay successfully with guards.

Issue/code conflicts: Correction to the initial gap commentary: M9 already used 80-column portrait in the baseline; only grouping and vehicle selection required changes. M1 must retain issue category columns as well as the later photographed breakdown. M10 has eleven conceptual sections: earlier owners belong with customer details and repeat jobs with cost-per-km. Job type remains undefined and must not be invented. Standalone estimate UI, counter sales and Job Card Opening form are outside this audit.

Stale progress statements: early migration/seed/commit/connection-blocked claims contradict later recorded seed success; counts reflect multiple historical runs; picker limit is a real gap; snapshot migration and later files are missing from the inventory. Historical remote seed evidence will be labelled historical, not claimed as this local-only audit work.

## After implementation

| Requirement | Before -> After | Evidence / remaining limit |
|---|---|---|
| 1: ten frontend routes and guarded GET endpoints | DONE -> DONE | `client/app/(dashboard)/reports/[report]/page.tsx`; `reports.routes.ts`; ten route tests |
| 1: matching Zod/frontend filters | DONE -> DONE | `report.validation.ts`, `monthly-config.ts`; executable contract check in `verify-monthly-report-output.cjs`, all defaults/options checked |
| 1: branch scoping | DONE -> DONE | `reportBranch`, `jobScope`, route permission tests and cross-branch DB checks; new picker uses the same scope |
| 1: shared screen, totals, print, identical XLSX | PARTIAL -> DONE for synthetic component QA | `report-output.tsx`; all ten real components and workbook handlers checked; wrapping/fixed print widths; empty history schemas |
| 2: exclude cancelled jobs and bills | PARTIAL -> DONE | `report.repository.ts` case-insensitive inactive statuses; active invoices exclude cancelledAt; report fixture includes excluded records |
| 2: exclude PDI unless explicitly allowed | PARTIAL -> DONE | `jobScope`; history PDI permission check; DB fixture; portal regression tests |
| 3: M8 calculated fallback | DONE -> DONE | `warrantyRow`, `coverageFor`, `report-calculations.test.ts`; historical job date/mileage; UNKNOWN retained only for missing actual inputs |
| 4: M9 WARRANTY-only/claims/billed | DONE -> DONE | `warrantyParts`; submitted lifecycle/history filter and active invoices; unit and chain tests |
| 4: M9 per-vehicle detail and subtotals | PARTIAL -> DONE | `delivery-warranty.report.ts` now returns populated vehicle groups |
| 4: vehicle picker beyond 1,000 | MISSING -> DONE | `vehicle-options.ts`, `report-vehicle-filter.tsx`; search/keyset paging/selected values; 1,001-record DB test and cross-branch denial |
| M9 job type | MISSING -> PARTIAL, business input | TODO(confirm), hidden because no agreed dimension exists; no Job Card Opening changes |
| 5: M10 six searches and result grid | DONE -> DONE | `history.report.ts`, `report.repository.ts`; frontend search fields and selectable result grid |
| 5: M10 options/PDI default/gate | DONE -> DONE | validation defaults, filter permission gate and endpoint check; section option tests |
| 5: eleven sections | PARTIAL -> DONE | `history.report.ts`: current/earlier owners together; repair cost/repeats together; staff remain in internal job visits |
| 5: history print/workbook | PARTIAL -> DONE | explicit columns even empty; ten section breaks, eleven PDF pages/sheets with default options; no extra summary worksheet |
| 5: open from vehicle page | DONE -> DONE | `client/features/vehicles/components/VehicleHistoryCard.tsx` Full history card action |
| 5: portal privacy | PARTIAL -> DONE | `portal.repository.ts`, `portal.service.ts`, `portal-privacy.test.ts`; no technician names fetched; no credit requester names/PDI credit invoices |
| 6: category master/A-B-C mapping/rates/exemption | DONE -> DONE | VAT migration, inventory part form, `parts-vat.ts`; A/B/C meanings follow the issue; unverified imported provenance remains untouched |
| 6: discounted customer-only VAT and stored breakdown | DONE -> DONE | pure allocation tests, `job-billing.service.test.ts` enabled invoice persistence regression |
| 6: default OFF and unchanged calculator output | PARTIAL -> DONE | no new invalid metadata/rate rejection while OFF; original totals JSON unchanged; valid saved rates visible |
| 6: existing invoices unchanged | DONE -> DONE during audit | all operations on non-local DB prohibited; reports read authoritative stored financial fields; no VAT breakdown backfill |
| 6: Tally combined VAT | DONE -> DONE plus regression | pure `jobBillMappingAmounts` in `tally-xml.ts`, used by service and balanced mapping test |
| 7: M1 detail/category fields and reconciliation | PARTIAL -> DONE | category layout default, photographed layout optional; explicit residual VAT rows; known-zero and unknown distinctions; decimal sums |
| 7: cash/credit/both, order and print modes | PARTIAL -> DONE | explicit stored classification only; displayed bill numbers numeric sorted; all modes and unknown flag tests; counter sale hidden |
| 8: M5 group master/admin/VIN workbook | DONE -> DONE | `corporate.service.ts`, `corporate-groups-page.tsx`; serializable audited membership changes; reviewed upload |
| 8: grouped subtotals/empty master | PARTIAL -> DONE | `corporateBills`, grouping test and empty master test; current membership remains explicit business assumption |
| 9: permissions/default grants | DONE -> DONE | `shared/constants/roles.ts`, framework SQL, `reports.routes.test.ts`; corporate maintenance also Admin/SuperAdmin gated |
| 10: all four requested indexes | DONE -> DONE | framework SQL and `schema.prisma` |
| 11: additive/idempotent-safe SQL | PARTIAL -> DONE locally | JSONB ADD COLUMN guarded; five report SQL files replayed on disposable PostgreSQL; all 57 migrations deploy fresh |
| 12: Swagger, reports/billing docs | PARTIAL -> DONE | `reports.openapi.ts` nonempty synthetic examples per report, picker and layout parameters; updated `doc/reports.md`, `doc/billing.md` |
| CI test failure propagation | PARTIAL -> DONE | `.github/workflows/ci.yml` no longer swallows failed Jest |
| Every DoD unit category | PARTIAL -> DONE | coverage map below; actual executed tests supersede historical counts |
| Report DB chain | FAILED fixture -> DONE | valid custom vehicle identity; all ten reports checked (M7 and M5 included), excluded records, selector pagination/branch scope |
| Exact legacy SQL parity and business mappings | UNVERIFIABLE -> UNVERIFIABLE | two SQL files absent; source I/Z, exemptions, job type, targets and membership history require input |

### Bugs found in previously claimed done work

- CI converted any Jest failure into a successful ?no test script? message.
- DB fixture violated the existing vehicle model-identity constraint, hiding integration failures when the suite was skipped.
- Same-vehicle grace matching could choose an earlier unlinked job ahead of the explicit appointment link.
- Estimate labour IDs did not consistently match actual operation codes; stored actual amounts were reconstructed from quantity/rate.
- Unbilled allocation ignored directly billed non-customer lines and needed deterministic once-only legacy allocation.
- Canonical vehicle models did not satisfy the legacy-only model filter. Reserved dimension names could overwrite grid date/total keys.
- M9 returned a flat list and empty vehicle groups, and its picker silently stopped at 1,000 vehicles.
- M10 exported thirteen conceptual groups plus a summary worksheet, and empty sections had no stable schemas.
- Portal fetched internal technician names and exposed requester names on credit applications; status filtering could replace the base cancellation predicate.
- OFF parts VAT introduced new metadata/rate validation failures. Tally needed an enabled-VAT regression using the actual mapping helper.
- M1 hid required category columns behind the photo format; partial breakdowns could disagree with stored bill VAT. Unknown legacy zeros and missing zero categories produced misleading totals. Display order used import keys rather than displayed document numbers.
- Legacy tax print width selectors squeezed the final header group; shared column widths and print wrapping fix it.

### DoD test coverage map

| Unit requirement | Tests |
|---|---|
| Parts VAT category/rate/discount/OFF | `finance/parts-vat.test.ts`; `finance/job-billing.service.test.ts` |
| Detail/annexure VAT | `reports/billing.logic.test.ts`; `reports/reports.service.test.ts`; `reports/tax-register-layout.test.ts` |
| Booking grace/walk-ins | `reports/report.logic.test.ts`; `reports/report-calculations.test.ts`; `reports/reports.service.test.ts` |
| Estimate parts/labour, shortage/excess | pure comparison tests plus UUID-to-code/stored-amount service regression |
| Issued minus returned minus billed | pure allocation tests and duplicate/direct-line service cases |
| Corporate grouping | service grouping/empty-master tests; local integration fleet subtotal |
| Delivery grid totals | pure grid tests, reserved-name collision test; M6/M7 local integration |
| Warranty snapshot/calculated | `report-calculations.test.ts`, `report.logic.test.ts`; integration calculated source |
| Claim generated | lifecycle/history unit cases; M9 billed/generated integration |
| History sections/PDI | eleven-section/optional-section tests, route PDI permission check, DB exclusions and portal privacy suite |

### Verification results

| Check | Actual result |
|---|---|
| Backend typecheck / lint (tsc --noEmit) | PASS |
| Backend build (tsc) | PASS |
| Default backend tests | 58 suites / 720 tests passed; 15 suites / 98 tests skipped |
| Full local DB-enabled run | 71 suites passed, 1 failed, 1 skipped; 815 tests passed, 2 failed, 1 skipped (818 total) |
| Report DB integration chain | PASS: all ten reports, warranty fallback, PDI/cancellation and 1,001-vehicle picker scope; additional cash/credit assertions rerun separately |
| Frontend full ESLint --quiet | PASS, zero errors |
| Frontend production build | PASS, 80 pages |
| Fresh migrations | PASS, 57 on disposable localhost PostgreSQL 18.4 |
| Five report migration replays | PASS on that throwaway database |
| Ten component/filter/XLSX checks | PASS |
| Ten desktop / 390px / print checks | PASS; captures inspected, PDF A4 orientations confirmed, history eleven pages/sheets |

Two final failures are outside #79: stock-transfer/stockTransfer.integration.test.ts:408 (missing DIRECT_STN_DISPATCHED alert) and :428 (missing INDENT_BACK_ORDER_PICKABLE notification). The initial DB run also failed the multi-indent alert assertion at :363, which passed on later runs; this notification suite has environment/order-sensitive results. No stock-transfer implementation changed. The existing catalogue integration suite remains skipped. Hosted CI was not run or claimed green. See [verification JSON](issue-79-audit-verification.json).

### Visual evidence and limits

`verify-monthly-report-output.cjs` renders the actual ReportOutput and invokes its actual Excel callback. It also compares all frontend filter defaults/options with each strict Zod query. Workbook files are read back, row/column values compared, and empty-section headers checked. Browser captures use Chrome device emulation at 390px, not its larger minimum desktop window size. Every report passed the page-width and print-table overflow assertions; PDF MediaBoxes match the specified A4 orientation. The history default result has eleven section pages and eleven worksheets. Desktop/mobile/print captures were inspected.

Synthetic data and all current HTML/PNG/PDF/XLSX outputs are local and ignored under `.audit-local/visual`; the committed manifest records results without customer data. This is actual component/browser output QA, not an authenticated end-to-end session: live role sign-in, admin upload interaction and loading/error flows still need the prepared walkthrough. A representative dataset performance benchmark was not run. Historical preview/seed files are not treated as current verification.

### Business input / TODO(confirm) / SQL

Parts VAT remains OFF until approval. Confirm I/Z cash/credit flags and imported tax/exemption provenance; unknown values stay unclassified, with no historical financial reconstruction. Canonical A/B/C mapping is explicitly defined by the issue and should not be confused with unverified import provenance. Confirm job-type meaning, target periods/ownership and whether fleet history is needed. Current fleet membership is used; no historical memberships are invented. Supply `vehicle_history_card.sql` and `workshop_bill_report.sql` for exact query parity. Free-service sequence and absent tax IDs stay blank. These decisions do not justify modifying #75 UI, counter sales or Job Card Opening.

The JSONB migration guard changes a previously deployed file checksum. No remote history was touched. Reconcile that migration-history difference through the normal release process before deployment. No migration was replayed on a non-local database.
