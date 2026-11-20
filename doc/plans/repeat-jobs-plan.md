# Repeat jobs: plan and progress

Branch `feature/repeat-jobs` from `origin/main` (= `Jayking`, includes PDI #172).
Legacy: Service → Repeat Job (entry, list, analysis, date-wise summary).

## What already exists and is reused

| Area | Existing | Change |
|---|---|---|
| Per-branch window | `BranchSettings.repeatWindowDays` / `repeatWindowKm`, edited in Settings → Company | Defaults 15 days / 500 km; add `printRepeatBlock`; audit saves |
| Engineer on the job | `JobCard.engineerId` (+ reports `J.engineerId`) | none |
| Job flags | `JobCard.isRepeat`, `previousJobId`, `repeatReason` | kept; `repeatReason` = opening note |
| PDI exclusion | `serviceHistoryWhere()` (Prisma), `notPdiSql` (reports) | reused |
| Masters | `WorkshopMaster` + generic masters screen | new kind `REPEAT_REASON`, attribute `isNotRepeat` |
| Reports | framework (`defineReport`, client `ReportConfig`) | 3 new reports |

## Data model (migration `20261120100000_repeat_jobs`, additive, idempotent)

- `enum RepeatJobSource { AUTOMATIC, MANUAL }`, `enum RepeatJobStatus { PENDING_REVIEW, CONFIRMED, NOT_REPEAT }`.
- `RepeatJob`: jobCardId (unique), previousJobId, branchId, daysDifference, kmDifference?,
  previousEngineerId?, previousServiceAdvisorId?, previousTechnicianIds[], windowDays?, windowKm?
  (null on back-filled rows: window unknown), source, status, openingNote?, remarks?, reviewedById?, reviewedAt?.
- `RepeatJobReason`: (repeatJobId, reasonId → WorkshopMaster REPEAT_REASON), position.
- `BranchSettings.printRepeatBlock` (default true); column defaults 15 / 500 (existing rows unchanged).
- Seed REPEAT_REASON 0–6 (0 has `isNotRepeat`). Back-fill a MANUAL / PENDING_REVIEW record for every existing `isRepeat` job.
- Permissions `repeatjob:read`, `repeatjob:review`, `report:repeat-list|repeat-analysis|repeat-summary`.

## Rules (pure, unit tested: `server/src/modules/repeat-job/repeat-job.logic.ts`)

- Previous job = vehicle's most recent **billed** job (billedAt set, or legacy status Billed/Delivered),
  not cancelled, not PDI, any branch, opened before the new job.
- Candidate when days ≤ window days **or** (both mileages recorded, new ≥ previous, km ≤ window km).
- Detection runs in the opening transaction inside a SAVEPOINT; a failure is logged and the job opens unflagged.
- Advisor may flag by hand (any earlier non-cancelled, non-PDI job of the vehicle) → source MANUAL.
- Review: 1–5 distinct reasons; a not-repeat reason alone; remarks required. Not-repeat → `NOT_REPEAT`, else `CONFIRMED`.
  Edit after review: the reviewer or Admin/SuperAdmin. Every review is audited (`REPEAT_JOB_REVIEWED`).

## Decisions taken with a safe default (`TODO(confirm)`)

1. Delivered-on-credit jobs (no bill yet) count as billed only through legacy status; new jobs need `billedAt`.
2. Staff filters/grouping: repeats count against the **previous** job's advisor/engineer; "total jobs"
   for those groups = jobs opened in the period handled by that person (current job). Same rule in R3.
3. ServiceManager gets read + reports (like ServiceAdviser), not review.
4. R2 shows one count column per reason that is a repeat cause (codes 1–6); "not a repeat" jobs are left out of R2 (R1 lists them on request).
5. `JobCard.isRepeat` mirrors "counts as a repeat": a NOT_REPEAT review sets it false (MIS A4 and the history card follow).

## Status (2026-11-20)

- [x] Backend: migration, schema, logic + tests, opening detection, review API, job/vehicle includes, settings audit
- [x] Reports R1–R3 + tests; framework extension `filterLabels` (server + client)
- [x] Frontend: opening repeat check, Workshop → Repeat Jobs list, review screen, badges (list, header, vehicle page),
      print-aware repeat block, settings (print block), REPEAT_REASON master, three report configs, nav + route guard
- [x] Demo seed `--repeat-only` (RPT-1…RPT-8; MIS demo repeat now gets its record; retime moves repeat records)
- [x] Docs: `doc/workshop.md` (Repeat jobs), `doc/job-cards.md`, `doc/reports.md`, `doc/demo-data.md`,
      `doc/repeat-jobs-testing-guide.md`
- [x] Checks: server tsc clean (src + changed seeds); unit suite: only pre-existing failures (same 10 tests fail on
      the untouched baseline); integration on local `dana_test_repeat`: repeat 6/6, MIS, PDI, reports pass
      (booking and workshop suites fail identically on baseline); migration idempotent (re-run) and no schema drift
      for the new objects; client tsc and lint clean on changed files
- [ ] Browser click-through (follow the testing guide)

Local DBs (docker `dana-pdi-pg`, port 55432): `dana_test_repeat` (TEST_DATABASE_URL), `dana_demo_repeat`
(demo + `--repeat-only`), both cloned from the PDI databases and migrated.
