import { createHash } from "crypto";
import { Prisma, type AdvanceExemption, type FindingPayer, type LineDecision } from "@prisma/client";
import { z } from "zod";

/**
 * The staged estimate (job card revamp phase 5): customer and other-payer totals, VAT, the
 * customer's line decisions, the signed content hash, the estimation charge (terms clause 4) and
 * when an advance is needed. Pure functions; client/features/job-cards/lib/estimate.logic.ts mirrors
 * the totals and must give the same answers (see estimate-totals.fixtures.json).
 */

const D = Prisma.Decimal;
type Decimalish = Prisma.Decimal | number | string;
const dec = (value: Decimalish) => new D(value);
const round2 = (value: Prisma.Decimal) => value.toDecimalPlaces(2, D.ROUND_HALF_UP);

export const ESTIMATE_PAYERS = ["CUSTOMER", "WARRANTY", "GOODWILL", "CAMPAIGN"] as const satisfies readonly FindingPayer[];

export interface TotalsLine {
  payer: FindingPayer;
  amount: Decimalish;
  customerDecision?: LineDecision | null;
}

export interface EstimateTotals {
  /** Customer-pay lines before VAT, all of them (what was offered). */
  customerSubtotal: string;
  vat: string;
  customerTotal: string;
  /** Warranty, goodwill and campaign lines: not charged to the customer. */
  otherPayerTotal: string;
  /** Customer-pay lines the customer did not decline, before VAT. Equal to customerSubtotal until decided. */
  approvedSubtotal: string;
  approvedVat: string;
  approvedTotal: string;
  customerLineCount: number;
  declinedCount: number;
}

const vatOn = (subtotal: Prisma.Decimal, vatRate: Decimalish) => round2(subtotal.times(dec(vatRate)).div(100));
const sum = (values: Decimalish[]) => values.reduce<Prisma.Decimal>((total, value) => total.plus(round2(dec(value))), new D(0));
const text = (value: Prisma.Decimal) => round2(value).toFixed(2);

/** Totals and VAT. VAT is worked out once on the subtotal (not per line), rounded half up to kobo. */
export function estimateTotals(lines: TotalsLine[], vatRate: Decimalish): EstimateTotals {
  const customer = lines.filter((line) => line.payer === "CUSTOMER");
  const approved = customer.filter((line) => line.customerDecision !== "DECLINED");
  const customerSubtotal = sum(customer.map((line) => line.amount));
  const approvedSubtotal = sum(approved.map((line) => line.amount));
  const vat = vatOn(customerSubtotal, vatRate);
  const approvedVat = vatOn(approvedSubtotal, vatRate);
  return {
    customerSubtotal: text(customerSubtotal),
    vat: text(vat),
    customerTotal: text(customerSubtotal.plus(vat)),
    otherPayerTotal: text(sum(lines.filter((line) => line.payer !== "CUSTOMER").map((line) => line.amount))),
    approvedSubtotal: text(approvedSubtotal),
    approvedVat: text(approvedVat),
    approvedTotal: text(approvedSubtotal.plus(approvedVat)),
    customerLineCount: customer.length,
    declinedCount: customer.length - approved.length,
  };
}

/** The suggested advance: a percentage of the amount the customer pays, rounded half up. */
export function suggestedAdvance(total: Decimalish, percent: Decimalish): string {
  const rate = dec(percent);
  if (!rate.isFinite() || rate.lt(0) || rate.gt(100)) throw new RangeError("Advance percentage must be between 0 and 100");
  return text(dec(total).times(rate).div(100));
}

// ---------------------------------------------------------------------------------------------
// Customer decisions

export interface DecisionLine {
  id: string;
  description: string;
  payer: FindingPayer;
}

export type DecisionProblem = { lineId: string | null; message: string };

/**
 * Every customer-pay line needs an answer; other payers are not the customer's to decide.
 * Returns the decision for each line (null for other payers) or the problems, each naming the line.
 */
