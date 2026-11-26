import { z } from "zod";
import { ChargeType, FindingPayer, WarrantyCoverageStatus } from "@prisma/client";
import { AppError } from "../../shared/errors/appError";
import { assertChargeChange } from "../job-card-line/jobCardLine.logic";
import type { ServiceVerdict } from "../warranty/service-history.logic";
import { PHOTO_DATA_URL_LIMIT } from "./job-check-in.logic";

/**
 * Warranty check (job card revamp phase 4): the warranty officer sees coverage and service history
 * evidence and decides who pays for each diagnosed item, then returns the job to the service
 * advisor. Pure rules only; job-warranty.service.ts loads the facts and writes.
 */

export const DECISION_REASON_MAX = 1000;
export const DEALER_NAME_MAX = 120;
export const RECORD_NOTE_MAX = 500;
export const REMOVE_REASON_MAX = 500;
export const MAX_MILEAGE_READING = 2_000_000;

export const PAYERS = ["WARRANTY", "GOODWILL", "CAMPAIGN", "CUSTOMER"] as const satisfies readonly FindingPayer[];

/** How a decision becomes the job card line's charge type later (CAMPAIGN is a FREE line). */
export const PAYER_CHARGE: Record<FindingPayer, ChargeType> = {
  WARRANTY: ChargeType.WARRANTY,
  GOODWILL: ChargeType.GOODWILL,
  CAMPAIGN: ChargeType.FREE,
  CUSTOMER: ChargeType.CUSTOMER,
};

const PAYER_WORDS: Record<FindingPayer, string> = {
  WARRANTY: "warranty",
  GOODWILL: "goodwill",
  CAMPAIGN: "campaign",
  CUSTOMER: "customer pay",
};

const uuid = (message: string) => z.string().uuid(message);

/** Saving decisions: any items (each with its payer), and the reason when the key is present. */
export const decisionsBody = z
  .object({
    items: z
      .array(
        z
          .object({
            itemId: uuid("Reload the page and try again"),
            payer: z.enum(PAYERS, { errorMap: () => ({ message: "Choose Warranty, Goodwill, Campaign or Customer pay" }) }),
            campaignId: uuid("Choose the campaign that pays").nullable().optional(),
          })
          .strict(),
      )
      .max(200, "Save at most 200 items at a time"),
    reason: z
      .string()
      .trim()
      .max(DECISION_REASON_MAX, `Keep the reason under ${DECISION_REASON_MAX} characters`)
      .nullable()
      .optional(),
  })
  .strict();
export type DecisionsInput = z.infer<typeof decisionsBody>;

const lagosDate = /^\d{4}-\d{2}-\d{2}$/;

/** An outside service record from a stamped service book, with its photo. */
export const outsideRecordBody = z
  .object({
    requestId: uuid("Reload the page and try again"),
    serviceDate: z
      .string({ required_error: "Enter the service date", invalid_type_error: "Enter the service date" })
      .regex(lagosDate, "Enter the service date"),
    mileage: z
      .number({ required_error: "Enter the km reading from the service book", invalid_type_error: "Enter the km reading as a number" })
      .int("Enter the km reading as a whole number")
      .min(0, "Enter a km reading of 0 or more")
      .max(MAX_MILEAGE_READING, "Check the km reading. It is too high"),
    dealerName: z
      .string({ required_error: "Enter the dealer that did the service" })
      .trim()
      .min(2, "Enter the dealer that did the service")
      .max(DEALER_NAME_MAX, `Keep the dealer name under ${DEALER_NAME_MAX} characters`),
    note: z.string().trim().max(RECORD_NOTE_MAX, `Keep the note under ${RECORD_NOTE_MAX} characters`).optional(),
    image: z
      .string({ required_error: "Add a photo of the stamped service book page" })
      .min(1, "Add a photo of the stamped service book page")
      .max(PHOTO_DATA_URL_LIMIT, "The photo is too large. Use a photo under 2 MB"),
  })
  .strict();
export type OutsideRecordInput = z.infer<typeof outsideRecordBody>;

export const removeRecordBody = z
  .object({
    reason: z
      .string({ required_error: "Give the reason for removing this record" })
      .trim()
      .min(3, "Give the reason for removing this record")
      .max(REMOVE_REASON_MAX, `Keep the reason under ${REMOVE_REASON_MAX} characters`),
  })
  .strict();

