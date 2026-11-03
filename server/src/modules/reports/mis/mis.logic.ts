import { Prisma } from '@prisma/client';
import type { ServiceCategory } from '../../workshop/master-kinds';
import { addDays, daysBetween } from '../core/dates';

/**
 * Pure rules behind the Service MIS reports (#97). The SQL in mis.data.ts loads facts; everything
 * here is arithmetic and grouping, so it is unit-tested without a database.
 */

/** Report order of the service categories (PDI last, as in the legacy MIS columns). */
export const CATEGORY_ORDER: readonly ServiceCategory[] = ['FREE', 'PAID', 'RUNNING_REPAIR', 'OTHER', 'ACCIDENTAL', 'PDI'];

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  FREE: 'Free services',
  PAID: 'Paid service',
  RUNNING_REPAIR: 'Running repair',
  OTHER: 'Other services',
  ACCIDENTAL: 'Accidental',
  PDI: 'PDI',
};

/** The category of a service type; masters without a valid category fall back to their flags. */
export function categoryOf(category: string | null | undefined, preDelivery = false, freeService = false): ServiceCategory {
  const upper = (category ?? '').trim().toUpperCase();
  if ((CATEGORY_ORDER as readonly string[]).includes(upper)) return upper as ServiceCategory;
  if (preDelivery) return 'PDI';
  return freeService ? 'FREE' : 'OTHER';
}

// ── Money and ratios (decimal arithmetic, 2dp) ─────────────────────────────────

const ZERO = new Prisma.Decimal(0);
const round2 = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();

export function sumMoney(values: readonly number[]): number {
  return round2(values.reduce((total, value) => total.plus(Number.isFinite(value) ? value : 0), ZERO));
}

export function subtractMoney(a: number, b: number): number {
  return round2(new Prisma.Decimal(a).minus(b));
}

/** amount ÷ count to 2dp; 0 when there is nothing to divide by. */
export function perUnit(amount: number, count: number): number {
  return count ? round2(new Prisma.Decimal(amount).div(count)) : 0;
}

/** part as a % of whole to 2dp; 0 when the whole is 0. */
export function percentOf(part: number, whole: number): number {
  return whole ? round2(new Prisma.Decimal(part).times(100).div(whole)) : 0;
}

/**
 * Each value's share of their total in % to 2dp, adjusted (largest remainder) so the shares add
 * up to exactly 100.00 whenever the total is not zero.
 */
export function percentShares(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum.plus(value), ZERO);
  if (total.isZero()) return values.map(() => 0);
  const exact = values.map((value) => new Prisma.Decimal(value).times(10_000).div(total));
  const floors = exact.map((value) => value.floor());
  let shortfall = 10_000 - floors.reduce((sum, value) => sum + value.toNumber(), 0);
  const order = exact.map((value, index) => ({ index, remainder: value.minus(floors[index]).toNumber() })).sort((a, b) => b.remainder - a.remainder);
  const cents = floors.map((value) => value.toNumber());
  for (const { index } of order) {
    if (shortfall <= 0) break;
    cents[index] += 1;
    shortfall -= 1;
  }
  return cents.map((value) => value / 100);
}

/** Split a discount between two amounts in proportion; the second share takes the rounding. */
export function splitDiscount(discount: number, first: number, second: number): [number, number] {
  const base = new Prisma.Decimal(first).plus(second);
  if (!discount || base.isZero()) return [0, 0];
  const share = round2(new Prisma.Decimal(discount).times(first).div(base));
  return [share, subtractMoney(discount, share)];
}

// ── Months and day ranges (S1) ─────────────────────────────────────────────────

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function splitMonth(month: string) {
  const [year, value] = month.split('-').map(Number);
  return { year, month: value };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Months from..to inclusive (YYYY-MM); empty when to is before from. */
export function monthSpan(from: string, to: string): string[] {
  const start = splitMonth(from);
  const end = splitMonth(to);
  const months: string[] = [];
  let { year, month } = start;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(monthKey(year, month));
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
  }
  return months;
}

/** The 12 months of the calendar year before `today` (YYYY-MM-DD). */
export function previousYearMonths(today: string): string[] {
  const year = Number(today.slice(0, 4)) - 1;
  return monthSpan(`${year}-01`, `${year}-12`);
}

