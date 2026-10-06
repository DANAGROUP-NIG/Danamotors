/**
 * Pure business rules for vehicle warranty coverage and warranty cases.
 *
 * Everything here is deterministic and database-free so it can be unit tested
 * directly. Services load data, call these helpers and persist the results.
 */
import { WarrantyCaseStatus, WarrantyCoverageStatus } from "@prisma/client";
import { BadRequestError } from "../../shared/errors/appError";

// ── Money ────────────────────────────────────────────────────────────────────

/** Rounds a naira amount to kobo. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ── Calendar dates (Africa/Lagos) ────────────────────────────────────────────
// Warranty limits are calendar dates. Nigeria is UTC+1 all year (no DST), so a
// fixed offset gives the local calendar day without a timezone library.

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since 1970-01-01 of the Lagos calendar date containing `date`. */
export function lagosDayNumber(date: Date): number {
  return Math.floor((date.getTime() + LAGOS_OFFSET_MS) / DAY_MS);
}

/** YYYY-MM-DD for a Lagos day number. */
export function dayNumberToIso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// ── Coverage ─────────────────────────────────────────────────────────────────

export type CoverageReason =
  | "NO_MODEL_POLICY"
  | "NO_POLICY_LIMITS"
  | "MODEL_NOT_COVERED"
  | "NO_START_DATE"
  | "START_DATE_IN_FUTURE"
  | "NO_MILEAGE"
  | "DATE_LIMIT_PASSED"
  | "KM_LIMIT_PASSED";

export const COVERAGE_REASON_TEXT: Record<CoverageReason, string> = {
  NO_MODEL_POLICY: "The vehicle is not linked to a model with a warranty policy",
  NO_POLICY_LIMITS: "The model warranty policy has no day or km limit",
  MODEL_NOT_COVERED: "This model is not covered by manufacturer warranty",
  NO_START_DATE: "No warranty start (sale) date is recorded for this vehicle",
  START_DATE_IN_FUTURE: "The recorded warranty start date is in the future",
  NO_MILEAGE: "No odometer reading yet — it is recorded at check-in or when a job card is opened",
  DATE_LIMIT_PASSED: "The warranty period has ended",
  KM_LIMIT_PASSED: "The warranty km limit has been exceeded",
};

export type CoverageSource = "MODEL" | "EXTENDED" | "GOODWILL";

export interface CoveragePolicy {
  code?: string;
  name?: string;
  warrantyDays: number | null;
  warrantyKm: number | null;
  warrantyCovered: boolean;
}

export interface CoverageOverride {
  type: "EXTENDED" | "GOODWILL";
  until: Date | null;
  km: number | null;
}

export interface CoverageInput {
  startDate: Date | null;
  policy: CoveragePolicy | null;
  override: CoverageOverride | null;
  mileage: number | null;
  today: Date;
}

export interface Coverage {
  status: WarrantyCoverageStatus;
  reasons: CoverageReason[];
  source: CoverageSource | null;
  /** YYYY-MM-DD */
  startDate: string | null;
  /** Last covered day, YYYY-MM-DD. */
  expiresOn: string | null;
  warrantyDays: number | null;
  kmLimit: number | null;
  mileage: number | null;
  remainingDays: number | null;
  remainingKm: number | null;
  /** 0–100, for progress meters. */
  daysUsedPercent: number | null;
  kmUsedPercent: number | null;
}

const pct = (used: number, total: number) => Math.max(0, Math.min(100, Math.round((used / total) * 100)));

/**
 * Calculates warranty coverage. A vehicle is covered while
 * `today <= startDate + warrantyDays` **and** `mileage <= warrantyKm` (whichever comes first).
 *
 * - A known expiry wins over missing data: a vehicle past its km limit is
 *   EXPIRED_MILEAGE even without a start date.
 * - Missing data never reads as covered: it gives UNKNOWN.
 * - When both limits have passed the status is EXPIRED_DATE; both reasons are returned.
 * - EXTENDED replaces the date and/or km limit (and applies even to models not normally covered).
 * - GOODWILL covers until its date regardless of the model policy.
 */