export function resolveDecisions(lines: DecisionLine[], decisions: { lineId: string; decision: LineDecision }[]) {
  const known = new Map(lines.map((line) => [line.id, line]));
  const problems: DecisionProblem[] = [];
  const chosen = new Map<string, LineDecision>();
  for (const answer of decisions) {
    const line = known.get(answer.lineId);
    if (!line) problems.push({ lineId: answer.lineId, message: "An item is no longer on this estimate. Reload the estimate and try again." });
    else if (line.payer !== "CUSTOMER") problems.push({ lineId: line.id, message: `${line.description} is not paid by the customer, so it has no approve or decline choice.` });
    else if (chosen.has(line.id)) problems.push({ lineId: line.id, message: `${line.description} was answered twice. Choose Approve or Decline once.` });
    else chosen.set(line.id, answer.decision);
  }
  for (const line of lines)
    if (line.payer === "CUSTOMER" && !chosen.has(line.id))
      problems.push({ lineId: line.id, message: `Choose Approve or Decline for ${line.description}.` });
  return { problems, decisions: new Map(lines.map((line) => [line.id, chosen.get(line.id) ?? null])) };
}

export type EstimateOutcome = "APPROVED" | "PARTIAL" | "ALL_DECLINED";

/** All declined only when nothing at all will be done: every customer line declined and no other payer. */
export function estimateOutcome(lines: { payer: FindingPayer; customerDecision: LineDecision | null }[]): EstimateOutcome {
  const customer = lines.filter((line) => line.payer === "CUSTOMER");
  const declined = customer.filter((line) => line.customerDecision === "DECLINED").length;
  if (declined === 0) return "APPROVED";
  if (declined === customer.length && customer.length === lines.length) return "ALL_DECLINED";
  return "PARTIAL";
}

// ---------------------------------------------------------------------------------------------
// Signed content (version 2): payers, the customer's decisions and VAT are inside the hash, so a
// changed line, price, payer or answer makes the signature no longer match.

export interface HashLine {
  type: string;
  referenceId?: string | null;
  description: string;
  quantity: Decimalish;
  rate: Decimalish;
  amount: Decimalish;
  payer: FindingPayer;
  customerDecision: LineDecision | null;
}

export interface HashEstimate {
  version: number;
  currency: string;
  vatRate: Decimalish;
  upfrontPaymentPercent: Decimalish;
  lines: HashLine[];
}

export const ESTIMATE_HASH_VERSION = 2;

export function estimateContentHashV2(estimate: HashEstimate): string {
  const lines = estimate.lines
    .map((line) => [line.type, line.referenceId ?? null, line.description, text(dec(line.quantity)), text(dec(line.rate)), text(dec(line.amount)), line.payer, line.customerDecision])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
  const totals = estimateTotals(estimate.lines, estimate.vatRate);
  return createHash("sha256")
    .update(
      JSON.stringify({
        hash: ESTIMATE_HASH_VERSION,
        version: estimate.version,
        currency: estimate.currency,
        vatRate: text(dec(estimate.vatRate)),
        upfrontPaymentPercent: text(dec(estimate.upfrontPaymentPercent)),
        approvedTotal: totals.approvedTotal,
        lines,
      }),
    )
    .digest("hex");
}

/** The hash a decision would sign: the revision's lines with the proposed answers applied. */
export function withDecisions<T extends HashLine & { id: string }>(lines: T[], decisions: Map<string, LineDecision | null>): T[] {
  return lines.map((line) => ({ ...line, customerDecision: decisions.get(line.id) ?? null }));
}

// ---------------------------------------------------------------------------------------------
// Estimation charge (terms clause 4)

/** TODO(confirm): the larger of the branch minimum and the percentage of the estimate's customer total (with VAT). */
export function estimationCharge(customerTotal: Decimalish, settings: { minimum: Decimalish; percent: Decimalish }): string {
  const share = dec(customerTotal).times(dec(settings.percent)).div(100);
  const minimum = dec(settings.minimum);
  return text(D.max(minimum, share));
}

