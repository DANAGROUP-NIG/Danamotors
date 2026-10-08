# Issue #77 delivery log

Source: https://github.com/DANAGROUP-NIG/Danamotors/issues/77
Dependency reviewed: issue #65 (closed). Legacy screenshots are workflow references; later screens will use the current app design.

## Phase 1 — credit application outstanding correction

### Plan and scope

Fix credit approval and request checks in credit.service.ts, correct the dashboard outstanding aggregate, add colocated service regression tests, and update route Swagger and billing guidance. No schema, endpoint, permission, or frontend changes are required. Existing portal cache invalidation includes invoices and the dashboard.

### Decisions and assumptions

- Invoice.outstandingAmount is authoritative; receipts need not have Payment rows.
- Preserve the current Credit Payment and USED credit transaction until phase 2 unifies credit records.
- Use receipt-style Paid / Partially Paid settlement; overdue rules remain phase 5.
- Lock and recheck Pending before financial writes; decline conditionally updates Pending to avoid overwriting concurrent approval.
- Audit customer decisions with customer/application/invoice IDs in details; customer IDs are not staff User IDs.
- Correct the dashboard's full-total sum and standalone-invoice branch scope because phase 1 acceptance requires accurate outstanding totals.
- No historical data repair here; phase 5 previews and audits repairs.

### Acceptance evidence

- Approval reduces outstanding and sets Paid / Partially Paid: credit.service.test.ts (partial, full settlement, prior receipt allocation, fractional currency).
- Overpayment, duplicate approval, insufficient credit, cancelled invoices, and foreign customers are rejected before financial writes.
- Serializable transaction, row-lock queries, bounded rollback retries, non-replayed timeouts, and atomic audit writes have regression coverage.
- Dashboard total uses stored outstanding, excludes cancelled invoices, includes overdue amounts, and scopes standalone invoices correctly: dashboard.service.test.ts (3 passed).
- Phase 1 acceptance behavior: implemented. Remaining issue acceptance criteria belong to phases 2–5.

### Validation

Commands ran through Node child_process because the unified terminal could not initialize. The installed runtime is C:/Program Files/nodejs/node.exe (v24.16.0); the PATH node shim has no configured NVM version. All CLI paths below are relative to the indicated project directory.

| Check | Command | Result |
| --- | --- | --- |
| Backend typecheck | server: node node_modules/typescript/bin/tsc --noEmit | Passed, including final recheck |
| Backend build | server: node node_modules/typescript/bin/tsc | Passed, including final recheck |
| Backend suite | server: node node_modules/jest/bin/jest.js --runInBand | 29 suites, 412 tests passed; 6 suites / 35 tests skipped |
| Dashboard regressions | server: node node_modules/jest/bin/jest.js --runInBand src/modules/dashboard/dashboard.service.test.ts | 3 passed; added after full-suite discovery |
| Frontend lint | client: node node_modules/eslint/bin/eslint.js . | Passed: 0 errors, 70 existing warnings |
| Default frontend build | client: node node_modules/next/dist/bin/next build | Failed: Turbopack CSS worker invokes unconfigured NVM shim; reproduced after child PATH correction |
| Alternate frontend build | client: node node_modules/next/dist/bin/next build --webpack | Passed: compilation, TypeScript, and 56 generated static pages |
| Swagger | Load src/config/swagger through ts-node; assert decision route, 409 response, and request fields | Passed |
| Patch whitespace | git diff --check | Passed |

The database integration suites skipped because TEST_DATABASE_URL is absent. No database URL or secrets were printed. No production database writes were performed.

### Files

- Backend: server/src/modules/credit/credit.service.ts; server/src/modules/dashboard/dashboard.service.ts.
- Swagger: server/src/modules/credit/credit.routes.ts; server/src/modules/customer-portal/portal.routes.ts.
- Tests: server/src/modules/credit/credit.service.test.ts (16 regressions); server/src/modules/dashboard/dashboard.service.test.ts (3 regressions).
- Documentation: doc/billing.md and this delivery log.
- Frontend and migrations: none.

### Risks and follow-up

- Historical approvals with stale invoice outstanding are not repaired by this phase.
- The separate wallet and hand-edit path remain until phase 2; concurrent legacy manual wallet edits remain an existing limitation.
- Default Turbopack frontend build is blocked by the environment's unconfigured Node shim. Webpack production build passes; no frontend configuration was changed.

### Proposed PR

Title: Fix credit application invoice outstanding and dashboard totals (#77, phase 1)

Approval now reduces the authoritative invoice outstanding in the same serializable transaction as the Credit payment and customer-credit deduction. Fresh row-locked validation prevents over-adjustment and duplicate approvals, conditional decline cannot overwrite approval, and every approval has a financial audit entry. The dashboard sums remaining balances instead of full bill totals. Request/decision Swagger and billing documentation explain the behavior.

Assumptions: retain the existing wallet and Payment records for this independently reviewable phase; historical repair and wallet unification follow later. Settlement status matches the receipt service. Customer actors are identified in audit details rather than a staff User foreign key.

Validation: backend typecheck/build pass; backend suite and separate dashboard regressions pass (415 tests total); frontend lint has 0 errors; webpack production build passes. Default Turbopack build is blocked by the local Node shim. Database tests skipped without TEST_DATABASE_URL.

### Remaining phases

2. Party adjustment, FIFO, wallet unification, opening balances.
3. Party reports and UI, printing, Excel.
4. Debit/credit notes, registers, Tally XML.
5. Recalculation, overdue rules, letters.

Stop after phase 1 per the attached brief; resume phase 2 when the user says continue.
