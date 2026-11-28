import type { PsfLine, PsfState, PsfStatus } from "../types/psf.types";

export const PSF_PERMISSIONS = {
  READ: "psf:read",
  UPDATE: "psf:update",
  LETTER: "psf:letter",
  ANALYSIS: "report:psf-analysis",
  ANALYSIS_MODEL: "report:psf-analysis-model",
  DISSATISFIED: "report:psf-dissatisfied",
  CLOSED: "report:psf-closed",
  HISTORY: "report:psf-history",
} as const;

export type StatusTone = "emerald" | "red" | "slate" | "amber" | "purple";

/** The legacy legend: code typed on the screen (1-5), label and colour. Mirrors the server. */
export const PSF_STATUS: Record<PsfStatus, { code: number; label: string; short: string; tone: StatusTone; hint: string }> = {
  SATISFIED: { code: 1, label: "Customer satisfied", short: "Satisfied", tone: "emerald", hint: "Reached; happy with the work" },
  DISSATISFIED: { code: 2, label: "Customer dissatisfied", short: "Dissatisfied", tone: "red", hint: "Reached; something was not right" },
  NO_PHONE: { code: 3, label: "No phone", short: "No phone", tone: "slate", hint: "No working number to call" },
  NOT_AVAILABLE: { code: 4, label: "Customer not available", short: "Not available", tone: "amber", hint: "Rang; no answer or call back later" },
  CLOSED: { code: 5, label: "Follow-up closed", short: "Closed", tone: "purple", hint: "Stop following up (give the reason)" },
};

export const PSF_STATUS_ORDER: PsfStatus[] = ["SATISFIED", "DISSATISFIED", "NO_PHONE", "NOT_AVAILABLE", "CLOSED"];

export const PSF_STATES: { value: PsfState; label: string }[] = [
  { value: "toCall", label: "To call" },
  { value: "dissatisfied", label: "Dissatisfied" },
  { value: "satisfied", label: "Satisfied" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

export const MAX_PSF_REMARK = 500;

/** Remark the screen fills in when the caller picks a status and has not typed one (legacy prefilled "Cs"). */
export const DEFAULT_REMARK: Partial<Record<PsfStatus, string>> = {
  SATISFIED: "Customer satisfied",
  NO_PHONE: "No phone number",
  NOT_AVAILABLE: "Customer not available",
};

/** One-tap remarks for the common outcomes. */
export const QUICK_REMARKS: Record<PsfStatus, string[]> = {
  SATISFIED: ["Customer satisfied", "Very satisfied with the work", "Satisfied; asked about next service"],
  DISSATISFIED: ["Problem not fixed", "Vehicle returned dirty", "Delivered late", "Charged more than the estimate"],
  NO_PHONE: ["No phone number on record", "Number not in service", "Wrong number"],
  NOT_AVAILABLE: ["Customer not available", "Rang, no answer", "Phone switched off", "Asked to call back later"],
  CLOSED: ["Issue resolved by the service manager", "Customer declined further contact", "Unreachable after several attempts"],
};

export const isContacted = (status: PsfStatus | null | undefined) => status === "SATISFIED" || status === "DISSATISFIED";

/** Satisfied ÷ (satisfied + dissatisfied), 0-100 with 2 decimals; null when nobody was reached. */
export function satisfactionPct(satisfied: number, dissatisfied: number): number | null {
  const contacted = satisfied + dissatisfied;
  return contacted ? Math.round((satisfied / contacted) * 10_000) / 100 : null;
}

/** Status per line key: every line set to `status` (the legacy Submit button). */
export function applyToAll(lines: Pick<PsfLine, "key">[], status: PsfStatus): Record<string, PsfStatus> {
  return Object.fromEntries(lines.map((line) => [line.key, status]));
}

/** Starting line statuses for a new call: the last call's when the customer was reached, else satisfied. */
export function initialLineStatuses(lines: PsfLine[]): Record<string, PsfStatus> {
  return Object.fromEntries(lines.map((line) => [line.key, isContacted(line.status) ? line.status! : "SATISFIED"]));
}

export interface CallDraft {
  status: PsfStatus | null;
  remark: string;
  lineStatuses: Record<string, PsfStatus>;
  booking: { enabled: boolean; date: string; time: string; serviceTypeId: string; notes: string };
}

/** Problem with the call form, or null. Mirrors the server rules. */
export function callProblem(draft: CallDraft, lines: Pick<PsfLine, "key">[], now = new Date()): string | null {
  if (!draft.status) return "Choose the outcome of the call (1 to 5).";
  const remark = draft.remark.trim();
  if (remark.length > MAX_PSF_REMARK) return `The remark can be at most ${MAX_PSF_REMARK} characters.`;
  if (draft.status === "DISSATISFIED" && !remark) return "Say what the customer is dissatisfied with.";
  if (draft.status === "CLOSED" && !remark) return "Give the reason for closing the follow-up.";
  if (isContacted(draft.status)) {
    const statuses = lines.map((line) => draft.lineStatuses[line.key]);
    if (statuses.some((status) => !isContacted(status))) return "Mark every line satisfied or dissatisfied.";
    if (draft.status === "SATISFIED" && statuses.includes("DISSATISFIED")) return "A line is dissatisfied: set the call to “Customer dissatisfied”.";
  }
  if (draft.booking.enabled) {
    if (!isContacted(draft.status)) return "A booking needs the customer on the phone (satisfied or dissatisfied).";
    if (!draft.booking.date || !draft.booking.time) return "Enter the booking date and time.";
    if (new Date(lagosDateTime(draft.booking.date, draft.booking.time)).getTime() < now.getTime() - 60_000) return "The booking date cannot be in the past.";
  }
  return null;
}

/** "2026-11-25" + "09:00" → ISO with the Lagos offset (UTC+1, no DST). */
export function lagosDateTime(date: string, time: string): string {
  return `${date}T${time}:00+01:00`;
}

/** The request body for a call. Lines are sent only when the customer was reached. */
export function callPayload(draft: CallDraft, lines: Pick<PsfLine, "key">[]) {
  const status = draft.status!;
  return {
    status,
    remark: draft.remark.trim() || null,
    ...(isContacted(status) ? { lines: lines.map((line) => ({ key: line.key, status: draft.lineStatuses[line.key] })) } : {}),
    booking:
      draft.booking.enabled && isContacted(status)
        ? { scheduledAt: lagosDateTime(draft.booking.date, draft.booking.time), serviceTypeId: draft.booking.serviceTypeId || null, notes: draft.booking.notes.trim() || null }
        : null,
  };
}

/** Adds days to a YYYY-MM-DD date. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "tel:" href of a phone as typed (keeps + and digits). */
export const telHref = (number: string) => `tel:${number.replace(/[^\d+]/g, "")}`;

/** Days since delivery, in Lagos calendar days. */
export function daysSince(deliveredDay: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${deliveredDay}T00:00:00Z`)) / 86_400_000);
}
