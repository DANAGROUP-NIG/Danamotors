import { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * Billing (job card revamp phase 8): the storage counter (terms clause 3), estimated against actual
 * (the paper job card's table), the payment gate before delivery and the input rules. Pure functions;
 * client/features/job-cards/lib/billing.logic.ts shows the same values and must agree.
 */

const D = Prisma.Decimal;
type Decimalish = Prisma.Decimal | number | string;
const dec = (value: Decimalish) => new D(value);
const round2 = (value: Prisma.Decimal) => value.toDecimalPlaces(2, D.ROUND_HALF_UP);
const text = (value: Prisma.Decimal) => round2(value).toFixed(2);

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₦48,350.00, for messages the server sends to the screen. */
export function formatNaira(value: Decimalish): string {
  return naira.format(round2(dec(value)).toNumber());
}

// ---------------------------------------------------------------------------------------------
// Storage counter (terms clause 3)

export interface StorageSettings {
  /** Free hours after the customer is first told the vehicle is ready. Branch setting, default 48. */
  freeHours: number;
  /** Charge per day after that. Branch setting, default ₦2,000.00. */
  dailyRate: Decimalish;
}

export interface StorageCounter {
  /** The first ready notification: the counter starts here. */
  notifiedAt: Date;
  /** Storage is free until this moment. */
  freeUntil: Date;
  freeHours: number;
  dailyRate: string;
  /** Whole days after the free period, up to `until`. */
  days: number;
  /** days x dailyRate. Proposed at billing, never added silently. */
  proposedAmount: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The storage counter from the first ready notification. TODO(confirm): only whole 24-hour days after
 * the free period are proposed (a part day is not charged); the period is counted in elapsed hours, so
 * it does not depend on the time zone or daylight saving. Null when the customer was never notified.
 */
export function storageCounter(notifiedAt: Date | null, settings: StorageSettings, until: Date): StorageCounter | null {
  if (!notifiedAt) return null;
  const freeUntil = new Date(notifiedAt.getTime() + settings.freeHours * HOUR_MS);
  const days = until.getTime() > freeUntil.getTime() ? Math.floor((until.getTime() - freeUntil.getTime()) / DAY_MS) : 0;
  return {
    notifiedAt,
    freeUntil,
    freeHours: settings.freeHours,
    dailyRate: text(dec(settings.dailyRate)),
    days,
    proposedAmount: text(dec(settings.dailyRate).times(days)),
  };
}

/**
 * The notification that starts storage for a bill. Consolidated jobs share one vehicle, which can only be
 * collected once every job on the bill is ready, so the latest of the jobs' first notifications counts.
 * A job never notified means nothing is proposed. TODO(confirm) with the service manager.
 */
export function storageStart(firstNotifications: (Date | null)[]): Date | null {
  if (!firstNotifications.length || firstNotifications.some((value) => !value)) return null;
  return new Date(Math.max(...firstNotifications.map((value) => value!.getTime())));
}

export const STORAGE_DESCRIPTION = (days: number, rate: Decimalish) =>
  `Storage charge, ${days} ${days === 1 ? "day" : "days"} at ${formatNaira(rate)} per day (terms clause 3)`;

// ---------------------------------------------------------------------------------------------
// Estimated and actual (paper job card)

export const CHARGE_GROUPS = ["PARTS", "OIL", "LABOUR", "SERVICE_CHARGE"] as const;
export type ChargeGroup = (typeof CHARGE_GROUPS)[number];

/**
 * A part counts as oil when its part type is O (legacy partmast.parttype: S spare part, O oil, A accessory).
 * Labour is labour; any service line is the service charge.
 */
export function chargeGroup(type: string, partType?: string | null): ChargeGroup {
  const base = type.replace("INCLUDED_", "");
  if (base === "LABOUR") return "LABOUR";
  if (base === "SERVICE") return "SERVICE_CHARGE";
  return partType?.toUpperCase() === "O" ? "OIL" : "PARTS";
}

export interface ComparedLine {
  group: ChargeGroup;
  amount: Decimalish;
}

export interface ComparisonRow {
  group: ChargeGroup | "TOTAL";
  estimated: string;
  actual: string;
  /** Actual minus estimated: positive when the customer pays more than estimated. */
  difference: string;
}

/**
 * Customer amounts before VAT, discount and round-off, by group, with a total row. Estimated: the
 * approved estimate (every approved revision is carried into the latest, so the latest decided one).
 * Actual: the customer-paid parts, oil, labour and service charge recorded on the job.
 */
export function estimatedVsActual(estimated: ComparedLine[], actual: ComparedLine[]): ComparisonRow[] {
  const total = (lines: ComparedLine[]) => lines.reduce<Prisma.Decimal>((sum, line) => sum.plus(round2(dec(line.amount))), new D(0));
  const row = (group: ComparisonRow["group"], est: Prisma.Decimal, act: Prisma.Decimal): ComparisonRow => ({
    group,
    estimated: text(est),
    actual: text(act),
    difference: text(act.minus(est)),
  });
  const rows = CHARGE_GROUPS.map((group) =>
    row(group, total(estimated.filter((line) => line.group === group)), total(actual.filter((line) => line.group === group))),
  );
  return [...rows, row("TOTAL", total(estimated), total(actual))];
}

// ---------------------------------------------------------------------------------------------
// Payment before delivery

export interface DeliveryPaymentFacts {
  /** An active bill exists for the job (its own or a consolidated one). */
  billed: boolean;
  /** What is still owed on that bill. Null when there is no bill. */
  balanceDue: Decimalish | null;
  creditApproved: boolean;
  /** No customer-paid charge at all (warranty, campaign or free work only), and no bill. */
  nothingToPay: boolean;
}

/**
 * Payment comes before delivery, except for credit-approved customers or when the customer has nothing
 * to pay. Returns the reason the job cannot go to delivery, or null.
 */
export function deliveryPaymentProblem(facts: DeliveryPaymentFacts): string | null {
  if (facts.creditApproved) return null;
  if (facts.billed) {
    const due = dec(facts.balanceDue ?? 0);
    return due.gt(0) ? `Balance of ${formatNaira(due)} not yet paid.` : null;
  }
  if (facts.nothingToPay) return null;
  return "Create the invoice before sending the job to delivery.";
}

export type PaymentStatus = "NOT_INVOICED" | "NOTHING_TO_PAY" | "UNPAID" | "PART_PAID" | "PAID";

/** The bill's payment state. The advance taken before work does not make a bill part paid: only payments after it do. */
export function paymentStatus(
  invoice: { total: Decimalish; balanceDue: Decimalish; advancePaid?: Decimalish } | null,
  nothingToPay: boolean,
): PaymentStatus {
  if (!invoice) return nothingToPay ? "NOTHING_TO_PAY" : "NOT_INVOICED";
  const due = dec(invoice.balanceDue);
  if (due.lte(0)) return "PAID";
  return due.lt(dec(invoice.total).minus(dec(invoice.advancePaid ?? 0))) ? "PART_PAID" : "UNPAID";
}

// ---------------------------------------------------------------------------------------------
// Input rules

const requestId = z.string({ required_error: "Reload the page and try again" }).uuid("Reload the page and try again");
const note = z
  .string({ invalid_type_error: "Write the note as text" })
  .trim()
  .max(500, "Keep the note to 500 characters or fewer")
  .optional()
  .nullable();

export const READY_CHANNELS = ["PHONE_CALL", "SMS"] as const;

export const readyNoticeBody = z
  .object({
    requestId,
    channel: z.enum(READY_CHANNELS, { errorMap: () => ({ message: "Choose how you told the customer: phone call or SMS" }) }),
    note,
  })
  .strict();
export type ReadyNoticeInput = z.infer<typeof readyNoticeBody>;

export const washedBody = z
  .object({ washed: z.boolean({ required_error: "Tick or clear Vehicle washed", invalid_type_error: "Tick or clear Vehicle washed" }) })
  .strict();

/** The advisor's answer to a proposed storage charge when the invoice is created. */
export const storageDecision = z.discriminatedUnion(
  "decision",
  [
    z.object({ decision: z.literal("ACCEPT") }).strict(),
    z
      .object({
        decision: z.literal("REMOVE"),
        reason: z
          .string({ required_error: "Give the reason for removing the storage charge" })
          .trim()
          .min(3, "Give the reason for removing the storage charge")
          .max(500, "Keep the reason to 500 characters or fewer"),
      })
      .strict(),
  ],
  { errorMap: () => ({ message: "Accept the storage charge, or remove it with a reason" }) },
);
export type StorageDecision = z.infer<typeof storageDecision>;