// ---------------------------------------------------------------------------------------------
// Advance before work

export const EXEMPTION_LABELS: Record<AdvanceExemption, string> = {
  WARRANTY_ONLY: "Warranty only",
  FREE_SERVICE: "Free service",
  CAMPAIGN: "Campaign",
  INTERNAL: "Internal job",
  CREDIT_APPROVED: "Credit approved",
};

/** Exemptions someone records by hand, with a reason. The other two follow from the approved lines. */
export const MANUAL_EXEMPTIONS = ["FREE_SERVICE", "INTERNAL", "CREDIT_APPROVED"] as const satisfies readonly AdvanceExemption[];

export interface AdvanceFacts {
  /** What the customer approved, with VAT. */
  approvedTotal: Decimalish;
  /** Payers of the lines that will be done (customer lines not declined, and every other payer). */
  approvedPayers: FindingPayer[];
  recorded: { exemption: AdvanceExemption; reason: string } | null;
  /** The job's service type is paid by the company (free service). */
  freeService?: boolean;
}

export type AdvanceRequirement =
  | { required: true }
  | { required: false; exemption: AdvanceExemption; reason: string; automatic: boolean };

/**
 * TODO(confirm) the exemption list. An advance is needed unless someone recorded an exemption with a
 * reason, or the customer has nothing to pay: then warranty (and goodwill) only, or campaign, follows
 * from the payers of the approved work.
 */
export function advanceRequirement(facts: AdvanceFacts): AdvanceRequirement {
  if (facts.recorded) return { required: false, exemption: facts.recorded.exemption, reason: facts.recorded.reason, automatic: false };
  if (dec(facts.approvedTotal).gt(0) || !facts.approvedPayers.length) return { required: true };
  if (facts.approvedPayers.some((payer) => payer === "CAMPAIGN"))
    return { required: false, exemption: "CAMPAIGN", reason: "A campaign pays for the approved work. The customer has nothing to pay.", automatic: true };
  if (facts.approvedPayers.some((payer) => payer === "WARRANTY" || payer === "GOODWILL"))
    return { required: false, exemption: "WARRANTY_ONLY", reason: "Warranty covers all approved work. The customer has nothing to pay.", automatic: true };
  return {
    required: false,
    exemption: "FREE_SERVICE",
    reason: facts.freeService ? "Free service: the company pays the service charge. The customer has nothing to pay." : "The approved work has no charge to the customer.",
    automatic: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Input rules

const uuid = (message: string) => z.string().uuid(message);
const requestId = z.string().uuid("Reload the page and try again");
const money2 = (label: string) =>
  z
    .number({ invalid_type_error: `Enter the ${label} as a number` })
    .finite(`Enter the ${label} as a number`)
    .positive(`${label[0].toUpperCase()}${label.slice(1)} must be more than 0`)
    .max(100000, `${label[0].toUpperCase()}${label.slice(1)} must be 100,000 or less`)
    .refine((value) => Math.round(value * 100) === value * 100, `Use at most 2 decimal places for the ${label}`);

export const draftLine = z
  .object({
    type: z.enum(["PART", "LABOUR", "SERVICE"], { errorMap: () => ({ message: "Choose a part, labour or service line" }) }),
    referenceId: uuid("Choose the part, labour operation or service from the list"),
    quantity: money2("quantity"),
    payer: z.enum(ESTIMATE_PAYERS, { errorMap: () => ({ message: "Choose who pays for the line" }) }),
    findingItemId: uuid("Reload the page and try again").nullable().optional(),
    complaintId: uuid("Reload the page and try again").nullable().optional(),
  })
  .strict();

export const prepareBody = z.object({ requestId }).strict();

export const saveDraftBody = z
  .object({
    estimateId: uuid("Reload the page and try again"),
    /** The draft as this person last saw it: a newer save by someone else is refused. */
    updatedAt: z.string().datetime("Reload the page and try again"),
    upfrontPaymentPercent: z
      .number({ invalid_type_error: "Enter the advance percentage as a number" })
      .min(0, "The advance percentage must be between 0 and 100")
      .max(100, "The advance percentage must be between 0 and 100")
      .refine((value) => Math.round(value * 100) === value * 100, "Use at most 2 decimal places for the advance percentage"),
    lines: z.array(draftLine).min(1, "Add at least one line to the estimate").max(200, "An estimate can have at most 200 lines"),
  })
  .strict();

export const presentBody = z.object({ estimateId: uuid("Reload the page and try again") }).strict();

const decision = z.object({ lineId: uuid("Reload the estimate and try again"), decision: z.enum(["APPROVED", "DECLINED"]) }).strict();
const nigerianPhone = z
  .string()
  .trim()
  .regex(/^(\+?234|0)[789][01]\d{8}$/, "Enter a Nigerian mobile number, for example 0803 555 0142")
  .or(z.string().trim().transform((value) => value.replace(/\s+/g, "")).pipe(z.string().regex(/^(\+?234|0)[789][01]\d{8}$/, "Enter a Nigerian mobile number, for example 0803 555 0142")));

export const approveBody = z
  .object({
    estimateId: uuid("Reload the page and try again"),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/, "Reload the estimate and try again"),
    decisions: z.array(decision).max(200),
    signer: z.enum(["OWNER", "REPRESENTATIVE"], { errorMap: () => ({ message: "Choose who is signing: Owner or Representative" }) }),
    signerName: z.string().trim().min(1, "Enter the name of the person signing").max(120, "Use at most 120 characters for the name"),
    signerPhone: nigerianPhone.optional(),
    signatureImage: z.string().min(1, "Ask the customer to sign in the box").max(88000, "The signature is too large. Clear it and sign again"),
    consentAccepted: z.literal(true, { errorMap: () => ({ message: "The customer must accept the estimate terms" }) }),
    requestId,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.signer === "REPRESENTATIVE" && !value.signerPhone)
      ctx.addIssue({ code: "custom", path: ["signerPhone"], message: "Enter the representative's phone number" });
  });

