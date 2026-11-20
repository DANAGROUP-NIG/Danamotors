import type { CscCaseDetail, CscCaseStatus, CscClosureType, CscRuleValues, CscStage, ContactDraft, FollowUpPayload, VisitTiming } from "../types/csc.types";

export const CSC_PERMISSIONS = {
  MASTER_READ: "csc:master:read",
  MASTER_UPDATE: "csc:master:update",
  CASE_READ: "csc:case:read",
  CASE_GENERATE: "csc:case:generate",
  FOLLOWUP_UPDATE: "csc:followup:update",
  FOLLOWUP_REPORT: "report:csc-followup",
  NOT_VISITED_REPORT: "report:csc-not-visited",
  NO_SHOW_REPORT: "report:csc-no-show",
} as const;

/** Contact lines per follow-up stage, as on the legacy screens (mirrors the server). */
export const CONTACT_SLOTS = 3;

export type Tone = "emerald" | "blue" | "amber" | "red" | "orange" | "purple" | "gray";

export const STAGE_META: Record<CscStage, { title: string; short: string; href: string; dateLabel: string; description: string }> = {
  FIRST: {
    title: "1st follow-up",
    short: "1st call",
    href: "/csc/follow-up/first",
    dateLabel: "1st follow-up date",
    description: "First reminder call for vehicles coming due. Record each call, book the vehicle in, or close the follow-up with a reason.",
  },
  SECOND: {
    title: "2nd follow-up",
    short: "2nd call",
    href: "/csc/follow-up/second",
    dateLabel: "2nd follow-up date",
    description: "Second reminder call, a few days before the due date, for cases whose first call is done.",
  },
  NOT_VISITED: {
    title: "Not visited after due date",
    short: "Not visited",
    href: "/csc/not-visited",
    dateLabel: "Due date",
    description: "Vehicles whose service due date has passed without a visit. Call them back in, or close the case with a reason.",
  },
};

export const CASE_STATUS: Record<CscCaseStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "blue" },
  VISITED: { label: "Visited", tone: "emerald" },
  CLOSED: { label: "Closed", tone: "gray" },
};

export const CLOSURE_TYPE: Record<CscClosureType, { label: string; hint: string; tone: Tone }> = {
  FINAL: { label: "Final closure", hint: "Closes the case: no more calls, counted as a no-show.", tone: "red" },
  PARTIAL: { label: "Follow-up closure", hint: "Closes this call only; the case moves on to the next follow-up.", tone: "amber" },
};

export const VISIT_TIMING: Record<VisitTiming, string> = { EARLY: "Came early", ON_TIME: "On time", LATE: "Came late" };

export const RULE_FIELDS: { key: keyof CscRuleValues; label: string; unit: "days" | "km"; hint: string }[] = [
  { key: "dueDays", label: "Due", unit: "days", hint: "Days after the sale date the service falls due" },
  { key: "dueKm", label: "Due", unit: "km", hint: "Mileage at which the service falls due" },
  { key: "followUp1Days", label: "1st call", unit: "days", hint: "Days before the due date for the 1st follow-up call" },
  { key: "followUp2Days", label: "2nd call", unit: "days", hint: "Days before the due date for the 2nd follow-up call" },
  { key: "rotationDays", label: "Rotation", unit: "days", hint: "Interval to the next one once this service is done (periodic service)" },
  { key: "rotationKm", label: "Rotation", unit: "km", hint: "Mileage interval to the next one once this service is done" },
  { key: "variationDays", label: "Grace", unit: "days", hint: "Variation: days after the due date before the service lapses" },
  { key: "variationKm", label: "Grace", unit: "km", hint: "Variation in km" },
];

export function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } })?.response?.data;
  return data?.errors?.[0]?.message ?? data?.message ?? fallback;
}

