import { countsAsRepeat as counts } from '../../repeat-job/repeat-job.logic';
import { percentOf } from '../mis/mis.logic';
import type { ReportGroup } from '../core/types';

export type RepeatReviewStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'NOT_REPEAT';

export interface RepeatReasonRef {
  id: string;
  code: string;
  description: string;
}

/** One repeat job as the repeat reports read it (see repeat.data.ts). */
export interface RepeatReportRow {
  [key: string]: unknown;
  repeatId: string;
  jobId: string;
  jobNumber: string;
  jobDate: Date;
  /** Local calendar date of the repeat job (YYYY-MM-DD). */
  day: string;
  modelId: string | null;
  model: string | null;
  variantId: string | null;
  variant: string | null;
  reviewStatus: RepeatReviewStatus;
  previousEngineerId: string | null;
  previousEngineer: string | null;
  previousServiceAdvisorId: string | null;
  previousServiceAdvisor: string | null;
  reasons: RepeatReasonRef[];
}

/** Jobs opened in the period per group (model, variant, advisor or engineer) or per date. */
export interface JobCount {
  key: string;
  label: string;
  jobs: number;
}

export type AnalyseBy = 'model' | 'variant' | 'serviceAdvisor' | 'engineer';

export const NONE_KEY = 'none';

/**
 * R1 options. "Only not a repeat" overrides "include not a repeat"; by default the list is the
 * repeats that count (confirmed and pending review).
 */
export function selectListRows<R extends { reviewStatus: string }>(rows: R[], options: { includeNotRepeat: boolean; onlyNotRepeat: boolean }): R[] {
  if (options.onlyNotRepeat) return rows.filter((row) => row.reviewStatus === 'NOT_REPEAT');
  return options.includeNotRepeat ? rows : rows.filter((row) => counts(row.reviewStatus));
}

export function statusTotals(rows: { reviewStatus: string }[]) {
  const by = (status: RepeatReviewStatus) => rows.filter((row) => row.reviewStatus === status).length;
  const pending = by('PENDING_REVIEW');
  const confirmed = by('CONFIRMED');
  return { count: rows.length, repeats: pending + confirmed, pending, confirmed, notRepeat: by('NOT_REPEAT') };
}

/** Repeats as % of jobs opened (2dp); 0 when no jobs. */
export function repeatPercent(repeats: number, jobs: number): number {
  return percentOf(repeats, jobs);
}

export const reasonKey = (code: string) => `reason_${code}`;

/** The group a repeat falls in: model and variant of the vehicle; advisor and engineer of the previous job. */
export function analysisKey(row: RepeatReportRow, by: AnalyseBy): { key: string; label: string } {
  const pick = (id: string | null, label: string | null, fallback: string) => ({ key: id ?? NONE_KEY, label: label ?? fallback });
  if (by === 'model') return pick(row.modelId, row.model, 'Model not set');
  if (by === 'variant') return pick(row.variantId, row.variant, 'Variant not set');
  if (by === 'serviceAdvisor') return pick(row.previousServiceAdvisorId, row.previousServiceAdvisor, 'No service advisor');
  return pick(row.previousEngineerId, row.previousEngineer, 'No engineer');
}

/** Per-row flags the analysis detail shows under each count column (1 = yes). */
function rowCounts(row: RepeatReportRow, reasons: RepeatReasonRef[]): Record<string, number | null> {
  const chosen = new Set(row.reasons.map((reason) => reason.id));
  return {
    repeats: counts(row.reviewStatus) ? 1 : 0,
    pending: row.reviewStatus === 'PENDING_REVIEW' ? 1 : null,
    confirmed: row.reviewStatus === 'CONFIRMED' ? 1 : null,
    ...Object.fromEntries(reasons.map((reason) => [reasonKey(reason.code), chosen.has(reason.id) ? 1 : null])),
  };
}

