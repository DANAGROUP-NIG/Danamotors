/** Filters and helpers shared by the parts and stock report services. */
import { Prisma } from "@prisma/client";
import { reportEnd, reportStart } from "../finance/party-report";
import { money } from "../finance/money";
import { priceSale } from "../part-sale/partSale.logic";

export interface ReportFilters {
  from: string;
  to: string;
  /** The branch the report is for; undefined means every branch (cross-branch users only). */
  branchId?: string;
  customerId?: string;
  /** Vendor name on MITs and vendor MRNs. */
  vendor?: string;
  executiveId?: string;
  /** The other branch: receiving branch for STNs, requesting branch for inward indents, supplying
   * branch for outward indents and in-transit STNs, sending branch for SRNs. */
  otherBranchId?: string;
  partId?: string;
  /** With `partId`: the part's main part and all its alternates. */
  includeAlternates?: boolean;
  /** Legacy part type: S spare part, O oil, A accessory. */
  partType?: string;
  /** Legacy purchase source (part flag): O original part, A authorised source, F FOC item, L local. */
  partFlag?: string;
  priceCategory?: string;
  search?: string;
  status?: string;
  option?: string;
  fullyExecuted?: boolean;
  includeReturns?: boolean;
  includeCancelled?: boolean;
  /** Re-order report: count STNs as consumption (legacy "Include STN", off by default). */
  includeStn?: boolean;
  /** Stock reports: only parts with a movement in the period. */
  onlyTransacted?: boolean;
  /** Slow-moving items: not issued for this many days. */
  days?: number;
  /** Stock ageing: five increasing age limits in days. */
  ageLimits?: number[];
  /** Mileage-wise reports: five increasing mileage limits in km. */
  mileageLimits?: number[];
  /** Maximum consumed parts: how many parts to list. */
  topN?: number;
  /** Legacy "Only summary": one line per category (or packing list) instead of per part. */
  summary?: boolean;
  /** Stock taking reports: annual or perpetual counts, or the audit type. */
  countType?: string;
  /** Stock taking reports: only parts counted with a remark. */
  onlyRemarks?: boolean;
  /** Stock taking reports: also part numbers not in Part Master that the store set aside. */
  includeNotRequired?: boolean;
  /** Every line, for the Excel file, instead of the first 5,000 shown on screen. */
  full?: boolean;
}

/** Mileage bands asked for on the legacy screens are in km; these follow the 10,000 km service interval. */
export const DEFAULT_MILEAGE_LIMITS = [10000, 20000, 40000, 60000, 100000];

export type Row = Record<string, string | number | null>;

/** Lagos calendar days from `from` to the end of `to`. */
export function dateRange(f: Pick<ReportFilters, "from" | "to">) {
  return { gte: reportStart(f.from), lt: reportEnd(f.to) };
}

export function partWhere(f: ReportFilters): Prisma.SparePartWhereInput {
  return {
    ...(f.partId && { id: f.partId }),
    ...(f.partType && { partType: f.partType }),
    ...(f.partFlag && { partFlag: f.partFlag }),
    ...(f.priceCategory && { priceCategoryCode: f.priceCategory }),
  };
}

export const statusLabel = (status: string) => status.replace("_", " ").toLowerCase();

/** A counter-sale line's legacy trade discount and handling percentages. */
export type LineCharges = { tradeDiscountPercent?: number | null; handlingPercent?: number | null };

/**
 * Bill line values, priced exactly as the bill was: trade discount, cash discount, handling, then VAT.
 * `beforeVat` is the line's sale value (gross - trade - cash + handling).
 */
export function lineValues(quantity: number, rate: number, discountPercent: number, vatPercent: number | null, charges: LineCharges = {}) {
  const [line] = priceSale(
    [{ quantity, rate, vatPercent: vatPercent ?? 0, tradeDiscountPercent: charges.tradeDiscountPercent ?? 0, handlingPercent: charges.handlingPercent ?? 0 }],
    Math.min(100, Math.max(0, discountPercent)),
  ).lines;
  return {
    gross: line.gross,
    tradeDiscount: line.tradeDiscount,
    discount: line.discount,
    handling: line.handling,
    vat: line.vat,
    net: line.net,
    beforeVat: money(line.net - line.vat),
  };
}

export const userName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : "");
export const partyName = (c: { companyName: string | null; firstName: string; lastName: string }) =>
  c.companyName || `${c.firstName} ${c.lastName}`.trim();