export function computeCoverage(input: CoverageInput): Coverage {
  const { policy, override, mileage, today } = input;
  const todayDay = lagosDayNumber(today);
  const startDay = input.startDate ? lagosDayNumber(input.startDate) : null;

  const base: Coverage = {
    status: WarrantyCoverageStatus.UNKNOWN,
    reasons: [],
    source: null,
    startDate: startDay !== null ? dayNumberToIso(startDay) : null,
    expiresOn: null,
    warrantyDays: policy?.warrantyDays ?? null,
    kmLimit: null,
    mileage,
    remainingDays: null,
    remainingKm: null,
    daysUsedPercent: null,
    kmUsedPercent: null,
  };

  // Goodwill: covered until its date, whatever the model policy says.
  if (override?.type === "GOODWILL" && override.until && todayDay <= lagosDayNumber(override.until)) {
    const untilDay = lagosDayNumber(override.until);
    const kmLimit = override.km;
    const kmPassed = kmLimit !== null && mileage !== null && mileage > kmLimit;
    return {
      ...base,
      status: kmPassed ? WarrantyCoverageStatus.EXPIRED_MILEAGE : WarrantyCoverageStatus.ACTIVE,
      reasons: kmPassed ? ["KM_LIMIT_PASSED"] : [],
      source: "GOODWILL",
      expiresOn: dayNumberToIso(untilDay),
      kmLimit,
      remainingDays: untilDay - todayDay,
      remainingKm: kmLimit !== null && mileage !== null ? Math.max(0, kmLimit - mileage) : null,
      kmUsedPercent: kmLimit !== null && mileage !== null ? pct(mileage, kmLimit) : null,
    };
  }

  const extended = override?.type === "EXTENDED" ? override : null;

  if (!policy && !extended) {
    return { ...base, reasons: ["NO_MODEL_POLICY"] };
  }
  if (policy && !policy.warrantyCovered && !extended) {
    return { ...base, status: WarrantyCoverageStatus.NOT_COVERED, reasons: ["MODEL_NOT_COVERED"] };
  }

  const reasons: CoverageReason[] = [];
  const source: CoverageSource = extended ? "EXTENDED" : "MODEL";

  // Date limit
  let expiresDay: number | null = null;
  let totalDays: number | null = null;
  if (extended?.until) {
    expiresDay = lagosDayNumber(extended.until);
    totalDays = startDay !== null ? expiresDay - startDay : null;
  } else if (policy?.warrantyDays) {
    if (startDay === null) reasons.push("NO_START_DATE");
    else {
      expiresDay = startDay + policy.warrantyDays;
      totalDays = policy.warrantyDays;
    }
  }
  if (startDay !== null && startDay > todayDay) reasons.push("START_DATE_IN_FUTURE");

  // Km limit
  const kmLimit = extended?.km ?? policy?.warrantyKm ?? null;
  if (kmLimit !== null && mileage === null) reasons.push("NO_MILEAGE");

  const hasDateRule = Boolean(extended?.until || policy?.warrantyDays);
  if (!hasDateRule && kmLimit === null) {
    return { ...base, source, reasons: ["NO_POLICY_LIMITS"] };
  }

  const datePassed = expiresDay !== null && todayDay > expiresDay;
  const kmPassed = kmLimit !== null && mileage !== null && mileage > kmLimit;
  if (datePassed) reasons.push("DATE_LIMIT_PASSED");
  if (kmPassed) reasons.push("KM_LIMIT_PASSED");

  let status: WarrantyCoverageStatus;
  if (datePassed) status = WarrantyCoverageStatus.EXPIRED_DATE;
  else if (kmPassed) status = WarrantyCoverageStatus.EXPIRED_MILEAGE;
  else if (reasons.length > 0) status = WarrantyCoverageStatus.UNKNOWN;
  else status = WarrantyCoverageStatus.ACTIVE;

  return {
    ...base,
    status,
    reasons,
    source,
    expiresOn: expiresDay !== null ? dayNumberToIso(expiresDay) : null,
    kmLimit,
    remainingDays: expiresDay !== null ? Math.max(0, expiresDay - todayDay) : null,
    remainingKm: kmLimit !== null && mileage !== null ? Math.max(0, kmLimit - mileage) : null,
    daysUsedPercent:
      expiresDay !== null && totalDays && startDay !== null ? pct(todayDay - startDay, totalDays) : null,
    kmUsedPercent: kmLimit !== null && mileage !== null ? pct(mileage, kmLimit) : null,
  };
}

// ── Odometer ─────────────────────────────────────────────────────────────────

export const MAX_MILEAGE = 2_000_000;

/**
 * Odometer readings only go forward, so a lower reading cannot keep a vehicle
 * "in warranty". A replaced odometer is the one audited exception.
 */
