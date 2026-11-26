/**
 * The app's shared formatters: money in naira (en-NG, NGN) and dates in Lagos time.
 * New code uses these. Older features keep their local helpers until they are next changed.
 */

/** The one fallback for a missing value, everywhere in the app. */
export const NOT_PROVIDED = "Not provided";

const LAGOS = "Africa/Lagos";

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: LAGOS });
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: LAGOS,
});

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: LAGOS });

const DECIMAL = /^-?\d+(\.\d+)?$/;

type MoneyValue = number | string | null | undefined;
type DateValue = Date | string | null | undefined;

/**
 * ₦152,112.50. Decimal strings from the API are formatted as they are, never through a float.
 * Missing or unreadable values show NOT_PROVIDED.
 */
export function formatMoney(value: MoneyValue): string {
  if (typeof value === "number") return Number.isFinite(value) ? money.format(value) : NOT_PROVIDED;
  if (typeof value === "string" && DECIMAL.test(value.trim()))
    return money.format(value.trim() as Parameters<typeof money.format>[0]);
  return NOT_PROVIDED;
}

function toDate(value: DateValue): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** 25 Nov 2026, in Lagos time. */
export function formatDate(value: DateValue): string {
  const parsed = toDate(value);
  return parsed ? date.format(parsed) : NOT_PROVIDED;
}

/** 25 Nov 2026, 09:15, in Lagos time (24-hour clock). */
export function formatDateTime(value: DateValue): string {
  const parsed = toDate(value);
  return parsed ? dateTime.format(parsed) : NOT_PROVIDED;
}

/** Mar 2023, in Lagos time. */
export function formatMonthYear(value: DateValue): string {
  const parsed = toDate(value);
  return parsed ? monthYear.format(parsed) : NOT_PROVIDED;
}

const whole = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

/** 48,250 km. Missing or unreadable readings show NOT_PROVIDED. */
export function formatKm(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${whole.format(value)} km` : NOT_PROVIDED;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "in 5 h", "12 min ago", "2 days ago", "just now". */
export function formatRelative(value: DateValue, now: Date = new Date()): string {
  const parsed = toDate(value);
  if (!parsed) return NOT_PROVIDED;
  const diff = parsed.getTime() - now.getTime();
  const span = Math.abs(diff);
  if (span < MINUTE) return "just now";
  const amount =
    span < HOUR
      ? `${Math.floor(span / MINUTE)} min`
      : span < 2 * DAY
        ? `${Math.floor(span / HOUR)} h`
        : `${Math.floor(span / DAY)} days`;
  return diff > 0 ? `in ${amount}` : `${amount} ago`;
}
