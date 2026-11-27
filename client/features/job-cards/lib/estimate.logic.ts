import type {
  AdvanceExemption,
  DraftLinePayload,
  EstimateLine,
  EstimatePayer,
  EstimateTotals,
  JobEstimateStep,
  LineDecision,
  LineKind,
  ManualExemption,
} from "../types/job-estimate.types";

/**
 * The staged estimate on the client. Totals mirror server/src/modules/service/job-estimate.logic.ts
 * exactly (whole kobo, VAT once on the subtotal, rounded half up); both are tested against the same
 * fixtures (server/src/modules/service/estimate-totals.fixtures.json).
 */

/** "12,345.67" or 12345.67 to whole kobo, without binary rounding. */
export function toKobo(value: string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError(`Not a money amount: ${text}`);
  const kobo = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -kobo : kobo;
}

export function fromKobo(kobo: number): string {
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** amount x percent / 100, rounded half up, both in hundredths. */
function percentOf(kobo: number, percentHundredths: number): number {
  return Math.floor((kobo * percentHundredths + 5000) / 10000);
}

type TotalsLine = { payer: EstimatePayer; amount: string; customerDecision?: LineDecision | null };

export function estimateTotals(lines: TotalsLine[], vatRate: string): EstimateTotals {
  const rate = toKobo(vatRate);
  const customer = lines.filter((line) => line.payer === "CUSTOMER");
  const approved = customer.filter((line) => line.customerDecision !== "DECLINED");
  const sum = (rows: TotalsLine[]) => rows.reduce((total, line) => total + toKobo(line.amount), 0);
  const customerSubtotal = sum(customer);
  const approvedSubtotal = sum(approved);
  const vat = percentOf(customerSubtotal, rate);
  const approvedVat = percentOf(approvedSubtotal, rate);
  return {
    customerSubtotal: fromKobo(customerSubtotal),
    vat: fromKobo(vat),
    customerTotal: fromKobo(customerSubtotal + vat),
    otherPayerTotal: fromKobo(sum(lines.filter((line) => line.payer !== "CUSTOMER"))),
    approvedSubtotal: fromKobo(approvedSubtotal),
    approvedVat: fromKobo(approvedVat),
    approvedTotal: fromKobo(approvedSubtotal + approvedVat),
    customerLineCount: customer.length,
    declinedCount: customer.length - approved.length,
  };
}

export function suggestedAdvance(total: string, percent: string | number): string {
  const rate = toKobo(typeof percent === "number" ? percent.toFixed(2) : percent);
  if (rate < 0 || rate > 10000) throw new RangeError("Advance percentage must be between 0 and 100");
  return fromKobo(percentOf(toKobo(total), rate));
}

/** The live total on the customer's screen while they choose. */
export function liveApproval(lines: EstimateLine[], decisions: Record<string, LineDecision>, vatRate: string) {
  const totals = estimateTotals(
    lines.map((line) => ({ payer: line.payer, amount: line.amount, customerDecision: line.payer === "CUSTOMER" ? (decisions[line.id] ?? null) : null })),
    vatRate,
  );
  const customer = lines.filter((line) => line.payer === "CUSTOMER");
  return {
    total: totals.approvedTotal,
    approvedCount: customer.filter((line) => decisions[line.id] !== "DECLINED").length,
    declinedCount: totals.declinedCount,
    allDeclined: customer.length > 0 && customer.length === lines.length && customer.every((line) => decisions[line.id] === "DECLINED"),
  };
}

/** Every customer-pay line starts as Approve; the customer turns off what they do not want. */
export function initialDecisions(lines: EstimateLine[]): Record<string, LineDecision> {
  return Object.fromEntries(lines.filter((line) => line.payer === "CUSTOMER").map((line) => [line.id, "APPROVED" as const]));
}

// ---------------------------------------------------------------------------------------------
// Words on screen

export const PAYER_SECTION: Record<EstimatePayer, string> = {
  CUSTOMER: "Customer pays",
  WARRANTY: "Warranty (not charged to customer)",
  GOODWILL: "Goodwill (not charged to customer)",
  CAMPAIGN: "Campaign (not charged to customer)",
};

export const PAYER_LABEL: Record<EstimatePayer, string> = {
  CUSTOMER: "Customer",
  WARRANTY: "Warranty",
  GOODWILL: "Goodwill",
  CAMPAIGN: "Campaign",
};

export const KIND_LABEL: Record<LineKind, string> = {
  PART: "Part",
  OIL: "Oil",
  LABOUR: "Labour",
  SERVICE: "Service",
  REQUEST: "Request",
};

export const EXEMPTION_OPTIONS: { value: ManualExemption; label: string }[] = [
  { value: "FREE_SERVICE", label: "Free service" },
  { value: "INTERNAL", label: "Internal job" },
  { value: "CREDIT_APPROVED", label: "Credit approved" },
];

export const EXEMPTION_LABEL: Record<AdvanceExemption, string> = {
  WARRANTY_ONLY: "Warranty only",
  FREE_SERVICE: "Free service",
  CAMPAIGN: "Campaign",
  INTERNAL: "Internal job",
  CREDIT_APPROVED: "Credit approved",
};

const PAYER_ORDER: EstimatePayer[] = ["CUSTOMER", "WARRANTY", "GOODWILL", "CAMPAIGN"];

/** Lines in sections by payer; the customer section is always shown (it has Add line). */
export function payerSections<T extends { payer: EstimatePayer }>(lines: T[]) {
  return PAYER_ORDER.flatMap((payer) => {
    const rows = lines.filter((line) => line.payer === payer);
    return payer === "CUSTOMER" || rows.length ? [{ payer, title: PAYER_SECTION[payer], lines: rows }] : [];
  });
}

/** "1.00 h" for labour, "4.50" for parts and oil. */
export function quantityText(line: Pick<EstimateLine, "kind" | "quantity">): string {
  const value = Number(line.quantity).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return line.kind === "LABOUR" ? `${value} h` : value;
}

/** Customer-pay lines grouped under the customer's requests, in their words; lines with no request come last. */
export function customerGroups(lines: EstimateLine[], requests: JobEstimateStep["requests"]) {
  const customer = lines.filter((line) => line.payer === "CUSTOMER");
  const groups = requests
    .map((request) => ({ key: request.id, number: request.number as number | null, title: request.description, lines: customer.filter((line) => line.complaintId === request.id) }))
    .filter((group) => group.lines.length);
  const known = new Set(requests.map((request) => request.id));
  const unmatched = customer.filter((line) => !line.complaintId || !known.has(line.complaintId));
  const service = unmatched.filter((line) => line.kind === "SERVICE");
  const other = unmatched.filter((line) => line.kind !== "SERVICE");
  return [
    ...(service.length ? [{ key: "service", number: null, title: "Service", lines: service }] : []),
    ...groups,
    ...(other.length ? [{ key: "other", number: null, title: "Other recommended work", lines: other }] : []),
  ];
}

/** "Covered by warranty: AC compressor, AC refrigerant recharge. No charge to you." or null. */
export function noChargeNote(lines: EstimateLine[]): string | null {
  const covered = lines.filter((line) => line.payer !== "CUSTOMER");
  if (!covered.length) return null;
  const by = new Set(covered.map((line) => line.payer));
  const who = by.size === 1 && by.has("WARRANTY") ? "Covered by warranty" : by.size === 1 && by.has("CAMPAIGN") ? "Covered by a campaign" : "Covered at no charge to you";
  return `${who}: ${covered.map((line) => line.description).join(", ")}. No charge to you.`;
}

export type EstimateTab = "PREPARE" | "APPROVAL" | "ADVANCE";

/** Which part of the step the job is on: Prepare, Customer approval, or Advance and release. */
export function currentTab(step: Pick<JobEstimateStep, "estimate">): EstimateTab {
  const estimate = step.estimate;
  if (!estimate) return "PREPARE";
  if (estimate.approval) return "ADVANCE";
  return estimate.presentedAt ? "APPROVAL" : "PREPARE";
}

export const TAB_LABELS: Record<EstimateTab, string> = { PREPARE: "Prepare", APPROVAL: "Customer approval", ADVANCE: "Advance and release" };

/** "Estimate, revision 1, draft" and the like. */
export function estimateTitle(estimate: { version: number; supplementary?: boolean; approval: unknown; presentedAt: string | null; outcome: string | null }): string {
  const state = !estimate.approval ? (estimate.presentedAt ? "with the customer" : "draft") : estimate.outcome === "ALL_DECLINED" ? "declined" : estimate.outcome === "PARTIAL" ? "partly approved" : "approved";
  return `Estimate, revision ${estimate.version}${estimate.supplementary ? " (supplementary)" : ""}, ${state}`;
}

/** The disabled Release reason with who can fix it. */
export function advanceMissingReason(cashiers: string[]): string {
  if (!cashiers.length) return "Ask the cashier to record the advance. Nobody in this branch can record receipts yet.";
  return `Ask the cashier to record the advance. Cashier on duty: ${cashiers.slice(0, 2).join(", ")}${cashiers.length > 2 ? " and others" : ""}.`;
}

// ---------------------------------------------------------------------------------------------
// Draft editing

export interface DraftLine {
  key: string;
  type: "PART" | "LABOUR" | "SERVICE";
  kind: LineKind;
  referenceId: string;
  description: string;
  quantity: string;
  rate: string;
  payer: EstimatePayer;
  findingItemId: string | null;
  complaintId: string | null;
  /** The service charge line follows the service type; it cannot be removed here. */
  locked: boolean;
}

export function draftFromLines(lines: EstimateLine[]): DraftLine[] {
  return lines
    .filter((line) => ["PART", "LABOUR", "SERVICE"].includes(line.type))
    .map((line) => ({
      key: line.id,
      type: line.type as DraftLine["type"],
      kind: line.kind,
      referenceId: line.referenceId ?? "",
      description: line.description,
      quantity: Number(line.quantity).toString(),
      rate: line.rate,
      payer: line.payer,
      findingItemId: line.findingItemId,
      complaintId: line.complaintId,
      locked: line.type === "SERVICE",
    }));
}

/** An amount shown while editing: quantity times rate, or null when the quantity is not valid yet. */
export function draftAmount(line: Pick<DraftLine, "quantity" | "rate">): string | null {
  const problem = quantityProblem(line.quantity);
  if (problem) return null;
  return fromKobo(percentOf(toKobo(line.rate), toKobo(line.quantity) * 100));
}

export function quantityProblem(quantity: string): string | null {
  if (!quantity.trim()) return "Enter the quantity";
  if (!/^\d+(\.\d{1,2})?$/.test(quantity.trim())) return "Enter the quantity as a number with at most 2 decimal places";
  const value = Number(quantity);
  if (value <= 0) return "Quantity must be more than 0";
  if (value > 100000) return "Quantity must be 100,000 or less";
  return null;
}

export function percentProblem(percent: string): string | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(percent.trim())) return "Enter the advance percentage as a number, for example 60";
  return Number(percent) > 100 ? "The advance percentage must be between 0 and 100" : null;
}

