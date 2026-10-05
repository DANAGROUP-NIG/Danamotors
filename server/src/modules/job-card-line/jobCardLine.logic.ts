/**
 * Pure rules for job card lines: who pays for each part and labour line, and
 * what a customer invoice contains. Database-free so they can be unit tested.
 */
import { ChargeType, WarrantyCoverageStatus } from "@prisma/client";
import { BadRequestError, ForbiddenError } from "../../shared/errors/appError";
import { round2 } from "../warranty/warranty.logic";

export interface ChargeContext {
  kind: "PART" | "LABOUR";
  /** Coverage snapshotted on the job card when it was created. */
  coverageAtCreation: WarrantyCoverageStatus | null;
  /** A warranty case exists for the job card (e.g. opened after verifying an UNKNOWN vehicle). */
  hasWarrantyCase: boolean;
  partWarrantyApplicable: boolean | null;
  /** Linked campaign whose covered items include this line, if any. */
  campaignMatchId: string | null;
}

/**
 * Default charge type for a new line:
 * FREE when a linked campaign covers it; WARRANTY when the vehicle was covered and
 * the part is warranty-applicable; otherwise CUSTOMER. Labour defaults to CUSTOMER
 * (the adviser or warranty officer reclassifies warranty labour).
 */
export function defaultChargeType(ctx: ChargeContext): { chargeType: ChargeType; campaignId: string | null } {
  if (ctx.campaignMatchId) return { chargeType: ChargeType.FREE, campaignId: ctx.campaignMatchId };
  const covered = ctx.coverageAtCreation === WarrantyCoverageStatus.ACTIVE || ctx.hasWarrantyCase;
  if (ctx.kind === "PART" && covered && ctx.partWarrantyApplicable) {
    return { chargeType: ChargeType.WARRANTY, campaignId: null };
  }
  return { chargeType: ChargeType.CUSTOMER, campaignId: null };
}

export interface ChargeChange {
  to: ChargeType;
  campaignId?: string | null;
  kind: "PART" | "LABOUR";
  coverageAtCreation: WarrantyCoverageStatus | null;
  hasWarrantyCase: boolean;
  partWarrantyApplicable: boolean | null;
  linkedCampaignIds: string[];
  canChargeGoodwill: boolean;
}

/** Validates a manual charge type change. Returns the campaign the line is charged to (FREE only). */
export function assertChargeChange(change: ChargeChange): { campaignId: string | null } {
  switch (change.to) {
    case ChargeType.CUSTOMER:
      return { campaignId: null };
    case ChargeType.WARRANTY: {
      const covered = change.coverageAtCreation === WarrantyCoverageStatus.ACTIVE || change.hasWarrantyCase;
      if (!covered) {
        throw new BadRequestError(
          "The vehicle was not under warranty when the job card was opened. A warranty officer must open a warranty case first, or charge goodwill.",
        );
      }
      if (change.kind === "PART" && !change.partWarrantyApplicable) {
        throw new BadRequestError("This part is not warranty-applicable, so it cannot be charged to warranty");
      }
      return { campaignId: null };
    }
    case ChargeType.GOODWILL:
      if (!change.canChargeGoodwill) {
        throw new ForbiddenError("Only a warranty officer or manager with warranty:update can charge goodwill");
      }
      return { campaignId: null };
    case ChargeType.FREE: {
      const campaignId = change.campaignId ?? (change.linkedCampaignIds.length === 1 ? change.linkedCampaignIds[0] : null);
      if (!campaignId) {
        throw new BadRequestError(
          change.linkedCampaignIds.length === 0
            ? "Free lines must be charged to a campaign, and this job card has no linked campaign"
            : "Choose which campaign pays for this free line",
        );
      }
      if (!change.linkedCampaignIds.includes(campaignId)) {
        throw new BadRequestError("The campaign is not linked to this job card");
      }
      return { campaignId };
    }
    default:
      throw new BadRequestError("Unknown charge type");
  }
}

// ── Totals ───────────────────────────────────────────────────────────────────

/** Nigerian VAT as a fraction. The service passes config.JOB_BILL_VAT_RATE / 100; this is the default for tests. */
export const VAT_RATE = 0.075;

export interface LineForTotals {
  chargeType: ChargeType;
  amount: number;
  taxable: boolean;
}

export interface ChargeTotals {
  customer: number;
  warranty: number;
  goodwill: number;
  free: number;
  customerTax: number;
  customerInvoiceTotal: number;
}

/** Totals by payer. Only CUSTOMER lines are invoiced; VAT applies to taxable customer lines. */
export function chargeTotals(lines: LineForTotals[], vatRate = VAT_RATE): ChargeTotals {
  const sum = (type: ChargeType) => round2(lines.filter((l) => l.chargeType === type).reduce((s, l) => s + l.amount, 0));
  const customer = sum(ChargeType.CUSTOMER);
  const taxableCustomer = lines
    .filter((l) => l.chargeType === ChargeType.CUSTOMER && l.taxable)
    .reduce((s, l) => s + l.amount, 0);
  const customerTax = round2(taxableCustomer * vatRate);
  return {
    customer,
    warranty: sum(ChargeType.WARRANTY),
    goodwill: sum(ChargeType.GOODWILL),
    free: sum(ChargeType.FREE),
    customerTax,
    customerInvoiceTotal: round2(customer + customerTax),
  };
}

export function lineAmount(quantity: number, rate: number): number {
  return round2(quantity * rate);
}

