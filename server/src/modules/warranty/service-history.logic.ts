/**
 * The service history rule for warranty (Reading A, maintenance compliance, confirmed with the
 * warranty lead): in every warranty year since sale, counted from the sale date, the vehicle must be
 * serviced at least every `intervalMonths` or every `intervalKm`, whichever comes first. A gap longer
 * than either limit (plus grace) is a missed service. The system shows the evidence and a verdict;
 * the warranty officer decides. Pure and database-free.
 *
 * Calendar dates are Lagos days (UTC+1 all year), like the coverage check.
 */
import { dayNumberToIso, lagosDayNumber } from "./warranty.logic";

export interface ServiceRule {
  intervalMonths: number;
  intervalKm: number;
  /** Periods per warranty year on the grid; 12 / servicesPerYear months each (4 gives quarters). */
  servicesPerYear: number;
  graceKm: number;
  graceDays: number;
}

/** Default rule. TODO(confirm) the grace values with the warranty lead (default none). */
export const DEFAULT_SERVICE_RULE: ServiceRule = {
  intervalMonths: 3,
  intervalKm: 5000,
  servicesPerYear: 4,
  graceKm: 0,
  graceDays: 0,
};

/** servicesPerYear must split the year into whole months. */
export const SERVICES_PER_YEAR_OPTIONS = [1, 2, 3, 4, 6, 12] as const;

export interface RuleOverride {
  serviceIntervalMonths: number | null;
  serviceIntervalKm: number | null;
  servicesPerYear: number | null;
  serviceGraceKm: number | null;
  serviceGraceDays: number | null;
}

/** The warranty settings rule with any value the vehicle model overrides. */
export function resolveServiceRule(settings: ServiceRule, model: RuleOverride | null): ServiceRule {
  return {
    intervalMonths: model?.serviceIntervalMonths ?? settings.intervalMonths,
    intervalKm: model?.serviceIntervalKm ?? settings.intervalKm,
    servicesPerYear: model?.servicesPerYear ?? settings.servicesPerYear,
    graceKm: model?.serviceGraceKm ?? settings.graceKm,
    graceDays: model?.serviceGraceDays ?? settings.graceDays,
  };
}

export type ServiceSource = "JOB" | "OUTSIDE";

export interface CountedService {
  id: string;
  date: Date;
  /** Null when no reading was recorded; the km limit is then not checked for that gap. */
  mileage: number | null;
  source: ServiceSource;
  /** Job number, or the dealer for an outside record. */
  label: string;
}

export interface ServiceHistoryInput {
  saleDate: Date | null;
  /** The day the rule is checked on: the current job's opening. */
  asOf: Date;
  /** The reading on that day (the current job's mileage). */
  currentMileage: number | null;
  services: CountedService[];
  rule: ServiceRule;
}

/** Days and whole calendar months between two Lagos days, for "4 months 2 weeks". */
export interface Span {
  days: number;
  months: number;
  /** Days left over after the whole months. */
  extraDays: number;
}

export interface ServiceOnGrid {
  id: string;
  date: string;
  mileage: number | null;
  source: ServiceSource;
  label: string;
  /** Since the previous service, or since the sale for the first one. */
  sinceLast: Span;
  kmSinceLast: number | null;
}

export type MissedReason = "TIME" | "DISTANCE" | "BOTH";

export interface MissedService {
  year: number;
  period: number;
  /** The last day the service could be done (time), or the day the overrun was found (distance only). */
  dueOn: string;
  reason: MissedReason;
  /** The service before the gap, or the sale. */
  fromDate: string;
  fromSale: boolean;
  /** The service that ended the gap; null while the gap is still open on asOf. */
  toDate: string | null;
  gap: Span;
  kmGap: number | null;
}

export type PeriodStatus = "ON_TIME" | "MISSED" | "UPCOMING" | "NOT_DUE";

export interface PeriodRow {
  period: number;
  start: string;
  /** Last day of the period. */
  end: string;
  status: PeriodStatus;
  services: ServiceOnGrid[];
  missed: MissedService[];
  /** UPCOMING: the next due date when it falls in this period. */
  dueOn: string | null;
}

export interface YearRow {
  year: number;
  start: string;
  end: string;
  /** asOf falls in this year. */
  current: boolean;
  missedCount: number;
  periods: PeriodRow[];
}

export type InsufficientReason = "NO_SALE_DATE" | "SALE_DATE_IN_FUTURE" | "NO_MILEAGE";

export type ServiceVerdict =
  | { kind: "REGULAR" }
  | { kind: "IRREGULAR"; missedCount: number; years: number[]; where: { year: number; period: number }[] }
  | { kind: "INSUFFICIENT_DATA"; missing: InsufficientReason[] };

export interface ServiceHistory {
  rule: ServiceRule;
  saleDate: string | null;
  asOf: string;
  currentMileage: number | null;
  verdict: ServiceVerdict;
  years: YearRow[];
  missed: MissedService[];
  /** The next service: due by this date or this reading, whichever comes first. */
  nextDue: { date: string; mileage: number | null } | null;
  /** Services counted, oldest first (only those between the sale and asOf). */
  services: ServiceOnGrid[];
}

