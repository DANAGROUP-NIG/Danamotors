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

/** Status after recording a contact attempt. Reaching the customer marks a pending vehicle contacted. */
export function statusAfterContact(current: CampaignVehicleStatus, outcome: ContactOutcome): CampaignVehicleStatus {
  const reached = outcome === ContactOutcome.REACHED || outcome === ContactOutcome.CALL_BACK || outcome === ContactOutcome.DECLINED;
  if (reached && (current === V.PENDING || current === V.NOT_REACHABLE)) return V.CONTACTED;
  return current;
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