export function assertMileage(mileage: number, lastRecorded: number | null, odometerReplaced = false): void {
  if (!Number.isInteger(mileage) || mileage < 0 || mileage > MAX_MILEAGE) {
    throw new BadRequestError(`Mileage must be a whole number between 0 and ${MAX_MILEAGE.toLocaleString("en-NG")} km`);
  }
  if (lastRecorded !== null && mileage < lastRecorded && !odometerReplaced) {
    throw new BadRequestError(
      `Mileage ${mileage.toLocaleString("en-NG")} km is lower than the last recorded ${lastRecorded.toLocaleString("en-NG")} km. ` +
        "Tick 'Odometer was replaced' and give a reason if the odometer was changed.",
    );
  }
}

// ── Warranty case workflow ───────────────────────────────────────────────────

export type WarrantyCaseAction =
  | "START_REVIEW"
  | "SUBMIT"
  | "APPROVE"
  | "PARTIALLY_APPROVE"
  | "REJECT"
  | "RETURN"
  | "RESUME"
  | "SETTLE"
  | "CLOSE";

const S = WarrantyCaseStatus;

export const CASE_TRANSITIONS: Record<WarrantyCaseAction, { from: WarrantyCaseStatus[]; to: WarrantyCaseStatus }> = {
  START_REVIEW: { from: [S.OPEN], to: S.IN_REVIEW },
  SUBMIT: { from: [S.IN_REVIEW], to: S.SUBMITTED },
  APPROVE: { from: [S.SUBMITTED], to: S.APPROVED },
  PARTIALLY_APPROVE: { from: [S.SUBMITTED], to: S.PARTIALLY_APPROVED },
  REJECT: { from: [S.SUBMITTED], to: S.REJECTED },
  // The manufacturer sent the claim back for correction.
  RETURN: { from: [S.SUBMITTED], to: S.RETURNED },
  RESUME: { from: [S.RETURNED], to: S.IN_REVIEW },
  SETTLE: { from: [S.APPROVED, S.PARTIALLY_APPROVED], to: S.SETTLED },
  // Closing an unsubmitted case withdraws it.
  CLOSE: { from: [S.OPEN, S.IN_REVIEW, S.RETURNED, S.REJECTED, S.SETTLED], to: S.CLOSED },
};

/** Statuses in which claim lines and header details may be edited. */
export const EDITABLE_CASE_STATUSES: WarrantyCaseStatus[] = [S.OPEN, S.IN_REVIEW, S.RETURNED];

/** Statuses counted as "open work" (not finished). */
export const ACTIVE_CASE_STATUSES: WarrantyCaseStatus[] = [
  S.OPEN,
  S.IN_REVIEW,
  S.SUBMITTED,
  S.RETURNED,
  S.APPROVED,
  S.PARTIALLY_APPROVED,
];

export function allowedActions(status: WarrantyCaseStatus): WarrantyCaseAction[] {
  return (Object.keys(CASE_TRANSITIONS) as WarrantyCaseAction[]).filter((a) => CASE_TRANSITIONS[a].from.includes(status));
}

export interface CaseLineState {
  id: string;
  kind: "PART" | "LABOUR";
  role: "CAUSAL" | "CONSEQUENTIAL" | null;
  defectCodeId: string | null;
  claimedAmount: number;
  approvalPercent: number;
  partWarrantyApplicable: boolean | null;
}

export interface CaseState {
  status: WarrantyCaseStatus;
  complaintCodeId: string | null;
  complaint: string | null;
  lines: CaseLineState[];
}

export interface TransitionInput {
  remarks?: string | null;
  rejectReasonId?: string | null;
  settlementRef?: string | null;
  /** Approval percentages per line id, for decisions. */
  lineApprovals?: { lineId: string; approvalPercent: number }[];
}

export interface TransitionResult {
  to: WarrantyCaseStatus;
  /** New approval percent per line, set by decisions. */
  approvals?: Map<string, number>;
}

/**
 * Validates an action against the case state and returns the target status and,
 * for decisions, the approval percentage for every line. Throws BadRequestError
 * with a message the user can act on.
 */