function groupTotals(jobs: number, rows: RepeatReportRow[], reasons: RepeatReasonRef[]): Record<string, number> {
  const status = statusTotals(rows);
  const totals: Record<string, number> = {
    count: rows.length,
    jobs,
    repeats: status.repeats,
    repeatPct: repeatPercent(status.repeats, jobs),
    pending: status.pending,
    confirmed: status.confirmed,
  };
  for (const reason of reasons) totals[reasonKey(reason.code)] = rows.filter((row) => row.reasons.some((chosen) => chosen.id === reason.id)).length;
  return totals;
}

/**
 * R2. One group per model, variant, previous advisor or previous engineer: jobs opened in the period,
 * repeats (confirmed + pending; "not a repeat" is left out), repeat %, and a count per reason code.
 * Detail rows are the repeats of each group. Groups with jobs but no repeats show in the summary only.
 */
export function buildAnalysis(input: {
  rows: RepeatReportRow[];
  jobCounts: JobCount[];
  reasons: RepeatReasonRef[];
  by: AnalyseBy;
  mode: 'both' | 'summary' | 'detail';
}): { rows: (RepeatReportRow & { groupKey: string })[]; groups: ReportGroup[]; totals: Record<string, number> } {
  const repeats = input.rows.filter((row) => counts(row.reviewStatus));
  const buckets = new Map<string, { label: string; jobs: number; rows: RepeatReportRow[] }>();
  for (const job of input.jobCounts) buckets.set(job.key, { label: job.label, jobs: job.jobs, rows: [] });
  for (const row of repeats) {
    const { key, label } = analysisKey(row, input.by);
    const bucket = buckets.get(key) ?? { label, jobs: 0, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }

  const keys = Array.from(buckets.keys())
    .filter((key) => input.mode === 'summary' || input.mode === 'both' || buckets.get(key)!.rows.length > 0)
    .filter((key) => buckets.get(key)!.jobs > 0 || buckets.get(key)!.rows.length > 0)
    .sort((a, b) => {
      const x = buckets.get(a)!;
      const y = buckets.get(b)!;
      return y.rows.length - x.rows.length || x.label.localeCompare(y.label);
    });

  const groups: ReportGroup[] = keys.map((key) => {
    const bucket = buckets.get(key)!;
    return { key, label: bucket.label, count: bucket.rows.length, totals: groupTotals(bucket.jobs, bucket.rows, input.reasons) };
  });
  const rows = keys.flatMap((key) => buckets.get(key)!.rows.map((row) => ({ ...row, ...rowCounts(row, input.reasons), groupKey: key })));
  const allJobs = input.jobCounts.reduce((sum, job) => sum + job.jobs, 0);
  return { rows, groups, totals: groupTotals(allJobs, repeats, input.reasons) };
}

export interface DateSummaryRow {
  [key: string]: unknown;
  id: string;
  day: string;
  jobs: number;
  repeats: number;
  repeatPct: number;
  pending: number;
  confirmed: number;
  notRepeat: number;
}

/** R3. One row per date with jobs or repeats: jobs opened, repeats, repeat %, pending, confirmed, not a repeat. */
export function buildDateSummary(jobsByDay: JobCount[], rows: RepeatReportRow[]): { rows: DateSummaryRow[]; totals: Record<string, number> } {
  const days = new Set([...jobsByDay.map((job) => job.key), ...rows.map((row) => row.day)]);
  const summary = Array.from(days)
    .sort()
    .map((day) => {
      const jobs = jobsByDay.find((job) => job.key === day)?.jobs ?? 0;
      const status = statusTotals(rows.filter((row) => row.day === day));
      return { id: day, day, jobs, repeats: status.repeats, repeatPct: repeatPercent(status.repeats, jobs), pending: status.pending, confirmed: status.confirmed, notRepeat: status.notRepeat };
    });
  const sum = (key: 'jobs' | 'repeats' | 'pending' | 'confirmed' | 'notRepeat') => summary.reduce((total, row) => total + row[key], 0);
  const jobs = sum('jobs');
  const repeats = sum('repeats');
  return {
    rows: summary,
    totals: { count: summary.length, jobs, repeats, repeatPct: repeatPercent(repeats, jobs), pending: sum('pending'), confirmed: sum('confirmed'), notRepeat: sum('notRepeat') },
  };
}
