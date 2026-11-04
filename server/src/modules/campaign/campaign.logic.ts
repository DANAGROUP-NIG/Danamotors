/**
 * Pure business rules for recall, free-fix and service campaigns.
 * Database-free so they can be unit tested directly.
 */
import { CampaignStatus, CampaignVehicleStatus, ContactOutcome } from "@prisma/client";
import { BadRequestError } from "../../shared/errors/appError";
import { lagosDayNumber } from "../warranty/warranty.logic";

// ── VINs ─────────────────────────────────────────────────────────────────────

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** Returns an error message, or null when the VIN is valid. I, O and Q are never used in VINs. */
export function vinError(vin: string): string | null {
  if (vin.length !== 17) return "must be 17 characters";
  const bad = vin.match(/[IOQ]/);
  if (bad) return `contains letter ${bad[0]}`;
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return "contains characters other than letters and digits";
  return null;
}

export interface ParsedVinList {
  valid: string[];
  invalid: { line: number; value: string; error: string }[];
  duplicatesInInput: number;
}

/** Parses pasted text: one VIN per line (commas and semicolons also separate). Blank lines are ignored. */
export function parseVinList(input: string | string[]): ParsedVinList {
  const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
  const seen = new Set<string>();
  const result: ParsedVinList = { valid: [], invalid: [], duplicatesInInput: 0 };
  lines.forEach((text, index) => {
    for (const piece of text.split(/[,;\t]/)) {
      const vin = normalizeVin(piece);
      if (!vin) continue;
      const error = vinError(vin);
      if (error) {
        result.invalid.push({ line: index + 1, value: piece.trim(), error });
        continue;
      }
      if (seen.has(vin)) {
        result.duplicatesInInput++;
        continue;
      }
      seen.add(vin);
      result.valid.push(vin);
    }
  });
  return result;
}

// ── VIN ranges ───────────────────────────────────────────────────────────────

/**
 * Both bounds of a range share the first 11 characters: manufacturer, model, check digit,
 * model year and plant. Only the serial number varies inside a range.
 */
export const VIN_RANGE_PREFIX_LENGTH = 11;

export interface VinRange {
  vinFrom: string;
  vinTo: string;
}

/** Returns an error message for a range of normalized VINs, or null when it is valid. */
export function vinRangeError(range: VinRange): string | null {
  for (const [label, vin] of [["From VIN", range.vinFrom], ["To VIN", range.vinTo]] as const) {
    const error = vinError(vin);
    if (error) return `${label} ${vin || "(blank)"} ${error}`;
  }
  if (range.vinFrom.slice(0, VIN_RANGE_PREFIX_LENGTH) !== range.vinTo.slice(0, VIN_RANGE_PREFIX_LENGTH))
    return `From and to VIN must share the first ${VIN_RANGE_PREFIX_LENGTH} characters (only the serial number can differ)`;
  if (vinCompare(range.vinFrom, range.vinTo) > 0) return "From VIN must not come after To VIN";
  return null;
}

/** Code-point order, the same in every database collation (VINs are A–Z and 0–9 only). */
export function vinCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function vinInRange(vin: string, range: VinRange): boolean {
  return vinCompare(vin, range.vinFrom) >= 0 && vinCompare(vin, range.vinTo) <= 0;
}

/** Number of serials a range covers when the varying part is numeric, else null. */
export function vinRangeSize(range: VinRange): number | null {
  const from = range.vinFrom.slice(VIN_RANGE_PREFIX_LENGTH);
  const to = range.vinTo.slice(VIN_RANGE_PREFIX_LENGTH);
  return /^\d+$/.test(from) && /^\d+$/.test(to) ? Number(to) - Number(from) + 1 : null;
}

// ── Campaign status ──────────────────────────────────────────────────────────

export const CAMPAIGN_TRANSITIONS: Record<"ACTIVATE" | "CLOSE", CampaignStatus[]> = {
  ACTIVATE: [CampaignStatus.DRAFT],
  CLOSE: [CampaignStatus.DRAFT, CampaignStatus.ACTIVE],
};

