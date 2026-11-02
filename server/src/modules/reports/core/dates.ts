/**
 * Report dates are calendar days in the branch's local time (WAT for every branch today).
 * Filters arrive as YYYY-MM-DD and are turned into UTC instants here, so SQL compares
 * indexed timestamp columns against plain bounds instead of converting every row.
 */
export const REPORT_TZ = process.env.REPORT_TZ || 'Africa/Lagos';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const { year, month, day } = parts(value);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (0 when equal). */
export function daysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

/** Milliseconds the time zone is ahead of UTC at `instant`. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const seconds = Math.floor(instant / 1000) * 1000;
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(seconds));
  const get = (type: string) => Number(formatted.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - seconds;
}

/** The UTC instant at which local midnight starts `date` in `timeZone`. */
export function startOfLocalDay(date: string, timeZone = REPORT_TZ): Date {
  const { year, month, day } = parts(date);
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - zoneOffsetMs(guess, timeZone);
  // Re-check at the result so a DST change between the guess and midnight is respected.
  return new Date(guess - zoneOffsetMs(first, timeZone));
}

/** [start, end) UTC bounds covering the local calendar days from..to inclusive. */
export function localDayRange(from: string, to: string, timeZone = REPORT_TZ) {
  return { start: startOfLocalDay(from, timeZone), end: startOfLocalDay(addDays(to, 1), timeZone) };
}

/** Today's local calendar date. */
export function localToday(timeZone = REPORT_TZ, now = new Date()): string {
  return localDateOf(now, timeZone);
}

/** The local calendar date (YYYY-MM-DD) of an instant. */
export function localDateOf(instant: Date, timeZone = REPORT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}