// ── Calendar helpers (Lagos day numbers) ─────────────────────────────────────

function ymd(day: number): { y: number; m: number; d: number } {
  const date = new Date(day * 86_400_000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

/** The same day `months` later; the 31st becomes the month's last day when it has fewer days. */
export function addMonthsDay(day: number, months: number): number {
  const { y, m, d } = ymd(day);
  const lastDay = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m + months, Math.min(d, lastDay)) / 86_400_000);
}

/** Days and whole calendar months from one day to a later one. */
export function spanBetween(from: number, to: number): Span {
  let months = 0;
  while (addMonthsDay(from, months + 1) <= to) months += 1;
  return { days: to - from, months, extraDays: to - addMonthsDay(from, months) };
}

// ── Evaluation ───────────────────────────────────────────────────────────────

interface Point {
  day: number;
  mileage: number | null;
  service: ServiceOnGrid | null;
}

const kmBetween = (from: number | null, to: number | null) =>
  from === null || to === null || to < from ? null : to - from;

/** Which warranty year and period a day falls in (1-based). */
function placeOf(saleDay: number, day: number, periodMonths: number, periodsPerYear: number) {
  let year = 1;
  while (addMonthsDay(saleDay, 12 * year) <= day) year += 1;
  const yearStart = addMonthsDay(saleDay, 12 * (year - 1));
  let period = 1;
  while (period < periodsPerYear && addMonthsDay(yearStart, periodMonths * period) <= day) period += 1;
  return { year, period };
}

/**
 * Splits the time since sale into warranty years and periods (quarters by default) and checks every
 * gap: sale to first service, between services, and last service to asOf. Each due date a gap passes
 * without a service is one missed service (TODO(confirm): a long gap counts once per due date passed).
 * A gap over the km limit alone is one missed service, placed where the next service found it.
 */
