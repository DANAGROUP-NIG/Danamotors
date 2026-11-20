# Late deliveries (promise discrepancy): plan and progress

Branch `feature/promise-discrepancy` from `origin/main` (0bdb44c, includes CSC #180).
Legacy: Service → Promised date / time details entry, promised date / time discrepancy reports,
delayed delivery analysis (date / time), list of delayed deliveries.

## What already exists and is reused

| Area | Existing | Change |
|---|---|---|
| Promise and delivery | `JobCard.promisedAt`, `deliveredAt` | none (one date-time each, so no legacy time-base trap) |
| Reasons on the job | `JobCard.lateReasonIds` (≤ 6, distinct), forced at DELIVERED when late | kept; corrected later through the new entry API |
| Late-reason master | `WorkshopMaster` kind `LATE_REASON`, generic masters screen, no delete (active flag only) | seed the six legacy reasons, codes 1–6 |
| Reports framework | `defineReport`, client `ReportConfig`, print, Excel | 5 reports; new generic **summary sections** (server tables shown on screen, in print and in Excel) |
| Branch scope | `canAccessAllBranches`, report scope | reused |

## Data model (migration `20261122100000_late_deliveries`, additive, idempotent)

- `JobCard.lateRemarks TEXT NULL`: the delay remark (kept apart from the customer-facing `remarks`).
- `LATE_REASON` 1–6: Engineer absent, Spare unavailable, On diagnosis, Customer's decision awaited,
  Wrong estimation, Open time (displayOrder 1–6).
- 6 permissions + grants (same as `ROLE_PERMISSIONS`).

## Rules (pure, unit tested: `server/src/modules/late-delivery/late-delivery.logic.ts`)

- Calendar days in Africa/Lagos (`REPORT_TZ`). Delivered day > promised day → **DATE** (days late = day difference).
  Same day and delivered > promised → **TIME** (minutes late, rounded up). Otherwise on time. Never both.
- Only delivered (`deliveredAt` set), not cancelled jobs with a promise count.
- The same SQL classifier (`late-delivery.sql.ts`) serves the entry worklist and every report.
- Entry save: 1–6 distinct LATE_REASON ids (active, or already on the job), remark ≤ 1000 chars;
  the job must be late of the screen's kind and in the user's branch (403 otherwise, unless `branch:all`).
  Audit `LATE_DELIVERY_REASONS_UPDATED` with before / after.
- Reports filter on the **promised** date; status comes from stored date-times only (re-runs are stable).

## Decisions taken with a safe default (`TODO(confirm)`)

1. "Delivered" = `deliveredAt` (gate-pass time), not the bill date (open question 1).
2. Date and time screens edit the **same** reasons and remark on the job (open question 2).
3. The two old reasons "Awaiting parts" / "Awaiting customer approval" are made **inactive** (overlap with
   2 and 4); history keeps them and an admin can re-activate them (open question 3).
4. Grants: ServiceManager, WorkshopManager and Admin (as for other workshop reports); Auditor gets the
   reports (read only). Others to confirm (open question 5).
5. A correction needs at least one reason, as delivery does (legacy allowed blanks; the analysis still shows
   a "no reason recorded" line for older jobs).
6. Job type filter = the framework's REGULAR / PDI / BOTH, default All (BOTH), so the discrepancy totals equal
   the analysis totals with default filters.

## Status

- [x] Backend: migration, schema, logic + tests, entry API (list, find, detail, save, history), audit, permissions;
      delivery also accepts `lateRemarks`
- [x] Reports 3.1–3.5 + summary sections (server) + tests (unit 40 pass; integration 8/8 on local `dana_test_late`)
- [x] Frontend: entry workbench (date / time), report configs, framework sections (screen, print, Excel), nav + guards,
      job card *Delivered late* panel, delay remark on the delivery form
- [x] Demo seed `--late-only` (LATE-1…LATE-10, fixed January 2026 dates; idempotent)
- [x] Docs: `doc/job-cards.md`, `doc/reports.md`, `doc/demo-data.md`, `doc/late-deliveries-testing-guide.md`
- [x] Checks: server + client tsc clean; server unit suite: only the 6 pre-existing failing suites (same 11 tests
      fail on the untouched baseline); integration on local `dana_test_late`: late, repeat, CSC, MIS, reports
      (11 suites, 100 tests) pass; migration re-runs cleanly, no drift for the new column; client lint clean on
      changed files; client `node --test` 44/44
- [ ] Browser click-through (follow the testing guide)
