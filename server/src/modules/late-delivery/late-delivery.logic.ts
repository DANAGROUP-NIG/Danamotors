import { daysBetween, localDateOf, REPORT_TZ } from '../reports/core/dates';

/** The six legacy late-delivery reasons, codes 1-6 in this order (seeded as LATE_REASON masters). */
export const LATE_REASONS = ['Engineer absent', 'Spare unavailable', 'On diagnosis', "Customer's decision awaited", 'Wrong estimation', 'Open time'] as const;

export const MAX_LATE_REASONS = 6;
export const MAX_LATE_REMARKS = 1000;

/** DATE: delivered on a later calendar day than promised. TIME: same day, after the promised time. */
export type LateKind = 'DATE' | 'TIME';

export interface Lateness {
  /** null = delivered on or before the promised time. */
  kind: LateKind | null;
  /** Calendar days between the promised and delivered days (local time); 0 for TIME. */
  daysLate: number;
  /** Whole minutes after the promised time, rounded up (0 when on time). */
  minutesLate: number;
}

/**
 * How late a delivery was, from the stored date-times only (never today's date), with calendar days
 * in the branch time zone so a delivery just after local midnight lands on the right day.
 * Mirrors lateKindSql() in late-delivery.sql.ts; the integration test keeps the two in step.
 */
export function lateness(promisedAt: Date, deliveredAt: Date, timeZone = REPORT_TZ): Lateness {
  const days = daysBetween(localDateOf(promisedAt, timeZone), localDateOf(deliveredAt, timeZone));
  const delayMs = deliveredAt.getTime() - promisedAt.getTime();
  const minutesLate = delayMs > 0 ? Math.ceil(delayMs / 60_000) : 0;
  if (days > 0) return { kind: 'DATE', daysLate: days, minutesLate };
  if (delayMs > 0) return { kind: 'TIME', daysLate: 0, minutesLate };
  return { kind: null, daysLate: 0, minutesLate: 0 };
}

export const KIND_LABEL: Record<LateKind, string> = { DATE: 'by date', TIME: 'by time' };

export interface JobForEntry {
  jobNumber: string;
  status: string;
  promisedAt: Date | null;
  deliveredAt: Date | null;
}

/**
 * Why a job cannot be opened on the date or time entry screen, or null when it can.
 * Only jobs delivered late of the screen's kind are opened.
 */
export function entryProblem(job: JobForEntry, kind: LateKind, canonicalStatus: string, timeZone = REPORT_TZ): string | null {
  if (canonicalStatus === 'CANCELLED') return `Job ${job.jobNumber} is cancelled.`;
  if (!job.deliveredAt) return `Job ${job.jobNumber} has not been delivered yet. Only delivered jobs can have late-delivery reasons.`;
  if (!job.promisedAt) return `Job ${job.jobNumber} has no promised delivery date.`;
  const late = lateness(job.promisedAt, job.deliveredAt, timeZone);
  if (!late.kind) return `Job ${job.jobNumber} was not delivered late.`;
  if (late.kind !== kind)
    return kind === 'DATE'
      ? `Job ${job.jobNumber} was delivered late on the promised day (by time), not on a later date. Use the promise time details entry.`
      : `Job ${job.jobNumber} was delivered on a later day than promised (by date). Use the promise date details entry.`;
  return null;
}

export interface ReasonOption {
  id: string;
  active: boolean;
}

/**
 * Problem with a reason selection, or null. 1-6 distinct LATE_REASON ids; an inactive reason may stay
 * only where the job already has it (history is kept when a reason is retired).
 */
export function reasonProblem(reasonIds: string[], options: ReasonOption[], currentIds: string[]): string | null {
  if (!reasonIds.length) return 'Select at least one reason.';
  if (reasonIds.length > MAX_LATE_REASONS) return `At most ${MAX_LATE_REASONS} reasons are allowed.`;
  if (new Set(reasonIds).size !== reasonIds.length) return 'A reason can be selected only once.';
  for (const id of reasonIds) {
    const option = options.find((item) => item.id === id);
    if (!option) return 'Select reasons from the late-delivery reason list.';
    if (!option.active && !currentIds.includes(id)) return 'One of the selected reasons is no longer in use.';
  }
  return null;
}

/** Trimmed remark, or null when blank. */
export function cleanRemarks(remarks: string | null | undefined): string | null {
  const text = remarks?.trim();
  return text ? text : null;
}