export function daysInMonth(month: string): number {
  const { year, month: value } = splitMonth(month);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

export interface MonthBucket {
  /** YYYY-MM */
  key: string;
  label: string;
  /** First and last local day counted (YYYY-MM-DD); null when the day range misses this month (e.g. 30–31 in February). */
  from: string | null;
  to: string | null;
}

/** One bucket per month, limited to days fromDay..toDay of each month (clamped to the month's length). */
export function monthBuckets(months: readonly string[], fromDay = 1, toDay = 31): MonthBucket[] {
  return months.map((key) => {
    const { year, month } = splitMonth(key);
    const last = daysInMonth(key);
    const label = `${MONTH_NAMES[month - 1]} ${year}`;
    if (fromDay > last) return { key, label, from: null, to: null };
    return { key, label, from: `${key}-${String(fromDay).padStart(2, '0')}`, to: `${key}-${String(Math.min(toDay, last)).padStart(2, '0')}` };
  });
}

/** The bucket a local date (YYYY-MM-DD) falls in, or null when it is outside every bucket's days. */
export function bucketOf(date: string, buckets: readonly MonthBucket[]): string | null {
  const bucket = buckets.find((candidate) => candidate.from !== null && candidate.to !== null && date >= candidate.from && date <= candidate.to);
  return bucket?.key ?? null;
}

/** The overall from..to local days covered by the buckets, or null when none has days. */
export function bucketRange(buckets: readonly MonthBucket[]): { from: string; to: string } | null {
  const withDays = buckets.filter((bucket) => bucket.from && bucket.to);
  if (!withDays.length) return null;
  return { from: withDays[0].from!, to: withDays[withDays.length - 1].to! };
}

// ── Regular customers (S10) ─────────────────────────────────────────────────────

export interface Visit {
  date: string;
  mileage: number | null;
}

/**
 * Visits that count towards "regular": the first visit, then each visit whose mileage is at
 * least `mileageDiff` km above the last counted visit (so comebacks a few km later count once).
 * A visit without a mileage reading counts only when no difference is required.
 */
export function countedVisits<V extends Visit>(visits: readonly V[], mileageDiff: number): V[] {
  const ordered = [...visits].sort((a, b) => (a.date === b.date ? (a.mileage ?? 0) - (b.mileage ?? 0) : a.date < b.date ? -1 : 1));
  const counted: V[] = [];
  let lastMileage: number | null = null;
  for (const visit of ordered) {
    if (counted.length === 0 || mileageDiff <= 0) {
      counted.push(visit);
      if (visit.mileage !== null) lastMileage = visit.mileage;
      continue;
    }
    if (visit.mileage === null) continue;
    if (lastMileage === null || visit.mileage >= lastMileage + mileageDiff) {
      counted.push(visit);
      lastMileage = visit.mileage;
    }
  }
  return counted;
}

/** Average km between consecutive counted visits that both have a reading; null when unknown. */
export function averageKmBetween(visits: readonly Visit[]): number | null {
  const readings = visits.map((visit) => visit.mileage).filter((mileage): mileage is number => mileage !== null);
  if (readings.length < 2) return null;
  return Math.round((readings[readings.length - 1] - readings[0]) / (readings.length - 1));
}

// ── Birthdays and anniversaries (S11) ──────────────────────────────────────────

/** Day and month as one sortable number: 8 October = 1008. */
export function dayMonthKey(month: number, day: number): number {
  return month * 100 + day;
}

export function dayMonthOf(date: string): number {
  return dayMonthKey(Number(date.slice(5, 7)), Number(date.slice(8, 10)));
}

/** Whether a day-month falls in from..to, wrapping over 31 December when from is after to. */
export function inDayMonthRange(key: number, from: number, to: number): boolean {
  return from <= to ? key >= from && key <= to : key >= from || key <= to;
}

/** Sort position from the start of the range, so a wrapped range lists December before January. */
export function dayMonthPosition(key: number, from: number): number {
  return key >= from ? key - from : key + 1300 - from;
}

export function isValidDayMonth(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(`2024-${String(month).padStart(2, '0')}`);
}

// ── Vehicles that skipped a free service (S13) ─────────────────────────────────

export interface FreeServiceRule {
  serviceTypeId: string;
  code: string;
  label: string;
  /** Position in the free service sequence (1F before 2F before 3F). */
  order: number;
  daysLimit: number | null;
  mileageLimit: number | null;
}

export interface SkippedService {
  serviceTypeId: string;
  code: string;
  label: string;
  dueBy: string | null;
  dueKm: number | null;
  reason: 'DAYS' | 'KM' | 'NEXT_DONE';
}

/**
 * Free services a vehicle has skipped as at `today`: not done, and either past its due limit
 * (days from the sale date, or km) or, with no limit set, a later free service has been done.
 */
export function skippedFreeServices(
  vehicle: { saleDate: string; mileage: number | null; done: ReadonlySet<string> },
  rules: readonly FreeServiceRule[],
  today: string,
): SkippedService[] {
  const skipped: SkippedService[] = [];
  for (const rule of rules) {
    if (vehicle.done.has(rule.serviceTypeId)) continue;
    const dueBy = rule.daysLimit !== null ? addDays(vehicle.saleDate, rule.daysLimit) : null;
    const base = { serviceTypeId: rule.serviceTypeId, code: rule.code, label: rule.label, dueBy, dueKm: rule.mileageLimit };
    if (dueBy !== null && daysBetween(dueBy, today) > 0) skipped.push({ ...base, reason: 'DAYS' });
    else if (rule.mileageLimit !== null && vehicle.mileage !== null && vehicle.mileage > rule.mileageLimit) skipped.push({ ...base, reason: 'KM' });
    else if (rule.daysLimit === null && rule.mileageLimit === null && rules.some((later) => later.order > rule.order && vehicle.done.has(later.serviceTypeId)))
      skipped.push({ ...base, reason: 'NEXT_DONE' });
  }
  return skipped;
}

// ── Delivery deviation (S5, S15) ───────────────────────────────────────────────

/** Delivered after the promised time. */
export function lateByTime(promisedAt: Date | null, deliveredAt: Date | null): boolean {
  return Boolean(promisedAt && deliveredAt && deliveredAt.getTime() > promisedAt.getTime());
}

/** Delivered on a later local day than promised. */
export function lateByDate(promisedDay: string | null, deliveredDay: string | null): boolean {
  return Boolean(promisedDay && deliveredDay && deliveredDay > promisedDay);
}
