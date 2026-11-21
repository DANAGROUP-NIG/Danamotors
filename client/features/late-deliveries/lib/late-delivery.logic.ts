import type { LateKind } from "../types/late-delivery.types";

export const LATE_PERMISSIONS = {
  UPDATE: "jobcard:late-reason:update",
  DATE_DISCREPANCY: "report:promise-date-discrepancy",
  TIME_DISCREPANCY: "report:promise-time-discrepancy",
  DATE_ANALYSIS: "report:promise-date-analysis",
  TIME_ANALYSIS: "report:promise-time-analysis",
  DELAYED_LIST: "report:delayed-deliveries",
} as const;

/** Most reasons a job may have (mirrors the server and the delivery form). */
export const MAX_LATE_REASONS = 6;
export const MAX_LATE_REMARKS = 1000;

export const LATE_KIND: Record<LateKind, { label: string; short: string; title: string; href: string; rule: string }> = {
  DATE: {
    label: "Late by date",
    short: "Date",
    title: "Promise date details",
    href: "/late-deliveries/date",
    rule: "Delivered on a later day than promised.",
  },
  TIME: {
    label: "Late by time",
    short: "Time",
    title: "Promise time details",
    href: "/late-deliveries/time",
    rule: "Delivered on the promised day, after the promised time.",
  },
};

export const otherKind = (kind: LateKind): LateKind => (kind === "DATE" ? "TIME" : "DATE");

/** "3h 20m", "45m", "1d 2h" */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

/** How late, in the screen's terms: whole days for date discrepancies, hours and minutes for time. */
export function lateByText(kind: LateKind | null | undefined, daysLate: number, minutesLate: number): string {
  if (kind === "DATE") return `${daysLate} ${daysLate === 1 ? "day" : "days"}`;
  if (kind === "TIME") return formatDuration(minutesLate);
  return "On time";
}

/** Adds or removes a reason, keeping entry order; ignores a seventh. */
export function toggleReason(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  return selected.length >= MAX_LATE_REASONS ? selected : [...selected, id];
}

/** Problem with the form, or null (mirrors the server). */
export function saveProblem(selected: string[], remarks: string): string | null {
  if (!selected.length) return "Select at least one reason.";
  if (selected.length > MAX_LATE_REASONS) return `Select at most ${MAX_LATE_REASONS} reasons.`;
  if (new Set(selected).size !== selected.length) return "A reason can be selected only once.";
  if (remarks.trim().length > MAX_LATE_REMARKS) return `Remarks can be at most ${MAX_LATE_REMARKS} characters.`;
  return null;
}

export function isDirty(selected: string[], remarks: string, saved: { reasonIds: string[]; remarks: string | null }): boolean {
  return selected.join() !== saved.reasonIds.join() || remarks.trim() !== (saved.remarks ?? "");
}

const LAGOS = "Africa/Lagos";

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: LAGOS }) : "—";
}

export function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LAGOS }) : "—";
}

export function formatDateTime(value?: string | null) {
  return value ? `${formatDate(value)}, ${formatTime(value)}` : "—";
}

/** Local YYYY-MM-DD of an instant (Lagos). */
export function lagosDay(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

/**
 * DATE (later Lagos day), TIME (same day, after the promise) or null, with days and minutes late.
 * Mirrors lateness() on the server.
 */
export function lateKindOf(promisedAt: string, deliveredAt: string): { kind: LateKind | null; daysLate: number; minutesLate: number } {
  const promised = new Date(promisedAt);
  const delivered = new Date(deliveredAt);
  const delayMs = delivered.getTime() - promised.getTime();
  const minutesLate = delayMs > 0 ? Math.ceil(delayMs / 60_000) : 0;
  const days = Math.round((Date.parse(`${lagosDay(delivered)}T00:00:00Z`) - Date.parse(`${lagosDay(promised)}T00:00:00Z`)) / 86_400_000);
  if (days > 0) return { kind: "DATE", daysLate: days, minutesLate };
  if (delayMs > 0) return { kind: "TIME", daysLate: 0, minutesLate };
  return { kind: null, daysLate: 0, minutesLate: 0 };
}

/** First and last day of the month containing `today` (YYYY-MM-DD). */
export function monthRange(today: string): { from: string; to: string } {
  const [year, month] = today.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } })?.response;
  if (response?.data?.errors?.length) return response.data.errors.map((item) => item.message).join(" ");
  return response?.data?.message ?? fallback;
}

export function apiErrorCode(error: unknown): { status?: number; code?: string } {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
  return { status: response?.status, code: response?.data?.code };
}
