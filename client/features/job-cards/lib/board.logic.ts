import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import { NOT_PROVIDED, formatDateTime, formatTime, lagosDayKey } from "@/lib/format";
import type { BoardCard, BoardColumnKey } from "../types/job-board.types";
import type { JobCard } from "../types/job-card.types";
import { ownerRoleLabel } from "./job-stage.logic";

/**
 * Workshop board (job card revamp phase 10): column wording, the timing tone, card text and the filters kept in
 * the address bar. Components only render what these return.
 */

export const BOARD_COLUMN_KEYS = [
  "CHECK_IN",
  "DIAGNOSIS",
  "WARRANTY",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "WAITING_PARTS",
  "QUALITY_CHECK",
  "READY",
] as const satisfies readonly BoardColumnKey[];

/** Column headings and tones, the same words and colours as the job's step badge (jobStageBadge). */
export const BOARD_COLUMNS: Record<
  BoardColumnKey,
  { label: string; tone: StatusTone }
> = {
  CHECK_IN: { label: "Check-in", tone: "amber" },
  DIAGNOSIS: { label: "Diagnosis", tone: "blue" },
  WARRANTY: { label: "Warranty check", tone: "purple" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "amber" },
  IN_REPAIR: { label: "In repair", tone: "blue" },
  WAITING_PARTS: { label: "Waiting parts", tone: "amber" },
  QUALITY_CHECK: { label: "Quality check", tone: "blue" },
  READY: { label: "Ready", tone: "emerald" },
};

export const BOARD_EMPTY_COLUMN = "No jobs at this step.";

export type TimingTone = "normal" | "amber" | "red";

/** Normal within the target, amber once over it and red once over twice the target. No target: always normal. */
export function timingTone(
  minutes: number,
  targetMinutes: number | null,
): TimingTone {
  if (!targetMinutes || targetMinutes <= 0) return "normal";
  if (minutes > targetMinutes * 2) return "red";
  if (minutes > targetMinutes) return "amber";
  return "normal";
}

/** The words that go with the tone, so the timing never relies on colour alone. */
export function timingStateText(
  tone: TimingTone,
  targetMinutes: number | null,
): string | null {
  if (!targetMinutes) return null;
  if (tone === "red") return "Far over target";
  if (tone === "amber") return "Over target";
  return "Within target";
}

export function minutesSince(value: string, now: Date): number {
  const start = new Date(value).getTime();
  return Number.isFinite(start)
    ? Math.max(0, Math.floor((now.getTime() - start) / 60_000))
    : 0;
}

/** "35 min", "2 h 10 min", "1 day 3 h". */
export function durationText(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  if (whole < 60) return `${whole} min`;
  const days = Math.floor(whole / 1440);
  const hours = Math.floor((whole % 1440) / 60);
  const mins = whole % 60;
  if (days > 0)
    return hours
      ? `${days} ${days === 1 ? "day" : "days"} ${hours} h`
      : `${days} ${days === 1 ? "day" : "days"}`;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}

/** "Target 2 h", for the column heading. */
export function targetText(targetMinutes: number | null): string | null {
  return targetMinutes ? `Target ${durationText(targetMinutes)}` : null;
}


/** "Promised: Today, 16:00", "Promised: Tomorrow, 09:00" or "Promised: 30 Nov 2026, 10:00". */
export function promisedText(promisedAt: string | null, now: Date): string {
  if (!promisedAt) return `Promised: ${NOT_PROVIDED}`;
  const promised = new Date(promisedAt);
  if (!Number.isFinite(promised.getTime())) return `Promised: ${NOT_PROVIDED}`;
  const day = lagosDayKey(promised);
  if (day === lagosDayKey(now)) return `Promised: Today, ${formatTime(promised)}`;
  if (day === lagosDayKey(new Date(now.getTime() + 86_400_000)))
    return `Promised: Tomorrow, ${formatTime(promised)}`;
  if (day === lagosDayKey(new Date(now.getTime() - 86_400_000)))
    return `Promised: Yesterday, ${formatTime(promised)}`;
  return `Promised: ${formatDateTime(promised)}`;
}

/** Overdue: the promised time has passed before the job reached Ready (the server counts it the same way). */
export function isOverdue(
  column: BoardColumnKey,
  promisedAt: string | null,
  now: Date,
): boolean {
  if (column === "READY" || !promisedAt) return false;
  const promised = new Date(promisedAt).getTime();
  return Number.isFinite(promised) && promised < now.getTime();
}

/** "Musa A." from "Musa Abdullahi". */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** "MA" for the avatar; the role's first letters when nobody is named. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