export function evaluateServiceHistory(input: ServiceHistoryInput): ServiceHistory {
  const { rule } = input;
  const asOfDay = lagosDayNumber(input.asOf);
  const saleDay = input.saleDate ? lagosDayNumber(input.saleDate) : null;
  const base = {
    rule,
    saleDate: saleDay === null ? null : dayNumberToIso(saleDay),
    asOf: dayNumberToIso(asOfDay),
    currentMileage: input.currentMileage,
  };

  const missing: InsufficientReason[] = [];
  if (saleDay === null) missing.push("NO_SALE_DATE");
  else if (saleDay > asOfDay) missing.push("SALE_DATE_IN_FUTURE");
  if (input.currentMileage === null) missing.push("NO_MILEAGE");
  if (saleDay === null || saleDay > asOfDay) {
    return { ...base, verdict: { kind: "INSUFFICIENT_DATA", missing }, years: [], missed: [], nextDue: null, services: [] };
  }

  const periodsPerYear = rule.servicesPerYear;
  const periodMonths = 12 / periodsPerYear;

  // Services between the sale and asOf, oldest first. Two records of the same day count once.
  const sorted = input.services
    .map((service) => ({ ...service, day: lagosDayNumber(service.date) }))
    .filter((service) => service.day >= saleDay && service.day <= asOfDay)
    .sort((a, b) => a.day - b.day || (a.mileage ?? 0) - (b.mileage ?? 0) || a.id.localeCompare(b.id));

  // A new vehicle is sold at 0 km.
  const points: Point[] = [{ day: saleDay, mileage: 0, service: null }];
  for (const service of sorted) {
    const previous = points[points.length - 1];
    if (previous.service && previous.day === service.day) continue;
    points.push({
      day: service.day,
      mileage: service.mileage,
      service: {
        id: service.id,
        date: dayNumberToIso(service.day),
        mileage: service.mileage,
        source: service.source,
        label: service.label,
        sinceLast: spanBetween(previous.day, service.day),
        kmSinceLast: kmBetween(previous.mileage, service.mileage),
      },
    });
  }

  const kmLimit = rule.intervalKm + rule.graceKm;
  const missed: MissedService[] = [];
  const checkGap = (from: Point, toDay: number, toMileage: number | null, closed: boolean) => {
    const kmGap = kmBetween(from.mileage, toMileage);
    const distance = kmGap !== null && kmGap > kmLimit;
    const dueDays: number[] = [];
    for (let k = 1; ; k += 1) {
      const due = addMonthsDay(from.day, rule.intervalMonths * k) + rule.graceDays;
      if (due >= toDay) break;
      dueDays.push(due);
    }
    const shared = {
      fromDate: dayNumberToIso(from.day),
      fromSale: from.service === null,
      toDate: closed ? dayNumberToIso(toDay) : null,
      gap: spanBetween(from.day, toDay),
      kmGap,
    };
    if (dueDays.length) {
      dueDays.forEach((due, index) => {
        // The service belonged to the period ending the day before it fell due (the Q1 service of a
        // car sold on 10 Jan is due by 10 Apr, the first day of Q2).
        const at = Math.min(Math.max(due - 1, from.day), asOfDay);
        missed.push({ ...placeOf(saleDay, at, periodMonths, periodsPerYear), dueOn: dayNumberToIso(due), reason: index === 0 && distance ? "BOTH" : "TIME", ...shared });
      });
    } else if (distance) {
      missed.push({ ...placeOf(saleDay, toDay, periodMonths, periodsPerYear), dueOn: dayNumberToIso(toDay), reason: "DISTANCE", ...shared });
    }
  };
  for (let i = 1; i < points.length; i += 1) checkGap(points[i - 1], points[i].day, points[i].mileage, true);
  const last = points[points.length - 1];
  // The open gap: overdue on asOf by date (a due date before this visit) or by distance. A service
  // due on the day of this visit is not missed: this visit can be that service.
  checkGap(points[points.length - 1], asOfDay, input.currentMileage, false);

  const nextDueDay = addMonthsDay(last.day, rule.intervalMonths) + rule.graceDays;
  const nextDue = {
    date: dayNumberToIso(nextDueDay),
    mileage: last.mileage === null ? null : last.mileage + kmLimit,
  };

  const services = points.flatMap((point) => (point.service ? [point.service] : []));
  const asOfPlace = placeOf(saleDay, asOfDay, periodMonths, periodsPerYear);
  const years: YearRow[] = [];
  for (let year = 1; year <= asOfPlace.year; year += 1) {
    const yearStart = addMonthsDay(saleDay, 12 * (year - 1));
    const periods: PeriodRow[] = [];
    for (let period = 1; period <= periodsPerYear; period += 1) {
      const start = addMonthsDay(yearStart, periodMonths * (period - 1));
      const end = addMonthsDay(yearStart, periodMonths * period) - 1;
      const inPeriod = services.filter((service) => {
        const day = lagosDayNumber(new Date(`${service.date}T12:00:00Z`));
        return day >= start && day <= end;
      });
      const periodMissed = missed.filter((row) => row.year === year && row.period === period);
      let status: PeriodStatus;
      if (periodMissed.length) status = "MISSED";
      else if (inPeriod.length) status = "ON_TIME";
      else if (end >= asOfDay) status = "UPCOMING";
      else status = "NOT_DUE";
      periods.push({
        period,
        start: dayNumberToIso(start),
        end: dayNumberToIso(end),
        status,
        services: inPeriod,
        missed: periodMissed,
        // Shown on the period the next service belongs to, like a missed one.
        dueOn: status === "UPCOMING" && nextDueDay - 1 >= start && nextDueDay - 1 <= end ? dayNumberToIso(nextDueDay) : null,
      });
    }
    years.push({
      year,
      start: dayNumberToIso(yearStart),
      end: dayNumberToIso(addMonthsDay(saleDay, 12 * year) - 1),
      current: year === asOfPlace.year,
      missedCount: periods.reduce((sum, row) => sum + row.missed.length, 0),
      periods,
    });
  }

  let verdict: ServiceVerdict;
  if (missing.length) verdict = { kind: "INSUFFICIENT_DATA", missing };
  else if (missed.length)
    verdict = {
      kind: "IRREGULAR",
      missedCount: missed.length,
      years: [...new Set(missed.map((row) => row.year))].sort((a, b) => a - b),
      where: missed.map((row) => ({ year: row.year, period: row.period })),
    };
  else verdict = { kind: "REGULAR" };

  return { ...base, verdict, years, missed, nextDue, services };
}

// ── Wording ──────────────────────────────────────────────────────────────────

const INSUFFICIENT_TEXT: Record<InsufficientReason, string> = {
  NO_SALE_DATE: "No sale date is recorded for this vehicle",
  SALE_DATE_IN_FUTURE: "The recorded sale date is after this visit",
  NO_MILEAGE: "No odometer reading is recorded for this visit",
};

/** What to do about each missing fact, for the officer. */
export const INSUFFICIENT_FIX: Record<InsufficientReason, string> = {
  NO_SALE_DATE: "Add the sale date on the vehicle's warranty details (Warranty, Vehicle warranty).",
  SALE_DATE_IN_FUTURE: "Correct the sale date on the vehicle's warranty details.",
  NO_MILEAGE: "Ask the service advisor to record the mileage on Check-in, Details.",
};

export const insufficientText = (reason: InsufficientReason) => INSUFFICIENT_TEXT[reason];

const listOf = (values: string[]) =>
  values.length <= 1 ? values.join("") : `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;

/** One plain sentence for the verdict, as on the check-in alert and the Service history card. */
export function verdictSentence(verdict: ServiceVerdict): string {
  if (verdict.kind === "REGULAR") return "Service history is regular. No missed services.";
  if (verdict.kind === "INSUFFICIENT_DATA")
    return `Service history cannot be checked. ${listOf(verdict.missing.map((reason) => INSUFFICIENT_TEXT[reason]))}.`;
  const count = verdict.missedCount === 1 ? "1 missed service" : `${verdict.missedCount} missed services`;
  const years = verdict.years.length === 1 ? `warranty year ${verdict.years[0]}` : `warranty years ${listOf(verdict.years.map(String))}`;
  return `Service history has ${count} in ${years}.`;
}
