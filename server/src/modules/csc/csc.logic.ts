import { addDays, daysBetween } from '../reports/core/dates';

/**
 * CSC (service due reminders) rules. Pure functions over calendar dates (YYYY-MM-DD) so the
 * due-date formula can be tested without a database. See doc/csc.md for the business rules.
 */

export const CSC_STAGES = ['FIRST', 'SECOND', 'NOT_VISITED'] as const;
export type CscStageName = (typeof CSC_STAGES)[number];
export const MAX_CONTACT_SLOTS = 3;
/** Legacy defaults for the "consider job against CSC" window and the "not visited for last" months. */
export const DEFAULT_MATCH_DAYS = 10;
export const DEFAULT_NOT_VISITED_MONTHS = 48;

export interface ScheduleRule {
  id: string;
  serviceTypeId: string;
  code: string;
  effectiveDate: string;
  dueDays: number;
  dueKm: number;
  rotationDays: number;
  rotationKm: number;
  followUp1Days: number;
  followUp2Days: number;
  variationDays: number;
  variationKm: number;
  matchDaysBefore: number;
  matchDaysAfter: number;
  notVisitedMonths: number;
}

export interface Visit {
  jobCardId: string;
  date: string;
  mileage: number | null;
  serviceTypeId: string | null;
}

export interface DueService {
  rule: ScheduleRule;
  dueDate: string;
  dueMileage: number | null;
}

const latestFirst = (a: Visit, b: Visit) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1);
const laterOf = (a: string, b: string) => (a > b ? a : b);

/** The vehicle's last visit, or null. */
export function lastVisitOf(visits: Visit[]): Visit | null {
  return [...visits].sort(latestFirst)[0] ?? null;
}

/**
 * The rule version that applies to a vehicle: the latest effective on or before its start (sale)
 * date, else the earliest. Legacy "before date / after date" split the schedule by sale date.
 * TODO(confirm): versions follow the sale date, not the date the cases are generated.
 */
export function pickVersion(rules: ScheduleRule[], startDate: string): ScheduleRule[] {
  const dates = [...new Set(rules.map((rule) => rule.effectiveDate))].sort();
  if (!dates.length) return [];
  const chosen = [...dates].reverse().find((date) => date <= startDate) ?? dates[0];
  return rules.filter((rule) => rule.effectiveDate === chosen).sort((a, b) => a.dueDays - b.dueDays || a.code.localeCompare(b.code));
}

/** Start of the schedule: sale date, else sale invoice date, else PDI date, else the first visit. */
export function startDateOf(input: { saleDate: string | null; saleInvoiceDate: string | null; pdiDate: string | null; visits: Visit[] }): string | null {
  const first = [...input.visits].sort(latestFirst).at(-1)?.date ?? null;
  return input.saleDate ?? input.saleInvoiceDate ?? input.pdiDate ?? first;
}

