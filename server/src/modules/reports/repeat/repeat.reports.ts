import { z } from 'zod';
import { PERMISSIONS } from '../../../shared/constants/roles';
import { flag, rangeQuery } from '../core/filters';
import { defineReport, type FilterKey } from '../core/types';
import { countJobsByDay, countJobsByGroup, loadRepeatReasons, loadRepeatRows } from './repeat.data';
import { buildAnalysis, buildDateSummary, reasonKey, selectListRows, statusTotals } from './repeat.logic';

const PERIOD_NOTE = 'Repeat jobs are counted on the repeat job\'s own date; cancelled and PDI jobs are left out.';

// ── R1. Repeat job list ───────────────────────────────────────────────────────

const LIST_FILTERS: FilterKey[] = ['model', 'variant'];

const repeatList = defineReport({
  slug: 'repeat-list',
  title: 'List of repeat jobs',
  width: 132,
  permission: PERMISSIONS.REPEAT_LIST_READ,
  summary: `Repeat jobs opened in the period with the previous job, the days and km between them, the previous and current engineer and service advisor, reasons, remarks, review status and source. By default only repeats that count (confirmed and pending review); includeNotRepeat adds jobs reviewed as "not a repeat job", onlyNotRepeat lists only those (and overrides includeNotRepeat). ${PERIOD_NOTE}`,
  period: 'range',
  query: rangeQuery(LIST_FILTERS, { includeNotRepeat: flag, onlyNotRepeat: flag }),
  filterKeys: LIST_FILTERS,
  params: [
    { name: 'includeNotRepeat', description: 'true: also list jobs reviewed as "not a repeat job" (default false).', schema: { type: 'boolean' } },
    { name: 'onlyNotRepeat', description: 'true: list only jobs reviewed as "not a repeat job"; overrides includeNotRepeat (default false).', schema: { type: 'boolean' } },
  ],
  example: {
    rows: [
      {
        jobId: 'job-uuid', jobNumber: '2026001260', jobDate: '2026-07-16T08:10:00.000Z', registration: 'GGE965JU', vin: 'MZBER814BLN075187', model: 'Seltos', variant: 'SELTOS 1.6 EX AT',
        mileage: 60985, previousJobNumber: '2026000346', previousJobDate: '2026-07-07T09:00:00.000Z', previousMileage: 60573, daysDifference: 9, kmDifference: 412,
        previousEngineer: 'Isiaka Kamorudeen', previousServiceAdvisor: 'Ada Obi', engineer: 'Isiaka Kamorudeen', receivedBy: 'Ada Obi',
        reasons: [{ id: 'reason-uuid', code: '4', description: 'Workmanship problem' }], remarks: 'AC noise back; clutch not replaced', reviewStatus: 'CONFIRMED', source: 'AUTOMATIC',
      },
    ],
    groups: [],
    totals: { count: 1, repeats: 1, pending: 0, confirmed: 1, notRepeat: 0 },
  },
  async run(db, scope, query) {
    const { rows, truncated } = await loadRepeatRows(db, scope, { from: query.from, to: query.to, filters: query });
    const listed = selectListRows(rows, query);
    const totals = statusTotals(listed);
    return { rows: listed, groups: [], totals, summary: totals, truncated };
  },
});

// ── R2. Repeat job analysis ───────────────────────────────────────────────────

