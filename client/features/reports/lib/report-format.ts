import type { ColumnFormat } from "../types";

/** Reports show branch local time (WAT) whatever the viewer's device is set to. */
export const REPORT_TZ = "Africa/Lagos";

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: REPORT_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: REPORT_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const moneyFmt = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 });
const integerFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const hoursFmt = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** dd/mm/yyyy */
export function fmtDate(value: unknown): string {
  const date = toDate(value);
  return date ? dateFmt.format(date) : "";
}

/** HH:mm */
export function fmtTime(value: unknown): string {
  const date = toDate(value);
  return date ? timeFmt.format(date) : "";
}

/** dd/mm/yyyy HH:mm */
export function fmtDateTime(value: unknown): string {
  const date = toDate(value);
  return date ? `${dateFmt.format(date)} ${timeFmt.format(date)}` : "";
}

/** ₦1,234.50 (negative amounts as –₦1,234.50) */
export function fmtMoney(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const text = moneyFmt.format(Math.abs(value));
  return value < 0 ? `–₦${text}` : `₦${text}`;
}

export function fmtNumber(value: unknown, format: ColumnFormat = "number"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (format === "integer") return integerFmt.format(value);
  if (format === "hours") return hoursFmt.format(value);
  if (format === "percent") return `${integerFmt.format(value)}%`;
  return numberFmt.format(value);
}

/** Text shown on screen and in print for a value of the given format. */
export function formatValue(value: unknown, format: ColumnFormat = "text"): string {
  switch (format) {
    case "date":
      return fmtDate(value);
    case "datetime":
      return fmtDateTime(value);
    case "time":
      return fmtTime(value);
    case "money":
      return fmtMoney(value);
    case "number":
    case "integer":
    case "hours":
    case "percent":
      return fmtNumber(value, format);
    default:
      return value === null || value === undefined ? "" : String(value);
  }
}

export function isNumericFormat(format: ColumnFormat | undefined): boolean {
  return format === "money" || format === "number" || format === "integer" || format === "hours" || format === "percent";
}

export function plural(count: number, [one, many]: [string, string]): string {
  return `${integerFmt.format(count)} ${count === 1 ? one : many}`;
}

/** "3h 20m", "1d 2h" */
export function fmtDuration(minutes: number): string {
  const total = Math.round(Math.abs(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}