/** The service rule settings form. servicesPerYear must split the year into whole months. */
export const serviceRuleBody = z
  .object({
    serviceIntervalMonths: z.number({ invalid_type_error: "Enter the months as a number" }).int("Enter whole months").min(1, "Enter at least 1 month").max(24, "Enter 24 months or fewer"),
    serviceIntervalKm: z.number({ invalid_type_error: "Enter the km as a number" }).int("Enter whole km").min(500, "Enter at least 500 km").max(100_000, "Enter 100,000 km or fewer"),
    servicesPerYear: z
      .number({ invalid_type_error: "Choose the services per year" })
      .refine((value) => [1, 2, 3, 4, 6, 12].includes(value), "Choose 1, 2, 3, 4, 6 or 12 services per year"),
    serviceGraceKm: z.number({ invalid_type_error: "Enter the grace km as a number" }).int("Enter whole km").min(0, "Enter 0 or more grace km").max(10_000, "Enter 10,000 grace km or fewer"),
    serviceGraceDays: z.number({ invalid_type_error: "Enter the grace days as a number" }).int("Enter whole days").min(0, "Enter 0 or more grace days").max(90, "Enter 90 grace days or fewer"),
  })
  .strict();

/** A service date: a real day, not after today and not before the sale. */
export function recordDateProblem(serviceDate: string, today: string, saleDate: string | null): string | null {
  const parsed = new Date(`${serviceDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== serviceDate) return "Enter the service date";
  if (serviceDate > today) return "The service date cannot be in the future";
  if (saleDate && serviceDate < saleDate) return "The service date is before the vehicle was sold";
  return null;
}

// ── Decisions ────────────────────────────────────────────────────────────────

export interface DecisionItem {
  id: string;
  label: string;
  kind: "LABOUR" | "PART" | "OIL";
  payer: FindingPayer | null;
}

/** Warranty and goodwill need a reason when the service history is not regular. */
export const reasonNeeded = (verdict: ServiceVerdict, items: Pick<DecisionItem, "payer">[]) =>
  verdict.kind === "IRREGULAR" && items.some((item) => item.payer === "WARRANTY" || item.payer === "GOODWILL");

export const REASON_REQUIRED =
  "Write a reason, because the service history is not regular and items are set to warranty or goodwill.";

/** What stops the warranty officer returning the job to the service advisor. */
export function decisionProblems(input: { items: DecisionItem[]; verdict: ServiceVerdict; reason: string | null }): string[] {
  const problems: string[] = [];
  const undecided = input.items.filter((item) => !item.payer).length;
  if (undecided)
    problems.push(`Choose who pays for every item (${undecided} of ${input.items.length} not decided yet).`);
  if (reasonNeeded(input.verdict, input.items) && !input.reason?.trim()) problems.push(REASON_REQUIRED);
  return problems;
}

export interface PayerContext {
  kind: "LABOUR" | "PART" | "OIL";
  label: string;
  coverageAtCreation: WarrantyCoverageStatus | null;
  hasWarrantyCase: boolean;
  /** Parts only: the part can be claimed. */
  partWarrantyApplicable: boolean | null;
  linkedCampaignIds: string[];
  canChargeGoodwill: boolean;
}

/**
 * Checks one decision with the job card line rules (assertChargeChange), so a decision is never
 * one the estimate could not charge. Returns the campaign for CAMPAIGN, or a problem naming the item.
 * As for lines, WARRANTY on a vehicle not covered when the job opened needs a warranty case first
 * (opened from the Warranty menu); goodwill is the alternative.
 */
export function checkPayer(
  payer: FindingPayer,
  campaignId: string | null | undefined,
  ctx: PayerContext,
): { ok: true; campaignId: string | null } | { ok: false; problem: string } {
  try {
    const result = assertChargeChange({
      to: PAYER_CHARGE[payer],
      campaignId,
      kind: ctx.kind === "LABOUR" ? "LABOUR" : "PART",
      coverageAtCreation: ctx.coverageAtCreation,
      hasWarrantyCase: ctx.hasWarrantyCase,
      partWarrantyApplicable: ctx.partWarrantyApplicable,
      linkedCampaignIds: ctx.linkedCampaignIds,
      canChargeGoodwill: ctx.canChargeGoodwill,
    });
    return { ok: true, campaignId: payer === "CAMPAIGN" ? result.campaignId : null };
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) return { ok: false, problem: `${ctx.label}: ${error.message}.`.replace(/\.\.$/, ".") };
    throw error;
  }
}

/** "3 items warranty, 6 customer pay." for the stage event and the finished step summary. */
export function decisionSummary(items: Pick<DecisionItem, "payer">[]): string {
  if (!items.length) return "No diagnosed items to decide.";
  const counts = PAYERS.map((payer) => [payer, items.filter((item) => item.payer === payer).length] as const).filter(([, count]) => count > 0);
  const parts = counts.map(([payer, count]) => `${count} ${count === 1 ? "item" : "items"} ${PAYER_WORDS[payer]}`);
  return `${parts.join(", ")}.`;
}
