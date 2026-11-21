import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import type { RepeatReason, RepeatSource, RepeatStatus, RepeatWindow } from "../types/repeat-job.types";

export const REPEAT_PERMISSIONS = {
  READ: "repeatjob:read",
  REVIEW: "repeatjob:review",
  LIST: "report:repeat-list",
  ANALYSIS: "report:repeat-analysis",
  SUMMARY: "report:repeat-summary",
} as const;

/** Most reasons a reviewer may give (mirrors the server). */
export const MAX_REPEAT_REASONS = 5;

export const REPEAT_STATUS: Record<RepeatStatus, { label: string; short: string; tone: StatusTone }> = {
  PENDING_REVIEW: { label: "Pending review", short: "Repeat · pending", tone: "amber" },
  CONFIRMED: { label: "Confirmed repeat", short: "Repeat · confirmed", tone: "red" },
  NOT_REPEAT: { label: "Not a repeat", short: "Not a repeat", tone: "gray" },
};

export const REPEAT_SOURCE: Record<RepeatSource, string> = { AUTOMATIC: "Automatic", MANUAL: "Manual" };

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) : "—";
}

export function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "—";
}

export const formatKm = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${value.toLocaleString("en-GB")} km`);
export const formatDays = (value: number) => `${value} ${value === 1 ? "day" : "days"}`;

/** "15 days or 500 km" (or "days only"); "not recorded" on records back-filled from old repeat jobs. */
export function windowText(window: RepeatWindow | { days: number; km: number | null }) {
  if (window.days === null) return "window not recorded";
  return window.km ? `${window.days} days or ${window.km.toLocaleString("en-GB")} km` : `${window.days} days`;
}

/** Whether each difference is inside the window (for highlighting the limit that triggered the flag). */
export function withinWindow(window: RepeatWindow, days: number, km: number | null) {
  return {
    days: window.days !== null && days <= window.days,
    km: window.km !== null && km !== null && km <= window.km,
  };
}

export const reasonText = (reasons: RepeatReason[]) => reasons.map((reason) => `${reason.code} ${reason.description}`).join("; ");

/**
 * Toggles a reason in the reviewer's selection, keeping the server's rules: "not a repeat job"
 * replaces everything else, any other reason drops it, and at most five reasons.
 */
export function toggleReason(selected: string[], reason: { id: string; isNotRepeat: boolean }, notRepeatIds: string[]): string[] {
  if (selected.includes(reason.id)) return selected.filter((id) => id !== reason.id);
  if (reason.isNotRepeat) return [reason.id];
  const rest = selected.filter((id) => !notRepeatIds.includes(id));
  return rest.length >= MAX_REPEAT_REASONS ? rest : [...rest, reason.id];
}

/** Problem with the review before saving, or null. */
export function reviewProblem(selected: string[], remarks: string): string | null {
  if (selected.length === 0) return "Choose at least one reason.";
  if (!remarks.trim()) return "Enter remarks for the reasons given.";
  return null;
}

export function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } })?.response?.data;
  return data?.errors?.[0]?.message ?? data?.message ?? fallback;
}
