import type { PresetKey } from "../types";
import { REPORT_TZ } from "./report-format";

const DAY_MS = 86_400_000;

/** Today's date (YYYY-MM-DD) in branch local time. */
export function localToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function monthStart(date: string): string {
  return `${date.slice(0, 8)}01`;
}

function monthEnd(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const PRESET_LABELS: Record<PresetKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  tomorrow: "Tomorrow",
  thisWeek: "This week",
  thisMonth: "This month",
  lastMonth: "Last month",
};

/** from/to for a preset (a single-date preset has from === to). Weeks start on Monday. */
export function presetRange(preset: PresetKey, today = localToday()): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const day = addDays(today, -1);
      return { from: day, to: day };
    }
    case "tomorrow": {
      const day = addDays(today, 1);
      return { from: day, to: day };
    }
    case "thisWeek":
      return { from: addDays(today, -((weekday(today) + 6) % 7)), to: today };
    case "thisMonth":
      return { from: monthStart(today), to: today };
    case "lastMonth": {
      const lastDay = addDays(monthStart(today), -1);
      return { from: monthStart(lastDay), to: monthEnd(lastDay) };
    }
  }
}

export function isDateString(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

export function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((value) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / DAY_MS);
}
