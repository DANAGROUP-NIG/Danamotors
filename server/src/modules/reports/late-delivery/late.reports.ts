import { PERMISSIONS } from '../../../shared/constants/roles';
import type { LateKind } from '../../late-delivery/late-delivery.logic';
import { flag, rangeQuery } from '../core/filters';
import { defineReport, type FilterKey, type ReportDefinition } from '../core/types';
import { jobTypeDoc, jobTypeParam } from '../mis/mis.params';
import { countDelivered, loadLateReasons, loadLateRows } from './late.data';
import { discrepancySections, lateTotals, reasonColumns, reasonLines } from './late.logic';

const RULES =
  'Only delivered, not cancelled jobs with a promise count. Late by date = delivered on a later calendar day than promised; late by time = delivered later on the promised day (Africa/Lagos). A job is in one or the other, never both. The period filters the promised date; late status comes from the stored promise and delivery date-times, so a past period gives the same answer later.';

const KIND_TEXT: Record<LateKind, { name: string; measure: string }> = {
  DATE: { name: 'date', measure: 'days late' },
  TIME: { name: 'time', measure: 'minutes late' },
};

// ── 3.1 / 3.2 Promised date / time discrepancy ─────────────────────────────────

const DISCREPANCY_FILTERS: FilterKey[] = ['model', 'variant', 'serviceType', 'serviceGroup', 'receivedBy'];

function discrepancy(kind: LateKind, slug: string, permission: string): ReportDefinition {
  const text = KIND_TEXT[kind];
  return defineReport({
    slug,
    title: `Promised ${text.name} discrepancy report`,
    width: 132,
    permission,
    summary: `One row per job delivered late by ${text.name}: job, registration, model, variant, service type, service advisor, promised and delivered date-times, ${text.measure}, reasons and remarks. The summary gives delivered jobs, late jobs, late % and average ${text.measure} by model and by service type, and late jobs by reason (with a "No reason recorded" line). mode: both (detail with summary), summary or detail. allDates=true ignores from/to. ${RULES}`,
    period: 'range',
    query: rangeQuery(DISCREPANCY_FILTERS, { allDates: flag, jobType: jobTypeParam.default('BOTH') }),
    filterKeys: DISCREPANCY_FILTERS,
    filterLabels: { receivedBy: 'Service advisor' },
    params: [
      { name: 'allDates', description: 'true: every promised date (from/to ignored). Default false.', schema: { type: 'boolean' } },
      { ...jobTypeDoc, description: 'REGULAR, PDI or BOTH (default, "All").' },
    ],
    example: {
      rows: [
        {
          jobId: 'job-uuid', jobNumber: '2026000006', jobDate: '2026-01-02T08:05:00.000Z', registration: 'LSD686KC', model: 'Sportage', variant: 'SPORTAGE 2.0 AT', serviceType: 'Paid service',
          receivedBy: 'Ada Obi', promisedAt: '2026-01-02T16:00:00.000Z', deliveredAt: '2026-01-03T10:20:00.000Z', lateKind: kind, daysLate: kind === 'DATE' ? 1 : 0, minutesLate: kind === 'DATE' ? 1100 : 45,
          reasons: [{ id: 'reason-uuid', code: '2', description: 'Spare unavailable' }], remarks: 'Compressor came from the main store',
        },
      ],
      groups: [],
      totals: { count: 1, delivered: 12, late: 1, latePct: 8.33, avgLate: kind === 'DATE' ? 1 : 45 },
      sections: [{ key: 'model', title: 'By model', columns: [{ key: 'label', label: 'Model' }, { key: 'late', label: 'Late', format: 'integer' }], rows: [{ key: 'Sportage', label: 'Sportage', delivered: 5, late: 1, latePct: 20, avgLate: 1 }] }],
    },
    async run(db, scope, query) {
      const period = { from: query.from, to: query.to, allDates: query.allDates, filters: query, jobType: query.jobType };
      const [{ rows, truncated }, delivered, reasons] = await Promise.all([loadLateRows(db, scope, period, kind), countDelivered(db, scope, period), loadLateReasons(db)]);
      const totals = lateTotals(rows, delivered, kind);
      return {
        rows,
        groups: [],
        totals,
        summary: { delivered: totals.delivered, late: totals.late, latePct: totals.latePct, avgLate: totals.avgLate },
        sections: discrepancySections(rows, delivered, reasons, kind),
        truncated,
      };
    },
  });
}