/** A campaign applies to vehicles today when it is active and today is inside its dates. */
export function isCampaignOpen(
  campaign: { status: CampaignStatus; startDate: Date; endDate: Date | null },
  today: Date,
): boolean {
  if (campaign.status !== CampaignStatus.ACTIVE) return false;
  const day = lagosDayNumber(today);
  if (day < lagosDayNumber(campaign.startDate)) return false;
  if (campaign.endDate && day > lagosDayNumber(campaign.endDate)) return false;
  return true;
}

// ── Campaign vehicle status ──────────────────────────────────────────────────

const V = CampaignVehicleStatus;

/** Statuses where the campaign work is still outstanding for the vehicle. */
export const OUTSTANDING_VEHICLE_STATUSES: CampaignVehicleStatus[] = [V.PENDING, V.CONTACTED, V.SCHEDULED, V.NOT_REACHABLE];

export const VEHICLE_TRANSITIONS: Record<CampaignVehicleStatus, CampaignVehicleStatus[]> = {
  PENDING: [V.CONTACTED, V.SCHEDULED, V.NOT_REACHABLE, V.NOT_APPLICABLE],
  CONTACTED: [V.SCHEDULED, V.NOT_REACHABLE, V.NOT_APPLICABLE],
  // A no-show goes back to CONTACTED; COMPLETED comes from the job card (or manually with a job card reference).
  SCHEDULED: [V.CONTACTED, V.NOT_REACHABLE, V.NOT_APPLICABLE, V.COMPLETED],
  NOT_REACHABLE: [V.CONTACTED, V.SCHEDULED, V.NOT_APPLICABLE],
  // Undo a mistaken "not applicable".
  NOT_APPLICABLE: [V.PENDING],
  COMPLETED: [],
};

export function assertVehicleTransition(
  from: CampaignVehicleStatus,
  to: CampaignVehicleStatus,
  opts: { jobCardId?: string | null } = {},
): void {
  if (from === to) throw new BadRequestError(`The vehicle is already ${VEHICLE_STATUS_TEXT[to]}`);
  if (!VEHICLE_TRANSITIONS[from].includes(to)) {
    throw new BadRequestError(`A ${VEHICLE_STATUS_TEXT[from]} vehicle cannot be marked ${VEHICLE_STATUS_TEXT[to]}`);
  }
  if (to === V.COMPLETED && !opts.jobCardId) {
    throw new BadRequestError("Completing a campaign vehicle needs the job card that did the work");
  }
}

/** Outcomes where the customer was actually reached. A letter (SENT) or no answer is not. */
export const REACHED_OUTCOMES: ContactOutcome[] = [ContactOutcome.REACHED, ContactOutcome.CALL_BACK, ContactOutcome.DECLINED];

/** Status after recording a contact attempt. Reaching the customer marks a pending vehicle contacted. */
export function statusAfterContact(current: CampaignVehicleStatus, outcome: ContactOutcome): CampaignVehicleStatus {
  if (REACHED_OUTCOMES.includes(outcome) && (current === V.PENDING || current === V.NOT_REACHABLE)) return V.CONTACTED;
  return current;
}

// ── Attended on the job card ─────────────────────────────────────────────────

/**
 * Why campaign work was not done on a job. TODO(confirm): #98 open question 3 asks for a fixed
 * list or free text; this is a fixed list plus "Other" with a note.
 */
export const NOT_ATTENDED_REASONS = {
  PARTS_NOT_AVAILABLE: "Parts not available",
  CUSTOMER_DECLINED: "Customer declined",
  DONE_ELSEWHERE: "Done elsewhere",
  NOT_APPLICABLE: "Not applicable to this vehicle",
  NO_TIME: "No time on this visit",
  OTHER: "Other",
} as const;
export type NotAttendedReason = keyof typeof NOT_ATTENDED_REASONS;

/** The stored reason text: the label, or "Other: <note>". */
export function notAttendedReasonText(reason: NotAttendedReason, note?: string | null): string {
  const trimmed = note?.trim();
  if (reason === "OTHER") return trimmed ? `Other: ${trimmed}` : NOT_ATTENDED_REASONS.OTHER;
  return trimmed ? `${NOT_ATTENDED_REASONS[reason]}: ${trimmed}` : NOT_ATTENDED_REASONS[reason];
}

