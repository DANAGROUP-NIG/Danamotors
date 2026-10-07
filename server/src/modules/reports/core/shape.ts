import { Prisma } from '@prisma/client';
import type { ReportBody, ReportGroup, ReportMode, ReportRow } from './types';

/** Rows returned to the screen and Excel. Beyond this the report asks for narrower filters. */
export const MAX_REPORT_ROWS = 25_000;

/** Sum numeric fields with decimal arithmetic, rounded to 2dp. */
export function sumFields<R extends ReportRow>(rows: R[], fields: readonly string[]): Record<string, number> {
  const totals: Record<string, Prisma.Decimal> = Object.fromEntries(fields.map((field) => [field, new Prisma.Decimal(0)]));
  for (const row of rows) {
    for (const field of fields) {
      const value = row[field];
      if (typeof value === 'number' && Number.isFinite(value)) totals[field] = totals[field].plus(value);
    }
  }
  return Object.fromEntries(
    Object.entries(totals).map(([field, total]) => [field, total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber()]),
  );
}

export interface GroupSpec<R extends ReportRow> {
  key: (row: R) => string;
  label: (row: R) => string;
  /** Fixed group order (keys); groups not listed follow in first-seen order. */
  order?: readonly string[];
  /** Groups to show even when they have no rows (e.g. bill types). */
  always?: ReadonlyArray<{ key: string; label: string }>;
}

/** Group rows (keeping each group's rows together) and total each group. */
export function groupRows<R extends ReportRow>(rows: R[], spec: GroupSpec<R>, sumKeys: readonly string[]): { rows: R[]; groups: ReportGroup[] } {
  const buckets = new Map<string, { label: string; rows: R[] }>();
  for (const fixed of spec.always ?? []) buckets.set(fixed.key, { label: fixed.label, rows: [] });
  for (const row of rows) {
    const key = spec.key(row);
    const bucket = buckets.get(key) ?? { label: spec.label(row), rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }

  const order = spec.order ?? [];
  const keys = Array.from(buckets.keys()).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const groups = keys.map((key) => {
    const bucket = buckets.get(key)!;
    return { key, label: bucket.label, count: bucket.rows.length, totals: sumFields(bucket.rows, sumKeys) };
  });
  const grouped = keys.flatMap((key) =>
    buckets.get(key)!.rows.map((row) => ({ ...row, groupKey: key })),
  );
  return { rows: grouped, groups };
}

/** Trim a query result that hit the row cap (queries select MAX_REPORT_ROWS + 1). */
export function capRows<R>(rows: R[]): { rows: R[]; truncated: boolean } {
  return rows.length > MAX_REPORT_ROWS ? { rows: rows.slice(0, MAX_REPORT_ROWS), truncated: true } : { rows, truncated: false };
}

/** Summary mode returns totals only; detail and detail-with-summary return rows too. */
export function applyMode<R extends ReportRow>(body: ReportBody<R>, mode: ReportMode | undefined): ReportBody<R> {
  return mode === 'summary' ? { ...body, rows: [] } : body;
}

export function countBy<R extends ReportRow>(rows: R[], key: (row: R) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = key(row);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