export const phoneApprovalBody = z
  .object({
    estimateId: uuid("Reload the page and try again"),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/, "Reload the estimate and try again"),
    approverName: z.string().trim().min(1, "Enter who approved on the phone").max(120, "Use at most 120 characters for the name"),
    approverPhone: nigerianPhone,
    approvedAt: z.string().datetime({ offset: true, message: "Enter the date and time of the call" }),
    approvedLineIds: z.array(uuid("Reload the estimate and try again")).max(200),
    note: z.string().trim().max(1000, "Use at most 1,000 characters for the note").optional(),
    requestId,
  })
  .strict();

const reason = (what: string) => z.string().trim().min(5, `Write the reason ${what} (at least 5 characters)`).max(1000, "Use at most 1,000 characters for the reason");

export const waiverRequestBody = z.object({ reason: reason("for the waiver"), requestId }).strict();
export const waiverDecisionBody = z
  .object({ approve: z.boolean(), note: z.string().trim().max(1000, "Use at most 1,000 characters for the note").optional(), requestId })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.approve && (value.note?.length ?? 0) < 5)
      ctx.addIssue({ code: "custom", path: ["note"], message: "Write why the waiver is declined (at least 5 characters)" });
  });
export const chargeBody = z.object({ requestId }).strict();
export const exemptionBody = z
  .object({
    exemption: z.enum(MANUAL_EXEMPTIONS, { errorMap: () => ({ message: "Choose why no advance is needed" }) }).nullable(),
    reason: z.string().trim().max(1000, "Use at most 1,000 characters for the reason").optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.exemption && (value.reason?.length ?? 0) < 5)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Write the reason no advance is needed (at least 5 characters)" });
  });
export const notifyCashierBody = z.object({ requestId }).strict();

/** Normalises a Nigerian mobile number to 0XXXXXXXXXX for storage and display. */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("234") ? `0${digits.slice(3)}` : digits;
}