const analysis = defineReport({
  slug: 'repeat-analysis',
  title: 'Repeat job analysis',
  width: 132,
  permission: PERMISSIONS.REPEAT_ANALYSIS_READ,
  summary: `Repeats per model, variant, previous service advisor or previous engineer (the people responsible for the work being repeated): jobs opened in the period (by each group's own jobs), repeat jobs (confirmed and pending; "not a repeat" left out), repeat %, pending, confirmed and a count per reason code. mode: both (detail with summary), detail, or summary. ${PERIOD_NOTE}`,
  period: 'range',
  query: rangeQuery([], { by: z.enum(['model', 'variant', 'serviceAdvisor', 'engineer']).default('model') }),
  filterKeys: [],
  params: [{ name: 'by', description: 'model (default), variant, serviceAdvisor or engineer (the previous job\'s).', schema: { type: 'string', enum: ['model', 'variant', 'serviceAdvisor', 'engineer'] } }],
  example: {
    rows: [{ jobNumber: '2026001260', groupKey: 'model-uuid', previousEngineer: 'Isiaka Kamorudeen', repeats: 1, confirmed: 1, reason_4: 1 }],
    groups: [{ key: 'model-uuid', label: 'Seltos', count: 1, totals: { count: 1, jobs: 25, repeats: 1, repeatPct: 4, pending: 0, confirmed: 1, reason_1: 0, reason_4: 1 } }],
    columns: [{ key: 'reason_1', label: '1 Component failure', format: 'integer' }, { key: 'reason_4', label: '4 Workmanship problem', format: 'integer' }],
    totals: { count: 1, jobs: 25, repeats: 1, repeatPct: 4, pending: 0, confirmed: 1, reason_1: 0, reason_4: 1 },
  },
  async run(db, scope, query) {
    const [{ rows, truncated }, jobCounts, reasons] = await Promise.all([
      loadRepeatRows(db, scope, { from: query.from, to: query.to }),
      countJobsByGroup(db, scope, { from: query.from, to: query.to, by: query.by }),
      loadRepeatReasons(db),
    ]);
    const result = buildAnalysis({ rows, jobCounts, reasons, by: query.by, mode: query.mode ?? 'both' });
    return {
      rows: query.mode === 'summary' ? [] : result.rows,
      groups: result.groups,
      totals: result.totals,
      columns: reasons.map((reason) => ({ key: reasonKey(reason.code), label: `${reason.code} ${reason.description}`, format: 'integer' as const })),
      summary: { jobs: result.totals.jobs, repeats: result.totals.repeats, repeatPct: result.totals.repeatPct, pending: result.totals.pending, confirmed: result.totals.confirmed },
      truncated,
    };
  },
});

// ── R3. Date-wise summary of repeat jobs ──────────────────────────────────────

const SUMMARY_FILTERS: FilterKey[] = ['model', 'variant', 'receivedBy', 'engineer'];

const dateSummary = defineReport({
  slug: 'repeat-summary',
  title: 'Date-wise summary of repeat jobs',
  width: 80,
  permission: PERMISSIONS.REPEAT_SUMMARY_READ,
  summary: `One row per date: jobs opened, repeat jobs (confirmed and pending), repeat %, pending review, confirmed and not a repeat, with a grand total. receivedBy (service advisor) and engineer filter jobs opened by the job's own people and repeats by the previous job's people. ${PERIOD_NOTE}`,
  period: 'range',
  query: rangeQuery(SUMMARY_FILTERS, {}),
  filterKeys: SUMMARY_FILTERS,
  filterLabels: { receivedBy: 'Service advisor', engineer: 'Engineer' },
  example: {
    rows: [{ id: '2026-07-16', day: '2026-07-16', jobs: 42, repeats: 3, repeatPct: 7.14, pending: 1, confirmed: 2, notRepeat: 1 }],
    groups: [],
    totals: { count: 1, jobs: 42, repeats: 3, repeatPct: 7.14, pending: 1, confirmed: 2, notRepeat: 1 },
  },
  async run(db, scope, query) {
    const [{ rows, truncated }, jobsByDay] = await Promise.all([
      loadRepeatRows(db, scope, { from: query.from, to: query.to, filters: query }),
      countJobsByDay(db, scope, { from: query.from, to: query.to, filters: query }),
    ]);
    const result = buildDateSummary(jobsByDay, rows);
    return { rows: result.rows, groups: [], totals: result.totals, summary: { jobs: result.totals.jobs, repeats: result.totals.repeats, repeatPct: result.totals.repeatPct }, truncated };
  },
});

export const REPEAT_REPORTS = [repeatList, analysis, dateSummary];