/** First day a vehicle last seen on `lastSeen` is still kept (not dropped as "not visited for N months"). */
export function notVisitedCutoff(asOf: string, months: number): string {
  const [year, month, day] = asOf.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * The next service a vehicle is due for, as of the generation start date.
 *
 * - The schedule is ordered by due days; the last service (RG) is the periodic one.
 * - After the highest scheduled service already done, each later free service is due on
 *   start + dueDays (km = dueKm). It lapses when due + variationDays is before the later of the
 *   last visit and `asOf`; the next one is then tried.
 * - Then the periodic service: its last visit + rotationDays (km = that reading + rotationKm), or
 *   start + its dueDays when never done, rolled forward by rotation until it has not lapsed.
 * TODO(confirm): the legacy formula lives in the old program (open question 2); this is the reading
 * of the master agreed in doc/plans/csc-plan.md. Due mileage is shown, not used to select vehicles.
 */
export function nextDue(input: { schedule: ScheduleRule[]; start: string; visits: Visit[]; asOf: string }): DueService | null {
  const schedule = input.schedule;
  if (!schedule.length) return null;
  const last = lastVisitOf(input.visits);
  const floor = laterOf(last?.date ?? input.start, input.asOf);
  const doneIds = new Set(input.visits.flatMap((visit) => (visit.serviceTypeId ? [visit.serviceTypeId] : [])));
  let doneIndex = -1;
  schedule.forEach((rule, index) => {
    if (doneIds.has(rule.serviceTypeId)) doneIndex = index;
  });

  const periodic = schedule[schedule.length - 1];
  for (let index = doneIndex + 1; index < schedule.length - 1; index += 1) {
    const rule = schedule[index];
    const dueDate = addDays(input.start, rule.dueDays);
    if (addDays(dueDate, rule.variationDays) >= floor) return { rule, dueDate, dueMileage: rule.dueKm };
  }

  const lastPeriodic = [...input.visits].sort(latestFirst).find((visit) => visit.serviceTypeId === periodic.serviceTypeId) ?? null;
  let dueDate = lastPeriodic ? addDays(lastPeriodic.date, periodic.rotationDays) : addDays(input.start, periodic.dueDays);
  let dueMileage: number | null = lastPeriodic ? (lastPeriodic.mileage === null ? null : lastPeriodic.mileage + periodic.rotationKm) : periodic.dueKm;
  if (periodic.rotationDays <= 0) return addDays(dueDate, periodic.variationDays) >= floor ? { rule: periodic, dueDate, dueMileage } : null;
  // Roll a missed periodic service forward (bounded: about 250 years of 90-day rotations).
  for (let step = 0; step < 1000 && addDays(dueDate, periodic.variationDays) < floor; step += 1) {
    dueDate = addDays(dueDate, periodic.rotationDays);
    dueMileage = dueMileage === null ? null : dueMileage + periodic.rotationKm;
  }
  return { rule: periodic, dueDate, dueMileage };
}

/** When to make the 1st and 2nd calls for a case. */
export function followUpDates(dueDate: string, rule: Pick<ScheduleRule, 'followUp1Days' | 'followUp2Days'>) {
  return { followUp1Date: addDays(dueDate, -rule.followUp1Days), followUp2Date: addDays(dueDate, -rule.followUp2Days) };
}

/** First local date on which a job counts as the visit for a case ("consider job against CSC"). */
export function matchFrom(dueDate: string, matchDaysBefore: number): string {
  return addDays(dueDate, -matchDaysBefore);
}

/** The earliest visit that satisfies a case: on or after due − matchDaysBefore (late visits count too). */
export function matchingVisit(visits: Visit[], dueDate: string, matchDaysBefore: number): Visit | null {
  const from = matchFrom(dueDate, matchDaysBefore);
  return [...visits].filter((visit) => visit.date >= from).sort((a, b) => -latestFirst(a, b))[0] ?? null;
}

export type VisitTiming = 'EARLY' | 'ON_TIME' | 'LATE';

/** Early = before the due date; on time = within matchDaysAfter of it; late = after that. */
export function visitTiming(visitDate: string, dueDate: string, matchDaysAfter: number): VisitTiming {
  if (visitDate < dueDate) return 'EARLY';
  return daysBetween(dueDate, visitDate) <= matchDaysAfter ? 'ON_TIME' : 'LATE';
}

/** An open case is "not visited" once the match window after its due date has passed. */
export function isNotVisited(input: { status: string; dueDate: string; matchDaysAfter: number }, today: string): boolean {
  return input.status === 'OPEN' && addDays(input.dueDate, input.matchDaysAfter) < today;
}

/** Days since the due date (0 before it). */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.max(0, daysBetween(dueDate, today));
}

export interface ContactInput {
  slot: number;
  contactDate: string;
  contactPerson?: string | null;
  remarks?: string | null;
  doneById?: string | null;
}

/** Problems with the contact lines of one stage, or null. */
export function contactProblem(contacts: ContactInput[], today: string): string | null {
  const slots = contacts.map((contact) => contact.slot);
  if (new Set(slots).size !== slots.length) return 'Each contact line can be saved once';
  if (contacts.some((contact) => contact.slot < 1 || contact.slot > MAX_CONTACT_SLOTS)) return `Use contact lines 1 to ${MAX_CONTACT_SLOTS}`;
  if (contacts.some((contact) => contact.contactDate > today)) return 'A contact date cannot be in the future';
  if (contacts.some((contact) => !contact.contactPerson?.trim() && !contact.remarks?.trim()))
    return 'Enter the person spoken to or remarks on each contact line';
  return null;
}

export type CscClosure = 'FINAL' | 'PARTIAL';

/** What closing a stage with a reason does: FINAL closes the case, PARTIAL only the stage. */
export function closureEffect(type: CscClosure): { closesCase: boolean } {
  return { closesCase: type === 'FINAL' };
}

/** Only open cases take follow-up entries. */
export function followUpBlocked(status: string): string | null {
  if (status === 'VISITED') return 'The vehicle has already visited for this service';
  if (status === 'CLOSED') return 'This case is closed';
  return null;
}

/** The date a stage's list is filtered on. */
export function stageDate(stage: CscStageName, row: { followUp1Date: string; followUp2Date: string; dueDate: string }): string {
  if (stage === 'FIRST') return row.followUp1Date;
  if (stage === 'SECOND') return row.followUp2Date;
  return row.dueDate;
}

/** Numbers of a rule that must hold together. */
export function ruleProblem(rule: Pick<ScheduleRule, 'dueDays' | 'rotationDays' | 'followUp1Days' | 'followUp2Days'>): string | null {
  if (rule.dueDays < 1) return 'Due days must be at least 1';
  if (rule.rotationDays < 1) return 'Rotation days must be at least 1';
  if (rule.followUp2Days > rule.followUp1Days) return 'The 1st follow-up must come on or before the 2nd (1st follow-up days ≥ 2nd)';
  if (rule.followUp1Days > rule.dueDays) return '1st follow-up days cannot be more than the due days';
  return null;
}