/** Who holds the job: a person's short name, else the role ("Warranty officer"), else "Not assigned". */
export function ownerName(owner: BoardCard["owner"]): string {
  if (!owner) return "Not assigned";
  return owner.name ? shortName(owner.name) : ownerRoleLabel(owner.role);
}

/** The job list's With column: who holds the step now, by name or role. */
export function listOwnerText(
  job: Pick<JobCard, "stage" | "stageOwner" | "stageOwnerRole">,
): string {
  if (job.stage === "CLOSED") return "No one, job delivered";
  if (job.stage === "CANCELLED") return "No one, job cancelled";
  if (job.stageOwner)
    return `${job.stageOwner.firstName} ${job.stageOwner.lastName}`.trim();
  return job.stageOwnerRole ? ownerRoleLabel(job.stageOwnerRole) : NOT_PROVIDED;
}

/** The card's link text for screen readers, in one sentence. */
export function cardAccessibleName(
  card: BoardCard,
  column: BoardColumnKey,
  minutes: number,
  timing: string | null,
): string {
  return [
    `Job ${card.jobNumber}`,
    card.plate ?? "plate not provided",
    card.model,
    card.customer,
    BOARD_COLUMNS[column].label,
    `with ${ownerName(card.owner)}`,
    `${durationText(minutes)} in this step${timing ? `, ${timing.toLowerCase()}` : ""}`,
  ]
    .filter(Boolean)
    .join(", ");
}

export type BoardView = "board" | "table";

export type BoardFilters = {
  view: BoardView;
  branchId?: string;
  advisorId?: string;
  technicianId?: string;
  /** Received on this Lagos day (YYYY-MM-DD). */
  date?: string;
  /** Phone: the column on show. Table: the column the table is limited to. */
  column?: BoardColumnKey;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isColumn = (value: string | null): value is BoardColumnKey =>
  !!value && (BOARD_COLUMN_KEYS as readonly string[]).includes(value);

/** The roles that open on the board; everyone else opens on the table. */
const BOARD_FIRST_ROLES = ["workshopmanager", "servicemanager"];

export function defaultView(role: string | null | undefined): BoardView {
  const normal = role?.toLowerCase().replace(/[\s_-]/g, "") ?? "";
  return BOARD_FIRST_ROLES.includes(normal) ? "board" : "table";
}

type Params = { get(name: string): string | null };

/** Reads the filters from the address bar, dropping anything that is not a valid value. */
export function readBoardFilters(
  params: Params,
  fallbackView: BoardView,
): BoardFilters {
  const view = params.get("view");
  const pick = (name: string, pattern: RegExp) => {
    const value = params.get(name);
    return value && pattern.test(value) ? value : undefined;
  };
  const column = params.get("column");
  return {
    view: view === "board" || view === "table" ? view : fallbackView,
    branchId: pick("branch", UUID),
    advisorId: pick("advisor", UUID),
    technicianId: pick("technician", UUID),
    date: pick("date", DATE),
    column: isColumn(column) ? column : undefined,
  };
}

/** The address-bar query for these filters, leaving out empty ones. */
export function boardSearch(filters: BoardFilters): string {
  const params = new URLSearchParams();
  params.set("view", filters.view);
  if (filters.branchId) params.set("branch", filters.branchId);
  if (filters.advisorId) params.set("advisor", filters.advisorId);
  if (filters.technicianId) params.set("technician", filters.technicianId);
  if (filters.date) params.set("date", filters.date);
  if (filters.column) params.set("column", filters.column);
  return params.toString();
}

/** The board API query. */
export function boardApiQuery(filters: BoardFilters, branchId: string): string {
  const params = new URLSearchParams({ branchId });
  if (filters.advisorId) params.set("advisorId", filters.advisorId);
  if (filters.technicianId) params.set("technicianId", filters.technicianId);
  if (filters.date) params.set("date", filters.date);
  return params.toString();
}

/** The job list filters that show one column in the table ("Show all in table"). */
export function columnListFilter(column: BoardColumnKey): {
  stage: string;
  status?: string;
} {
  switch (column) {
    case "AWAITING_APPROVAL":
      return { stage: "ESTIMATE" };
    case "IN_REPAIR":
      return { stage: "REPAIR", status: "IN_PROGRESS" };
    case "WAITING_PARTS":
      return { stage: "REPAIR", status: "WAITING_PARTS" };
    case "READY":
      return { stage: "BILLING,DELIVERY" };
    default:
      return { stage: column };
  }
}

/** "Showing 50 of 63. Show all in table." wording, only when the column is capped. */
export function cappedText(shown: number, total: number): string | null {
  return total > shown
    ? `Showing ${shown} of ${total}, longest waiting first.`
    : null;
}
