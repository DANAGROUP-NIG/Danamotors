/**
 * Pure business rules for vehicle warranty coverage and warranty cases.
 *
 * Everything here is deterministic and database-free so it can be unit tested
 * directly. Services load data, call these helpers and persist the results.
 */
import { Prisma, WarrantyCaseStatus, WarrantyCoverageStatus, WarrantyReimbursementStatus } from "@prisma/client";
import { BadRequestError } from "../../shared/errors/appError";
import { money, sumMoney } from "../finance/money";

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

/**
 * The manufacturer's decision for one line. The officer enters either the approved
 * amount shown on the Kia portal or an approval percentage; the amount wins when both are sent.
 */
export interface LineApprovalInput {
  lineId: string;
  approvalPercent?: number | null;
  approvedAmount?: number | null;
}

export interface LineDecision {
  approvalPercent: number;
  approvedAmount: number;
}

export interface TransitionInput {
  remarks?: string | null;
  rejectReasonId?: string | null;
  lineApprovals?: LineApprovalInput[];
}

export interface TransitionResult {
  to: WarrantyCaseStatus;
  /** Approval percent and approved amount per line id, set by decisions. */
  approvals?: Map<string, LineDecision>;
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
      return {
        to: rule.to,
        approvals: new Map(state.lines.map((l) => [l.id, { approvalPercent: 100, approvedAmount: money(l.claimedAmount) }])),
      };
    }
    case "PARTIALLY_APPROVE": {
      const approvals = decisionApprovals(state, input.lineApprovals ?? []);
      const below = state.lines.some((l) => approvals.get(l.id)!.approvedAmount < money(l.claimedAmount));
      if (!below) {
        throw new BadRequestError("A partial approval needs at least one line approved below the claimed amount. Use Approved instead.");
      }
      if (![...approvals.values()].some((v) => v.approvedAmount > 0)) {
        throw new BadRequestError("Nothing is approved. Use Rejected instead.");
      }
      return { to: rule.to, approvals };
    }
    case "REJECT": {
      if (!input.rejectReasonId) throw new BadRequestError("Rejecting a claim requires a reject reason code");
      return { to: rule.to, approvals: new Map(state.lines.map((l) => [l.id, { approvalPercent: 0, approvedAmount: 0 }])) };
    }
    case "RETURN": {
      if (!remarks) throw new BadRequestError("Say what the manufacturer asked to be corrected");
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

function decisionApprovals(state: CaseState, given: LineApprovalInput[]): Map<string, LineDecision> {
  const byId = new Map(given.map((g) => [g.lineId, g]));
  for (const id of byId.keys()) {
    if (!state.lines.some((l) => l.id === id)) throw new BadRequestError("A decision line does not belong to this case");
  }
  const approvals = new Map<string, LineDecision>();
  state.lines.forEach((line, index) => {
    const entry = byId.get(line.id);
    approvals.set(
      line.id,
      resolveLineDecision(line.claimedAmount, entry?.approvedAmount ?? null, entry?.approvalPercent ?? line.approvalPercent, index + 1),
    );
  });
  return approvals;
}

/**
 * One line's decision from the approved amount (as entered from the Kia portal) or a percentage.
 * The amount is kept exactly as entered; the percentage is derived from it for display.
 */
export function resolveLineDecision(
  claimedAmount: number,
  approvedAmount: number | null,
  approvalPercent: number,
  lineNumber: number,
): LineDecision {
  const claimed = new Prisma.Decimal(money(claimedAmount));
  if (approvedAmount != null) {
    if (!Number.isFinite(approvedAmount) || approvedAmount < 0) {
      throw new BadRequestError(`Line ${lineNumber}: enter an approved amount of zero or more`);
    }
    const amount = new Prisma.Decimal(money(approvedAmount));
    // TODO(confirm): can Kia approve more than the dealer claimed on a line? Blocked until confirmed.
    if (amount.greaterThan(claimed)) {
      throw new BadRequestError(`Line ${lineNumber}: the approved amount cannot be more than the claimed amount`);
    }
    const percent = claimed.isZero()
      ? 100
      : amount.div(claimed).times(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    return { approvalPercent: percent, approvedAmount: amount.toNumber() };
  }
  if (!Number.isFinite(approvalPercent) || approvalPercent < 0 || approvalPercent > 100) {
    throw new BadRequestError("Approval percentages must be between 0 and 100");
  }
  const percent = new Prisma.Decimal(approvalPercent).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    approvalPercent: percent.toNumber(),
    approvedAmount: money(claimed.times(percent).div(100).toNumber()),
  };
}

// ── Settlement and reimbursement ─────────────────────────────────────────────

export interface SettlementInput {
  settledAmount?: number | null;
  settledAt?: Date | null;
  /** Credit note or payment reference. Only needed when the reimbursement is already in. */
  settlementRef?: string | null;
  reimbursementReceived?: boolean | null;
  reimbursedAmount?: number | null;
  reimbursedAt?: Date | null;
}

export interface ReimbursementPlan {
  settlementRef: string | null;
  reimbursementStatus: WarrantyReimbursementStatus;
  reimbursedAmount: number | null;
  reimbursedAt: Date | null;
}

export interface SettlementPlan extends ReimbursementPlan {
  settledAmount: number | null;
  settledAt: Date;
}

/**
 * Settling records the amount agreed with the manufacturer. The reimbursement (credit note
 * or payment) may still be pending: the case can then be closed and the reimbursement
 * recorded later.
 */
export function planSettlement(input: SettlementInput, approvedAmount: number | null, now: Date): SettlementPlan {
  const settledAt = input.settledAt ?? now;
  assertNotFuture(settledAt, now, "The settlement date");
  const agreed = input.settledAmount ?? approvedAmount;
  if (agreed != null && (!Number.isFinite(agreed) || agreed < 0)) throw new BadRequestError("The settled amount cannot be negative");
  const settledAmount = agreed == null ? null : money(agreed);
  const ref = input.settlementRef?.trim() || null;
  if (!input.reimbursementReceived) {
    return {
      settledAmount,
      settledAt,
      settlementRef: ref,
      reimbursementStatus: WarrantyReimbursementStatus.PENDING,
      reimbursedAmount: null,
      reimbursedAt: null,
    };
  }
  const received = planReimbursement(
    { settlementRef: ref, reimbursedAmount: input.reimbursedAmount ?? settledAmount, reimbursedAt: input.reimbursedAt ?? settledAt },
    now,
  );
  return { settledAmount, settledAt, ...received };
}

export interface ReimbursementInput {
  settlementRef?: string | null;
  reimbursedAmount?: number | null;
  reimbursedAt?: Date | null;
}

/** Statuses in which a pending reimbursement can be recorded as received. */
export const REIMBURSABLE_CASE_STATUSES: WarrantyCaseStatus[] = [S.SETTLED, S.CLOSED];

/** Validates a received reimbursement (credit note or payment from the manufacturer). */
export function planReimbursement(input: ReimbursementInput, now: Date): ReimbursementPlan {
  const settlementRef = input.settlementRef?.trim();
  if (!settlementRef) throw new BadRequestError("Enter the credit note or payment reference for the reimbursement");
  if (input.reimbursedAmount == null || !Number.isFinite(input.reimbursedAmount) || input.reimbursedAmount < 0) {
    throw new BadRequestError("Enter the amount received from the manufacturer");
  }
  const reimbursedAt = input.reimbursedAt ?? now;
  assertNotFuture(reimbursedAt, now, "The date received");
  return {
    settlementRef,
    reimbursementStatus: WarrantyReimbursementStatus.RECEIVED,
    reimbursedAmount: money(input.reimbursedAmount),
    reimbursedAt,
  };
}

/** A pending reimbursement can be recorded once, on a settled or closed case. */
export function assertCanRecordReimbursement(status: WarrantyCaseStatus, reimbursement: WarrantyReimbursementStatus | null): void {
  if (!REIMBURSABLE_CASE_STATUSES.includes(status)) {
    throw new BadRequestError(`Record the settlement first. A case that is ${label(status)} has no reimbursement to record.`);
  }
  if (reimbursement === WarrantyReimbursementStatus.RECEIVED) {
    throw new BadRequestError("The reimbursement for this case is already recorded as received");
  }
}

function assertNotFuture(date: Date, now: Date, what: string) {
  if (lagosDayNumber(date) > lagosDayNumber(now)) throw new BadRequestError(`${what} cannot be in the future`);
}

// ── Issued parts against the approved claim ──────────────────────────────────

/** A part issued from our store against the job card (net of returns), at the job card rate. */
export interface IssuedPartInput {
  jobCardLineId: string;
  partNumber: string | null;
  description: string;
  quantity: number;
  amount: number;
}

export interface ClaimPartInput {
  id: string;
  jobCardLineId: string | null;
  partNumber: string | null;
  description: string;
  claimedAmount: number;
  approvedAmount: number | null;
}

/**
 * NOT_CLAIMED: issued but not on the claim. NOT_ISSUED: claimed but not linked to a part
 * issued on the job card. AWAITING_DECISION: no manufacturer decision yet.
 * RECOVERED: the approved amount covers the issued amount. SHORTFALL: approved is less than issued.
 */
export type IssuedPartOutcome = "NOT_CLAIMED" | "NOT_ISSUED" | "AWAITING_DECISION" | "RECOVERED" | "SHORTFALL";

export interface IssuedPartRow {
  jobCardLineId: string | null;
  claimLineId: string | null;
  partNumber: string | null;
  description: string;
  issuedQuantity: number;
  issuedAmount: number;
  claimedAmount: number | null;
  approvedAmount: number | null;
  /** Approved minus issued; null until the manufacturer has decided. */
  variance: number | null;
  outcome: IssuedPartOutcome;
}

export interface IssuedPartsReconciliation {
  decided: boolean;
  rows: IssuedPartRow[];
  totals: {
    issuedAmount: number;
    claimedAmount: number;
    approvedAmount: number | null;
    /** Approved minus issued across all rows; null until the manufacturer has decided. */
    variance: number | null;
  };
}

/**
 * Lines the parts issued from our store up against the amounts claimed and approved on
 * the Kia portal, so the officer sees what was recovered and any shortfall.
 */
export function reconcileIssuedParts(issued: IssuedPartInput[], claimParts: ClaimPartInput[], decided: boolean): IssuedPartsReconciliation {
  const claimsByJobLine = new Map<string, ClaimPartInput[]>();
  for (const c of claimParts) {
    if (c.jobCardLineId) claimsByJobLine.set(c.jobCardLineId, [...(claimsByJobLine.get(c.jobCardLineId) ?? []), c]);
  }
  const issuedIds = new Set(issued.map((i) => i.jobCardLineId));

  const rows: IssuedPartRow[] = issued.map((part) => {
    const claims = claimsByJobLine.get(part.jobCardLineId) ?? [];
    const issuedAmount = money(part.amount);
    const identity = { jobCardLineId: part.jobCardLineId, partNumber: part.partNumber, description: part.description, issuedQuantity: part.quantity, issuedAmount };
    if (claims.length === 0) {
      return { ...identity, claimLineId: null, claimedAmount: null, approvedAmount: null, variance: null, outcome: "NOT_CLAIMED" };
    }
    const approvedAmount = decided ? sumMoney(claims.map((c) => c.approvedAmount ?? 0)) : null;
    return {
      ...identity,
      claimLineId: claims[0].id,
      claimedAmount: sumMoney(claims.map((c) => c.claimedAmount)),
      approvedAmount,
      ...decisionOutcome(issuedAmount, approvedAmount),
    };
  });

  for (const c of claimParts) {
    if (c.jobCardLineId && issuedIds.has(c.jobCardLineId)) continue;
    rows.push({
      jobCardLineId: c.jobCardLineId,
      claimLineId: c.id,
      partNumber: c.partNumber,
      description: c.description,
      issuedQuantity: 0,
      issuedAmount: 0,
      claimedAmount: money(c.claimedAmount),
      approvedAmount: decided ? money(c.approvedAmount ?? 0) : null,
      variance: null,
      outcome: "NOT_ISSUED",
    });
  }

  const issuedTotal = sumMoney(rows.map((r) => r.issuedAmount));
  const approvedTotal = decided ? sumMoney(rows.map((r) => r.approvedAmount ?? 0)) : null;
  return {
    decided,
    rows,
    totals: {
      issuedAmount: issuedTotal,
      claimedAmount: sumMoney(rows.map((r) => r.claimedAmount ?? 0)),
      approvedAmount: approvedTotal,
      variance: approvedTotal == null ? null : money(new Prisma.Decimal(approvedTotal).minus(issuedTotal).toNumber()),
    },
  };
}

function decisionOutcome(issuedAmount: number, approvedAmount: number | null): { variance: number | null; outcome: IssuedPartOutcome } {
  if (approvedAmount == null) return { variance: null, outcome: "AWAITING_DECISION" };
  const variance = money(new Prisma.Decimal(approvedAmount).minus(issuedAmount).toNumber());
  return { variance, outcome: variance < 0 ? "SHORTFALL" : "RECOVERED" };
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
