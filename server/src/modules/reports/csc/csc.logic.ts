import type { ReportGroup } from '../core/types';

/** One CSC case as the reports read it (csc.data.ts). */
export interface CscReportRow extends Record<string, unknown> {
  caseId: string;
  status: 'OPEN' | 'VISITED' | 'CLOSED';
  dueDate: string;
  dueMonth: string;
  modelId: string | null;
  model: string | null;
  serviceTypeId: string;
  serviceCode: string;
  serviceDescription: string;
  bookingNumber: string | null;
  closeReasonId: string | null;
  closeReasonCode: string | null;
  closeReason: string | null;
  contacts: { stage: string; slot: number; date: string; person: string | null; remarks: string | null; doneBy: string | null }[];
}

export interface CloseReasonRef {
  id: string;
  code: string;
  description: string;
}

export const reasonKey = (code: string) => `reason_${code}`;
const NONE = 'none';

/** Counts the follow-up report summarises: generated, contacted, booked, visited, closed, still open. */
export function followUpTotals(rows: CscReportRow[]): Record<string, number> {
  return {
    count: rows.length,
    contacted: rows.filter((row) => row.contacts.length > 0).length,
    booked: rows.filter((row) => !!row.bookingNumber).length,
    visited: rows.filter((row) => row.status === 'VISITED').length,
    closed: rows.filter((row) => row.status === 'CLOSED').length,
    open: rows.filter((row) => row.status === 'OPEN').length,
  };
}

/** Follow-up report groups: one per due month (the report can cover the previous month too). */
export function groupByMonth(rows: CscReportRow[]): { rows: (CscReportRow & { groupKey: string })[]; groups: ReportGroup[] } {
  const months = [...new Set(rows.map((row) => row.dueMonth))].sort();
  const groups = months.map((month) => {
    const own = rows.filter((row) => row.dueMonth === month);
    return { key: month, label: month, count: own.length, totals: followUpTotals(own) };
  });
  return { rows: rows.map((row) => ({ ...row, groupKey: row.dueMonth })), groups };
}

/**
 * No-show analysis: cases closed without a visit, grouped by service or model, with a count per
 * closure reason (columns reason_<code>).
 */
export function buildNoShow(rows: CscReportRow[], reasons: CloseReasonRef[], by: 'service' | 'model') {
  const keyOf = (row: CscReportRow) => (by === 'service' ? row.serviceTypeId : row.modelId ?? NONE);
  const labelOf = (row: CscReportRow) => (by === 'service' ? `${row.serviceCode} · ${row.serviceDescription}` : row.model ?? 'No model');
  const reasonTotals = (own: CscReportRow[]) => {
    const totals: Record<string, number> = { count: own.length };
    for (const reason of reasons) totals[reasonKey(reason.code)] = own.filter((row) => row.closeReasonId === reason.id).length;
    return totals;
  };
  const keys = new Map<string, string>();
  for (const row of rows) keys.set(keyOf(row), labelOf(row));
  const groups: ReportGroup[] = [...keys.entries()]
    .map(([key, label]) => {
      const own = rows.filter((row) => keyOf(row) === key);
      return { key, label, count: own.length, totals: reasonTotals(own) };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const order = new Map(groups.map((group, index) => [group.key, index]));
  const detail = rows
    .map((row) => ({ ...row, groupKey: keyOf(row), groupLabel: labelOf(row), [reasonKey(row.closeReasonCode ?? NONE)]: 1 }))
    .sort((a, b) => (order.get(a.groupKey) ?? 0) - (order.get(b.groupKey) ?? 0) || a.dueDate.localeCompare(b.dueDate));
  return { rows: detail, groups, totals: reasonTotals(rows) };
}

/** Reasons that appear in the rows, in code order (columns of the no-show analysis). */
export function usedReasons(rows: CscReportRow[], reasons: CloseReasonRef[]): CloseReasonRef[] {
  const used = new Set(rows.map((row) => row.closeReasonId));
  return reasons.filter((reason) => used.has(reason.id)).sort((a, b) => a.code.localeCompare(b.code));
}

/** First and last day of a month, optionally starting a month earlier ("print previous month data"). */
export function monthRange(month: string, withPrevious: boolean): { from: string; to: string } {
  const [year, number] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, number - 1 - (withPrevious ? 1 : 0), 1));
  const end = new Date(Date.UTC(year, number, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
