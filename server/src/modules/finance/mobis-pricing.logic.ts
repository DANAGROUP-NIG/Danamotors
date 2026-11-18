/**
 * Mobis pricing: the USD conversion rate, the dealer factor and the price runs Finance makes with them
 * (doc/mobis-pricing.md). Pure functions only; mobis-pricing.service.ts reads and writes.
 *
 * Legacy evidence (AutoEnhancer, CPDAutoEnhancer, ABJAutoEnhancer PartRateHistory):
 *  - Bulletin: dealer rate = new USD list price x conversion rate x dealer factor; retail rate = dealer
 *    rate x part category multiplier; applied only when the dealer rate goes up (DateManager tool,
 *    Parts.vb: list x 2700 x 0.616 = ₦1,663.20 per USD of list price; the user chose the script's 0.616).
 *  - Rate change: every O and A part's dealer and retail rates scaled by new rate / old rate, e.g.
 *    26 Aug 2024 x1.421 = 1900 -> 2700. Never downwards.
 */

export const MOBIS_PRICING_KEY = "mobisPricing";

export interface MobisPricing {
  /** Naira per US dollar for Mobis invoices and list prices. */
  conversionRate: number;
  /** Share of the USD list price Mobis charges the dealer (dealer rate = list x rate x factor). */
  dealerFactor: number;
}

export const DEFAULT_MOBIS_PRICING: MobisPricing = { conversionRate: 2700, dealerFactor: 0.616 };

/** Part flags a conversion rate revaluation touches: Mobis-bought parts. F (FOC) and L (local) are priced in naira. */
export const REVALUED_PART_FLAGS = ["O", "A"] as const;

export const round2 = (n: number) => Math.round(n * 100) / 100;

const positive = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** The stored FinanceSetting value, falling back to the defaults for anything missing or invalid. */
export function readPricing(value: unknown): MobisPricing {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    conversionRate: positive(v.conversionRate) ?? DEFAULT_MOBIS_PRICING.conversionRate,
    dealerFactor: positive(v.dealerFactor) ?? DEFAULT_MOBIS_PRICING.dealerFactor,
  };
}

export function dealerRateFromList(listPrice: number, pricing: MobisPricing): number {
  return round2(listPrice * pricing.conversionRate * pricing.dealerFactor);
}

/**
 * Retail rate for a new dealer rate: dealer x the part category multiplier. A part without a category
 * keeps its present retail/dealer markup (legacy used x1 there, which would sell at cost).
 */
export function retailRateFor(newDealer: number, multiplier: number | null, current: { dealer: number; retail: number | null }): number | null {
  if (multiplier != null && multiplier > 0) return round2(newDealer * multiplier);
  if (current.retail != null && current.retail > 0 && current.dealer > 0) return round2(newDealer * (current.retail / current.dealer));
  return current.retail;
}

export interface BulletinLine {
  partNumber: string;
  listPrice: number;
}

export interface PricedPart {
  id: string;
  partNumber: string;
  name: string;
  partFlag: string;
  priceCategoryCode: string | null;
  unitPrice: number;
  retailRate: number | null;
  /** Part category multiplier, null when the part has no category. */
  multiplier: number | null;
}

export type BulletinStatus = "INCREASE" | "NOT_HIGHER" | "NOT_FOUND";

export interface BulletinRow {
  partNumber: string;
  listPrice: number;
  status: BulletinStatus;
  partId: string | null;
  name: string | null;
  priceCategoryCode: string | null;
  oldDealerRate: number | null;
  newDealerRate: number;
  oldRetailRate: number | null;
  newRetailRate: number | null;
}

export interface BulletinPlan {
  rows: BulletinRow[];
  summary: { lines: number; increase: number; notHigher: number; notFound: number };
}

/** Normalises part numbers and keeps one line per part (the higher list price if a part is listed twice). */
export function cleanBulletinLines(lines: BulletinLine[]): BulletinLine[] {
  const byNumber = new Map<string, BulletinLine>();
  for (const l of lines) {
    const partNumber = l.partNumber.replace(/\s+/g, "").toUpperCase();
    if (!partNumber || !(l.listPrice > 0)) continue;
    const seen = byNumber.get(partNumber);
    if (!seen || l.listPrice > seen.listPrice) byNumber.set(partNumber, { partNumber, listPrice: l.listPrice });
  }
  return [...byNumber.values()];
}

/** What a bulletin would do to each part. Only INCREASE rows are ever written. */
export function planBulletin(lines: BulletinLine[], parts: PricedPart[], pricing: MobisPricing): BulletinPlan {
  const byNumber = new Map(parts.map((p) => [p.partNumber.toUpperCase(), p]));
  const rows = cleanBulletinLines(lines).map((l): BulletinRow => {
    const part = byNumber.get(l.partNumber);
    const newDealerRate = dealerRateFromList(l.listPrice, pricing);
    if (!part) {
      return { ...l, status: "NOT_FOUND", partId: null, name: null, priceCategoryCode: null, oldDealerRate: null, newDealerRate, oldRetailRate: null, newRetailRate: null };
    }
    const increase = newDealerRate > part.unitPrice;
    return {
      ...l,
      status: increase ? "INCREASE" : "NOT_HIGHER",
      partId: part.id,
      name: part.name,
      priceCategoryCode: part.priceCategoryCode,
      oldDealerRate: part.unitPrice,
      newDealerRate,
      oldRetailRate: part.retailRate,
      newRetailRate: increase ? retailRateFor(newDealerRate, part.multiplier, { dealer: part.unitPrice, retail: part.retailRate }) : part.retailRate,
    };
  });
  const count = (s: BulletinStatus) => rows.filter((r) => r.status === s).length;
  return { rows, summary: { lines: rows.length, increase: count("INCREASE"), notHigher: count("NOT_HIGHER"), notFound: count("NOT_FOUND") } };
}

/** The factor a rate change scales prices by, or null when the rate does not go up (prices never go down). */
export function revaluationRatio(fromRate: number, toRate: number): number | null {
  return fromRate > 0 && toRate > fromRate ? toRate / fromRate : null;
}
