import type { LateKind } from '../../late-delivery/late-delivery.logic';
import type { ReportColumnDef, ReportRow, ReportSection } from '../core/types';

export interface ReasonRef {
  id: string;
  code: string;
  description: string;
}

export interface ReasonMaster extends ReasonRef {
  active: boolean;
}

/** A job delivered late, as the report loaders return it. */
export interface LateReportRow extends ReportRow {
  jobId: string;
  jobNumber: string;
  model: string | null;
  serviceType: string;
  lateKind: LateKind;
  daysLate: number;
  minutesLate: number;
  reasons: ReasonRef[];
}

/** Delivered jobs (with a promise) per model and service type label: the base of the late %. */
export interface DeliveredCount {
  model: string | null;
  serviceType: string;
  delivered: number;
}

export const MODEL_NOT_SET = 'Model not set';
export const NO_REASON_KEY = 'none';
export const NO_REASON_LABEL = 'No reason recorded';

const round2 = (value: number) => Math.round(value * 100) / 100;
export const pct = (part: number, whole: number) => (whole ? round2((part * 100) / whole) : 0);
export const avg = (sum: number, count: number) => (count ? round2(sum / count) : 0);

/** Days late for date reports, minutes late for time reports. */
export const lateMeasure = (row: Pick<LateReportRow, 'daysLate' | 'minutesLate'>, kind: LateKind) => (kind === 'DATE' ? row.daysLate : row.minutesLate);

export const modelLabel = (model: string | null | undefined) => model?.trim() || MODEL_NOT_SET;

export interface LateTotals extends Record<string, number> {
  count: number;
  delivered: number;
  late: number;
  latePct: number;
  avgLate: number;
}

export function lateTotals(rows: LateReportRow[], delivered: DeliveredCount[], kind: LateKind): LateTotals {
  const deliveredTotal = delivered.reduce((sum, item) => sum + item.delivered, 0);
  const sum = rows.reduce((total, row) => total + lateMeasure(row, kind), 0);
  return { count: rows.length, delivered: deliveredTotal, late: rows.length, latePct: pct(rows.length, deliveredTotal), avgLate: avg(sum, rows.length) };
}

export interface GroupLine extends ReportRow {
  key: string;
  label: string;
  delivered: number;
  late: number;
  latePct: number;
  avgLate: number;
}

/** Delivered, late, late % and average lateness per model or service type; most late first. */
export function groupLines(rows: LateReportRow[], delivered: DeliveredCount[], by: 'model' | 'serviceType', kind: LateKind): GroupLine[] {
  const labelOf = (item: { model: string | null; serviceType: string }) => (by === 'model' ? modelLabel(item.model) : item.serviceType);
  const lines = new Map<string, { delivered: number; late: number; sum: number }>();
  const line = (label: string) => {
    if (!lines.has(label)) lines.set(label, { delivered: 0, late: 0, sum: 0 });
    return lines.get(label)!;
  };
  for (const item of delivered) line(labelOf(item)).delivered += item.delivered;
  for (const row of rows) {
    const entry = line(labelOf(row));
    entry.late += 1;
    entry.sum += lateMeasure(row, kind);
  }
  return [...lines.entries()]
    .map(([label, value]) => ({ key: label, label, delivered: value.delivered, late: value.late, latePct: pct(value.late, value.delivered), avgLate: avg(value.sum, value.late) }))
    .sort((a, b) => b.late - a.late || b.latePct - a.latePct || a.label.localeCompare(b.label));
}

export interface ReasonLine extends ReportRow {
  id: string;
  code: string;
  label: string;
  late: number;
  /** % of the late jobs that give this reason (a job can give several). */
  lateShare: number;
  avgLate: number;
}

/**
 * One line per late-delivery reason (active ones, and retired ones still used in the period) in legend
 * order, then "No reason recorded". A job with several reasons counts once under each.
 */
export function reasonLines(rows: LateReportRow[], reasons: ReasonMaster[], kind: LateKind): ReasonLine[] {
  const known = new Map(reasons.map((reason) => [reason.id, reason]));
  const stats = new Map<string, { late: number; sum: number }>();
  const extra: ReasonRef[] = [];
  let none = { late: 0, sum: 0 };
  for (const row of rows) {
    const measure = lateMeasure(row, kind);
    if (!row.reasons.length) {
      none = { late: none.late + 1, sum: none.sum + measure };
      continue;
    }
    for (const reason of row.reasons) {
      if (!known.has(reason.id) && !extra.some((item) => item.id === reason.id)) extra.push(reason);
      const entry = stats.get(reason.id) ?? { late: 0, sum: 0 };
      stats.set(reason.id, { late: entry.late + 1, sum: entry.sum + measure });
    }
  }
  const listed = [...reasons.filter((reason) => reason.active || stats.has(reason.id)), ...extra];
  const line = (id: string, code: string, label: string, value: { late: number; sum: number }): ReasonLine => ({
    id,
    code,
    label,
    late: value.late,
    lateShare: pct(value.late, rows.length),
    avgLate: avg(value.sum, value.late),
  });
  return [
    ...listed.map((reason) => line(reason.id, reason.code, reason.description, stats.get(reason.id) ?? { late: 0, sum: 0 })),
    line(NO_REASON_KEY, '', NO_REASON_LABEL, none),
  ];
}

const AVG_LABEL: Record<LateKind, string> = { DATE: 'Avg days late', TIME: 'Avg minutes late' };

/** The summary tables of the discrepancy reports: by model, by service type and by reason. */
export function discrepancySections(rows: LateReportRow[], delivered: DeliveredCount[], reasons: ReasonMaster[], kind: LateKind): ReportSection[] {
  const totals = lateTotals(rows, delivered, kind);
  const groupColumns = (label: string): ReportColumnDef[] => [
    { key: 'label', label },
    { key: 'delivered', label: 'Delivered', format: 'integer' },
    { key: 'late', label: 'Late', format: 'integer' },
    { key: 'latePct', label: 'Late %', format: 'percent' },
    { key: 'avgLate', label: AVG_LABEL[kind], format: 'number' },
  ];
  const groupTotal = { label: 'Total', delivered: totals.delivered, late: totals.late, latePct: totals.latePct, avgLate: totals.avgLate };
  return [
    { key: 'model', title: 'By model', columns: groupColumns('Model'), rows: groupLines(rows, delivered, 'model', kind), total: groupTotal },
    { key: 'serviceType', title: 'By service type', columns: groupColumns('Service type'), rows: groupLines(rows, delivered, 'serviceType', kind), total: groupTotal },
    {
      key: 'reason',
      title: 'By reason',
      columns: reasonColumns(kind),
      rows: reasonLines(rows, reasons, kind).map((line) => ({ ...line, label: line.code ? `${line.code} ${line.label}` : line.label })),
      total: { label: 'Late jobs (a job can give several reasons)', late: totals.late, lateShare: totals.late ? 100 : 0, avgLate: totals.avgLate },
    },
  ];
}

export function reasonColumns(kind: LateKind): ReportColumnDef[] {
  return [
    { key: 'label', label: 'Reason' },
    { key: 'late', label: 'Late jobs', format: 'integer' },
    { key: 'lateShare', label: '% of late jobs', format: 'percent' },
    { key: 'avgLate', label: AVG_LABEL[kind], format: 'number' },
  ];
}