export function draftPayload(lines: DraftLine[]): DraftLinePayload[] {
  return lines.map((line) => ({
    type: line.type,
    referenceId: line.referenceId,
    quantity: Number(line.quantity),
    payer: line.payer,
    findingItemId: line.findingItemId,
    complaintId: line.complaintId,
  }));
}

/** A part or labour already on the draft cannot be added twice. */
export function duplicateLine(lines: DraftLine[], type: DraftLine["type"], referenceId: string): DraftLine | undefined {
  return lines.find((line) => line.type === type && line.referenceId === referenceId);
}

// ---------------------------------------------------------------------------------------------
// Phone approval and the customer's signature

const PHONE = /^(\+?234|0)[789][01]\d{8}$/;

export function phoneProblem(phone: string): string | null {
  const digits = phone.replace(/\s+/g, "");
  if (!digits) return "Enter the phone number";
  return PHONE.test(digits) ? null : "Enter a Nigerian mobile number, for example 0803 555 0142";
}

export interface PhoneForm {
  approverName: string;
  approverPhone: string;
  /** datetime-local value in Lagos time, "2026-11-25T10:36". */
  approvedAt: string;
  approvedLineIds: string[];
  note: string;
}

export function phoneFormProblems(form: PhoneForm, now: Date, estimateCreatedAt: string): Partial<Record<keyof PhoneForm, string>> {
  const problems: Partial<Record<keyof PhoneForm, string>> = {};
  if (!form.approverName.trim()) problems.approverName = "Enter who approved on the phone";
  const phone = phoneProblem(form.approverPhone);
  if (phone) problems.approverPhone = phone;
  if (!form.approvedAt) problems.approvedAt = "Enter the date and time of the call";
  else {
    const at = lagosLocalToDate(form.approvedAt);
    if (at.getTime() > now.getTime() + 5 * 60 * 1000) problems.approvedAt = "The date and time of the call cannot be in the future";
    else if (at.getTime() < new Date(estimateCreatedAt).getTime() - 60 * 1000) problems.approvedAt = "The call must be after the estimate was prepared";
  }
  if (form.note.length > 1000) problems.note = "Use at most 1,000 characters for the note";
  return problems;
}

