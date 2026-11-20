import { RepeatJobStatus } from '@prisma/client';
import { daysBetween, localDateOf, REPORT_TZ } from '../reports/core/dates';
import { BadRequestError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';

/** The branch's repeat window: a job within either limit of the last billed job is a repeat. */
export interface RepeatWindow {
  days: number;
  /** null = days only. */
  km: number | null;
}

export interface JobPoint {
  date: Date;
  mileage: number | null;
}

export interface RepeatDifference {
  /** Local calendar days from the previous job's date to this one. */
  days: number;
  /** Null when either mileage is missing or the reading went down (odometer replaced). */
  km: number | null;
}

export interface WindowMatch {
  matched: boolean;
  byDays: boolean;
  byKm: boolean;
}

/** Most reasons a reviewer may give (legacy had five slots). */
export const MAX_REPEAT_REASONS = 5;

/** Legacy statuses of finished jobs: billed, or delivered (Closed) after billing. */
export const BILLED_JOB_STATUSES = ['BILLED', 'Billed', 'DELIVERED', 'Closed'] as const;
export const CANCELLED_JOB_STATUSES = ['CANCELLED', 'Cancelled'] as const;

export function repeatDifference(current: JobPoint, previous: JobPoint, timeZone = REPORT_TZ): RepeatDifference {
  const days = Math.max(0, daysBetween(localDateOf(previous.date, timeZone), localDateOf(current.date, timeZone)));
  const km = current.mileage !== null && previous.mileage !== null && current.mileage >= previous.mileage ? current.mileage - previous.mileage : null;
  return { days, km };
}

/** Either limit is enough (legacy). A lower reading never counts as within the km window. */
export function matchWindow(difference: RepeatDifference, window: RepeatWindow): WindowMatch {
  const byDays = difference.days <= window.days;
  const byKm = window.km !== null && difference.km !== null && difference.km <= window.km;
  return { matched: byDays || byKm, byDays, byKm };
}

export interface ReasonOption {
  id: string;
  code: string;
  isNotRepeat: boolean;
  active: boolean;
}

/** Whether a REPEAT_REASON master row means "not a repeat job" (attribute, or legacy code 0). */
export function isNotRepeatReason(row: { code: string; attributes: unknown }): boolean {
  const attributes = row.attributes as { isNotRepeat?: unknown } | null;
  if (attributes && typeof attributes.isNotRepeat === 'boolean') return attributes.isNotRepeat;
  return row.code.trim() === '0';
}

const reviewError = (message: string, field: string) => new BadRequestError(message).withCode('FIELD_VALIDATION', { field });

/**
 * Checks a review against the reason master and returns the status it sets: one to five distinct,
 * known reasons; "not a repeat job" alone; remarks required. Inactive reasons may stay on a record
 * that already had them, but cannot be newly chosen.
 */
export function reviewOutcome(
  input: { reasonIds: string[]; remarks: string | null | undefined },
  options: ReasonOption[],
  alreadyChosen: string[] = [],
): { status: RepeatJobStatus; remarks: string } {
  const { reasonIds } = input;
  if (reasonIds.length < 1) throw reviewError('Choose at least one reason', 'reasonIds');
  if (reasonIds.length > MAX_REPEAT_REASONS) throw reviewError(`Choose at most ${MAX_REPEAT_REASONS} reasons`, 'reasonIds');
  if (new Set(reasonIds).size !== reasonIds.length) throw reviewError('A reason can be chosen only once', 'reasonIds');

  const chosen = reasonIds.map((id) => {
    const option = options.find((row) => row.id === id);
    if (!option) throw reviewError('Choose reasons from the repeat reason list', 'reasonIds');
    if (!option.active && !alreadyChosen.includes(id)) throw reviewError(`Reason ${option.code} is no longer in use`, 'reasonIds');
    return option;
  });

  const notRepeat = chosen.some((option) => option.isNotRepeat);
  if (notRepeat && chosen.length > 1) throw reviewError('"Not a repeat job" cannot be combined with other reasons', 'reasonIds');

  const remarks = input.remarks?.trim() ?? '';
  if (!remarks) throw reviewError('Enter remarks for the reasons given', 'remarks');

  return { status: notRepeat ? RepeatJobStatus.NOT_REPEAT : RepeatJobStatus.CONFIRMED, remarks };
}

/** A pending record may be reviewed by anyone with repeatjob:review; a reviewed one by its reviewer or an Admin. */
export function canReview(record: { status: RepeatJobStatus; reviewedById: string | null }, user: { userId: string; role: string }): boolean {
  if (record.status === RepeatJobStatus.PENDING_REVIEW || !record.reviewedById) return true;
  return record.reviewedById === user.userId || user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN;
}

/** Repeats that count against the workshop: confirmed and still pending ("not a repeat" is left out). */
export function countsAsRepeat(status: RepeatJobStatus | string): boolean {
  return status === RepeatJobStatus.CONFIRMED || status === RepeatJobStatus.PENDING_REVIEW;
}

/** Previous job's main mechanic and labour-line technicians, once each. */
export function technicianIds(mainTechnicianId: string | null, labourTechnicianIds: (string | null)[]): string[] {
  return Array.from(new Set([mainTechnicianId, ...labourTechnicianIds].filter((id): id is string => Boolean(id))));
}