/** Today in Lagos (YYYY-MM-DD). */
export function todayLocal(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The legacy screens open on today; the not-visited list looks back over the last 90 days. */
export function defaultRange(stage: CscStage, today: string) {
  return stage === "NOT_VISITED" ? { from: addDays(today, -90), to: addDays(today, -1) } : { from: today, to: today };
}

/** Next calendar month (the usual generation period). */
export function nextMonthRange(today: string) {
  const [year, month] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function formatDay(value?: string | null) {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

export function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "—";
}

export const formatKm = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${value.toLocaleString("en-GB")} km`);

/** "in 5 days", "today", "3 days ago". */
export function relativeDay(date: string, today: string) {
  const diff = daysBetween(today, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** Three editable contact lines for a stage, filled from what is saved. */
export function contactDrafts(detail: Pick<CscCaseDetail, "stages">, stage: CscStage, today: string, defaultDoneBy: string): ContactDraft[] {
  const saved = detail.stages[stage]?.contacts ?? [];
  return Array.from({ length: CONTACT_SLOTS }, (_, index) => {
    const row = saved.find((contact) => contact.slot === index + 1);
    return row
      ? { slot: row.slot, contactDate: row.contactDate, contactPerson: row.contactPerson ?? "", remarks: row.remarks ?? "", doneById: row.doneBy?.id ?? "" }
      : { slot: index + 1, contactDate: today, contactPerson: "", remarks: "", doneById: defaultDoneBy };
  });
}

/** A line counts once a person or remarks are entered; untouched lines are not sent. */
export const isFilled = (draft: ContactDraft) => !!draft.contactPerson.trim() || !!draft.remarks.trim();

/** Problems with the follow-up form before saving, or null. Mirrors the server rules. */
export function followUpProblem(input: { contacts: ContactDraft[]; book: boolean; scheduledAt: string; close: boolean; reasonId: string; reasonType?: CscClosureType }, today: string, now = new Date()): string | null {
  const filled = input.contacts.filter(isFilled);
  if (filled.some((draft) => !draft.contactDate)) return "Enter the date of each call";
  if (filled.some((draft) => draft.contactDate > today)) return "A call cannot be dated in the future";
  if (input.close && !input.reasonId) return "Choose the reason for closing";
  if (input.book && !input.scheduledAt) return "Choose the booking date and time";
  if (input.book && new Date(input.scheduledAt).getTime() < now.getTime() - 60_000) return "The booking date cannot be in the past";
  if (input.book && input.close && input.reasonType === "FINAL") return "A case closed with a final reason cannot also be booked";
  if (!filled.length && !input.book && !input.close) return "Record a call, a booking or a closure";
  return null;
}

export function followUpPayload(stage: CscStage, input: { contacts: ContactDraft[]; book: boolean; scheduledAt: string; bookingNotes: string; close: boolean; reasonId: string; closeRemarks: string }): FollowUpPayload {
  return {
    stage,
    contacts: input.contacts.filter(isFilled).map((draft) => ({
      slot: draft.slot,
      contactDate: draft.contactDate,
      contactPerson: draft.contactPerson.trim() || null,
      remarks: draft.remarks.trim() || null,
      doneById: draft.doneById || null,
    })),
    booking: input.book ? { scheduledAt: input.scheduledAt, notes: input.bookingNotes.trim() || null } : null,
    closure: input.close ? { reasonId: input.reasonId, remarks: input.closeRemarks.trim() || null } : null,
  };
}

/** Rule numbers that must hold together (mirrors the server). */
export function ruleProblem(rule: CscRuleValues): string | null {
  if (rule.dueDays < 1) return "Due days must be at least 1";
  if (rule.rotationDays < 1) return "Rotation days must be at least 1";
  if (rule.followUp2Days > rule.followUp1Days) return "The 1st call must come on or before the 2nd (1st call days ≥ 2nd)";
  if (rule.followUp1Days > rule.dueDays) return "1st call days cannot be more than the due days";
  return null;
}

/** Example timeline for a rule: when the calls happen for a vehicle sold today. */
export function ruleTimeline(rule: CscRuleValues) {
  return [
    { label: "1st call", day: rule.dueDays - rule.followUp1Days },
    { label: "2nd call", day: rule.dueDays - rule.followUp2Days },
    { label: "Due", day: rule.dueDays },
    { label: "Lapses", day: rule.dueDays + rule.variationDays },
  ];
}