/** Lagos is UTC+1 all year (no daylight saving). */
export function lagosLocalToDate(local: string): Date {
  return new Date(`${local}:00+01:00`);
}

export function dateToLagosLocal(date: Date): string {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);
}

export interface SignForm {
  signer: "OWNER" | "REPRESENTATIVE";
  name: string;
  phone: string;
  signature: string | null;
  accepted: boolean;
}

export function signFormProblems(form: SignForm): Partial<Record<"name" | "phone" | "signature" | "accepted", string>> {
  const problems: Partial<Record<"name" | "phone" | "signature" | "accepted", string>> = {};
  if (form.signer === "REPRESENTATIVE") {
    if (!form.name.trim()) problems.name = "Enter the representative's name";
    const phone = phoneProblem(form.phone);
    if (phone) problems.phone = phone === "Enter the phone number" ? "Enter the representative's phone number" : phone;
  }
  if (!form.signature) problems.signature = "Ask the customer to sign in the box";
  if (!form.accepted) problems.accepted = "The customer must accept the estimate terms";
  return problems;
}

export function waiverReasonProblem(reason: string): string | null {
  return reason.trim().length < 5 ? "Write the reason for the waiver (at least 5 characters)" : reason.length > 1000 ? "Use at most 1,000 characters for the reason" : null;
}

export function exemptionReasonProblem(reason: string): string | null {
  return reason.trim().length < 5 ? "Write the reason no advance is needed (at least 5 characters)" : reason.length > 1000 ? "Use at most 1,000 characters for the reason" : null;
}

export const ADVANCE_PRESETS = ["20", "30", "60"] as const;

/** One word for an estimate revision, in lists and summaries (job card detail data). */
export function estimateStateLabel(estimate: { status: string; approvals?: { signatureState?: string; channel?: string; signatureDueAtDelivery?: boolean }[] }): string {
  const approval = estimate.approvals?.[0];
  if (approval?.signatureState === "invalid") return "Needs a new signature";
  const status = estimate.status.toUpperCase();
  if (status === "SUPERSEDED") return "Replaced by a later revision";
  if (status === "DECLINED") return "Declined";
  if (status === "APPROVED") return approval?.channel === "PHONE" ? "Approved by phone" : "Approved";
  return "Waiting for the customer";
}
