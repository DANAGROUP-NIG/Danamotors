/** Mirrors server/src/modules/finance/mobis-pricing.* (mounted at /finance/mobis-pricing). */
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import type { BulletinLine } from "../lib/parse-price-bulletin";

export const MOBIS_PRICING_MANAGE = "mobispricing:manage";
const BASE = "/finance/mobis-pricing";

export type MobisPricing = { conversionRate: number; dealerFactor: number; updatedAt: string | null };

export type BulletinStatus = "INCREASE" | "NOT_HIGHER" | "NOT_FOUND";
export type BulletinRow = {
  partNumber: string;
  listPrice: number;
  status: BulletinStatus;
  partId: string | null;
  name: string | null;
  priceCategoryCode: string | null;
  // Rates are removed by the server for users who cannot see dealer rates.
  oldDealerRate?: number | null;
  newDealerRate?: number;
  oldRetailRate: number | null;
  newRetailRate: number | null;
};
export type BulletinPreview = {
  pricing: MobisPricing;
  rows: BulletinRow[];
  summary: { lines: number; increase: number; notHigher: number; notFound: number };
};

type Person = { id: string; firstName: string; lastName: string };
export type PriceAdjustment = {
  id: string;
  number: number;
  kind: "BULLETIN" | "RATE_CHANGE";
  reference: string;
  sourceFileName: string | null;
  effectiveDate: string | null;
  conversionRate: number;
  dealerFactor: number | null;
  previousRate: number | null;
  linesInFile: number;
  updatedCount: number;
  notHigherCount: number;
  notFoundCount: number;
  remarks: string | null;
  appliedAt: string;
  appliedBy: Person;
};
export type PriceChange = {
  partId: string | null;
  partNumber: string;
  description: string;
  partFlag: string;
  priceCategoryCode: string | null;
  oldDealerRate?: number | null;
  newDealerRate?: number | null;
  oldRetailRate: number | null;
  newRetailRate: number | null;
};
export type AdjustmentDetail = {
  adjustment: PriceAdjustment;
  changes: PriceChange[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
export type RevaluationPreview = { fromRate: number; toRate: number; ratio: number | null; parts: number; partFlags: string[] };

export const getMobisPricing = () => apiGet<MobisPricing>(BASE);
export const saveMobisPricing = (body: { conversionRate: number; dealerFactor: number; revalue?: boolean; remarks?: string }) =>
  apiPut<{ pricing: MobisPricing; adjustment: AdjustmentDetail | null }>(BASE, body);
export const getRevaluationPreview = (rate: number) => apiGet<RevaluationPreview>(`${BASE}/revaluation-preview?rate=${rate}`);
export const previewBulletin = (lines: BulletinLine[]) => apiPost<BulletinPreview>(`${BASE}/bulletins/preview`, { lines });
export const applyBulletin = (body: {
  reference: string;
  sourceFileName?: string;
  effectiveDate?: string;
  remarks?: string;
  conversionRate: number;
  dealerFactor: number;
  lines: BulletinLine[];
}) => apiPost<AdjustmentDetail>(`${BASE}/bulletins`, body);
export const listAdjustments = () => apiGet<PriceAdjustment[]>(`${BASE}/adjustments`);
export const getAdjustment = (id: string, page = 1) => apiGet<AdjustmentDetail>(`${BASE}/adjustments/${id}?page=${page}`);

export const MOBIS_PRICING_KEY = ["mobis-pricing"] as const;