// ── 3.3 / 3.4 Promised date / time delayed delivery analysis ───────────────────

function analysis(kind: LateKind, slug: string, permission: string): ReportDefinition {
  const text = KIND_TEXT[kind];
  return defineReport({
    slug,
    title: `Promised ${text.name} delayed delivery analysis`,
    width: 80,
    permission,
    summary: `Jobs delivered late by ${text.name} in the period broken down by reason: late jobs giving each reason, % of the late jobs and average ${text.measure}, with a "No reason recorded" line. A job with several reasons counts under each. Totals: jobs delivered, jobs late by ${text.name}, late % and average ${text.measure} (equal to the discrepancy report with every filter on All). ${RULES}`,
    period: 'range',
    query: rangeQuery([], {}),
    filterKeys: [],
    example: {
      rows: [
        { id: 'reason-uuid', code: '2', label: 'Spare unavailable', late: 3, lateShare: 37.5, avgLate: 1.33 },
        { id: 'none', code: '', label: 'No reason recorded', late: 1, lateShare: 12.5, avgLate: 2 },
      ],
      groups: [],
      columns: reasonColumns(kind),
      totals: { count: 8, delivered: 40, late: 8, latePct: 20, avgLate: 1.5 },
    },
    async run(db, scope, query) {
      const period = { from: query.from, to: query.to };
      const [{ rows, truncated }, delivered, reasons] = await Promise.all([loadLateRows(db, scope, period, kind), countDelivered(db, scope, period), loadLateReasons(db)]);
      const totals = lateTotals(rows, delivered, kind);
      return {
        rows: reasonLines(rows, reasons, kind),
        groups: [],
        totals: { ...totals, lateShare: totals.late ? 100 : 0 },
        summary: { delivered: totals.delivered, late: totals.late, latePct: totals.latePct, avgLate: totals.avgLate },
        truncated,
      };
    },
  });
}

// ── 3.5 List of delayed deliveries ─────────────────────────────────────────────

const delayedDeliveries = defineReport({
  slug: 'delayed-deliveries',
  title: 'List of delayed deliveries',
  width: 132,
  permission: PERMISSIONS.DELAYED_DELIVERIES_READ,
  summary: `Every job delivered late in the period, by date or by time (lateKind DATE / TIME): job, registration, model, promised and delivered date-times, how late (days for DATE, minutes for TIME) and reasons. The union of the two discrepancy reports with every filter on All. ${RULES}`,
  period: 'range',
  query: rangeQuery([], {}),
  filterKeys: [],
  example: {
    rows: [
      { jobId: 'job-uuid', jobNumber: '2026000201', registration: 'BDG621DN', model: 'Rio', promisedAt: '2026-01-26T16:00:00.000Z', deliveredAt: '2026-01-26T17:10:00.000Z', lateKind: 'TIME', daysLate: 0, minutesLate: 70, reasons: [] },
    ],
    groups: [],
    totals: { count: 1, dateLate: 0, timeLate: 1 },
  },
  async run(db, scope, query) {
    const { rows, truncated } = await loadLateRows(db, scope, { from: query.from, to: query.to }, null);
    const dateLate = rows.filter((row) => row.lateKind === 'DATE').length;
    const totals = { count: rows.length, dateLate, timeLate: rows.length - dateLate };
    return { rows, groups: [], totals, summary: totals, truncated };
  },
});

export const LATE_DELIVERY_REPORTS = [
  discrepancy('DATE', 'promise-date-discrepancy', PERMISSIONS.PROMISE_DATE_DISCREPANCY_READ),
  discrepancy('TIME', 'promise-time-discrepancy', PERMISSIONS.PROMISE_TIME_DISCREPANCY_READ),
  analysis('DATE', 'promise-date-analysis', PERMISSIONS.PROMISE_DATE_ANALYSIS_READ),
  analysis('TIME', 'promise-time-analysis', PERMISSIONS.PROMISE_TIME_ANALYSIS_READ),
  delayedDeliveries,
];