export function planTransition(state: CaseState, action: WarrantyCaseAction, input: TransitionInput): TransitionResult {
  const rule = CASE_TRANSITIONS[action];
  if (!rule) throw new BadRequestError(`Unknown action ${action}`);
  if (!rule.from.includes(state.status)) {
    throw new BadRequestError(`A case that is ${label(state.status)} cannot be ${ACTION_PAST[action]}`);
  }
  const remarks = input.remarks?.trim();

  switch (action) {
    case "SUBMIT": {
      if (state.lines.length === 0) throw new BadRequestError("Add at least one claim line before submitting");
      if (!state.lines.some((l) => l.kind === "PART" && l.role === "CAUSAL")) {
        throw new BadRequestError("Add the causal part (the part that failed) before submitting");
      }
      if (state.lines.some((l) => l.kind === "PART" && !l.defectCodeId)) {
        throw new BadRequestError("Every part line needs a defect code before submitting");
      }
      if (state.lines.some((l) => l.kind === "PART" && l.partWarrantyApplicable === false)) {
        throw new BadRequestError("Remove parts that are not warranty-applicable before submitting");
      }
      if (!state.complaintCodeId && !state.complaint?.trim()) {
        throw new BadRequestError("Record the customer complaint before submitting");
      }
      return { to: rule.to };
    }
    case "APPROVE": {
      return { to: rule.to, approvals: new Map(state.lines.map((l) => [l.id, 100])) };
    }
    case "PARTIALLY_APPROVE": {
      const approvals = decisionApprovals(state, input.lineApprovals ?? []);
      const values = [...approvals.values()];
      if (!values.some((v) => v < 100)) {
        throw new BadRequestError("A partial approval needs at least one line approved below 100%. Use Approved instead.");
      }
      if (!values.some((v) => v > 0)) {
        throw new BadRequestError("Nothing is approved. Use Rejected instead.");
      }
      return { to: rule.to, approvals };
    }
    case "REJECT": {
      if (!input.rejectReasonId) throw new BadRequestError("Rejecting a claim requires a reject reason code");
      return { to: rule.to, approvals: new Map(state.lines.map((l) => [l.id, 0])) };
    }
    case "RETURN": {
      if (!remarks) throw new BadRequestError("Say what the manufacturer asked to be corrected");
      return { to: rule.to };
    }
    case "SETTLE": {
      if (!input.settlementRef?.trim()) throw new BadRequestError("Enter the settlement reference (credit note or payment)");
      return { to: rule.to };
    }
    case "CLOSE": {
      const withdrawing = state.status !== S.SETTLED && state.status !== S.REJECTED;
      if (withdrawing && !remarks) throw new BadRequestError("Give a reason for withdrawing this case");
      return { to: rule.to };
    }
    default:
      return { to: rule.to };
  }
}

function decisionApprovals(state: CaseState, given: { lineId: string; approvalPercent: number }[]): Map<string, number> {
  const byId = new Map(given.map((g) => [g.lineId, g.approvalPercent]));
  for (const id of byId.keys()) {
    if (!state.lines.some((l) => l.id === id)) throw new BadRequestError("A decision line does not belong to this case");
  }
  const approvals = new Map<string, number>();
  for (const line of state.lines) {
    const value = byId.get(line.id) ?? line.approvalPercent;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new BadRequestError("Approval percentages must be between 0 and 100");
    }
    approvals.set(line.id, round2(value));
  }
  return approvals;
}

export function lineAmounts(quantity: number, rate: number, approvalPercent: number | null) {
  const claimedAmount = round2(quantity * rate);
  const approvedAmount = approvalPercent === null ? null : round2((claimedAmount * approvalPercent) / 100);
  return { claimedAmount, approvedAmount };
}

const STATUS_LABEL: Record<WarrantyCaseStatus, string> = {
  OPEN: "open",
  IN_REVIEW: "in review",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  PARTIALLY_APPROVED: "partially approved",
  REJECTED: "rejected",
  RETURNED: "returned",
  SETTLED: "settled",
  CLOSED: "closed",
};

const ACTION_PAST: Record<WarrantyCaseAction, string> = {
  START_REVIEW: "moved to review",
  SUBMIT: "submitted",
  APPROVE: "approved",
  PARTIALLY_APPROVE: "partially approved",
  REJECT: "rejected",
  RETURN: "returned for correction",
  RESUME: "reopened for review",
  SETTLE: "settled",
  CLOSE: "closed",
};

export const label = (status: WarrantyCaseStatus) => STATUS_LABEL[status];
export const actionPast = (action: WarrantyCaseAction) => ACTION_PAST[action];