/** The reason label a stored text belongs to, for counting by reason ("Other" for unknown text). */
export function notAttendedReasonLabel(text: string | null): string {
  if (!text) return "Not given";
  const labels: string[] = Object.values(NOT_ATTENDED_REASONS);
  return labels.find((label) => text === label || text.startsWith(`${label}:`)) ?? NOT_ATTENDED_REASONS.OTHER;
}

/**
 * The status a scheduled vehicle returns to when the job did not do the campaign work, so the
 * next job card flags the campaign again.
 */
export function statusAfterNotAttended(hasReachedContact: boolean): CampaignVehicleStatus {
  return hasReachedContact ? V.CONTACTED : V.PENDING;
}

export interface CampaignAttendanceLike {
  campaignId: string;
  attended: boolean | null;
  /** The job has a FREE line charged to this campaign, which pre-sets the answer to yes. */
  hasFreeLine: boolean;
}

/** Campaigns that still need an answer before the job card can be marked ready. */
export function campaignsMissingAttendance<T extends CampaignAttendanceLike>(campaigns: T[]): T[] {
  return campaigns.filter((c) => c.attended === null && !c.hasFreeLine);
}

export const VEHICLE_STATUS_TEXT: Record<CampaignVehicleStatus, string> = {
  PENDING: "pending",
  CONTACTED: "contacted",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  NOT_REACHABLE: "not reachable",
  NOT_APPLICABLE: "not applicable",
};

// ── Progress ─────────────────────────────────────────────────────────────────

export interface ProgressCounts {
  affected: number;
  pending: number;
  contacted: number;
  scheduled: number;
  completed: number;
  notReachable: number;
  notApplicable: number;
  outstanding: number;
  percentComplete: number;
}

export function buildProgress(counts: Partial<Record<CampaignVehicleStatus, number>>): ProgressCounts {
  const n = (s: CampaignVehicleStatus) => counts[s] ?? 0;
  const affected = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const applicable = affected - n(V.NOT_APPLICABLE);
  return {
    affected,
    pending: n(V.PENDING),
    contacted: n(V.CONTACTED),
    scheduled: n(V.SCHEDULED),
    completed: n(V.COMPLETED),
    notReachable: n(V.NOT_REACHABLE),
    notApplicable: n(V.NOT_APPLICABLE),
    outstanding: OUTSTANDING_VEHICLE_STATUSES.reduce((sum, s) => sum + n(s), 0),
    percentComplete: applicable > 0 ? Math.round((n(V.COMPLETED) / applicable) * 1000) / 10 : 0,
  };
}

// ── Covered items ────────────────────────────────────────────────────────────

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9*]/g, "");

/**
 * Matches a part number against a covered-item pattern. Trailing `x`, `X` or `*`
 * make the pattern a prefix: `91200-D3xxx` covers `91200D3100`. Dashes and spaces are ignored.
 */
export function partNumberMatches(pattern: string, partNumber: string): boolean {
  const p = clean(pattern);
  const value = clean(partNumber);
  const prefix = p.replace(/[X*]+$/, "");
  if (prefix.length !== p.length) return prefix.length > 0 && value.startsWith(prefix);
  return p === value;
}

export interface CoveredItemLike {
  kind: "PART" | "LABOUR";
  partNumber: string | null;
  operationCode: string | null;
  description: string;
}

export function coveredItemMatches(
  item: CoveredItemLike,
  line: { kind: "PART" | "LABOUR"; partNumber?: string | null; operationCode?: string | null; description: string },
): boolean {
  if (item.kind !== line.kind) return false;
  if (item.kind === "PART") {
    return Boolean(item.partNumber && line.partNumber && partNumberMatches(item.partNumber, line.partNumber));
  }
  if (item.operationCode && line.operationCode) {
    return clean(item.operationCode) === clean(line.operationCode);
  }
  return item.description.trim().toLowerCase() === line.description.trim().toLowerCase();
}
