import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";

/** Mirrors server/src/modules/service/labourRate.routes.ts (mounted at /service/labour-rates). */
const BASE = "/service/labour-rates";

export type Pricing = "TIME" | "FIXED";

export type LabourRateRow = {
  id: string;
  labourItemId: string;
  modelId: string;
  pricing: Pricing;
  hours: number;
  /** Hourly rate for TIME pricing, the fixed amount for FIXED pricing. */
  rate: number;
  active: boolean;
  modelCode: string;
  modelDescription: string;
  labourCode: string;
  labourDescription: string;
  vehicleSystem: string | null;
  group: string | null;
  labourActive: boolean;
};

export type RateFilter = {
  modelIds?: string[];
  vehicleSystem?: string;
  group?: string;
  search?: string;
  pricing?: Pricing;
  active?: boolean;
};

export type RateModelOption = { id: string; code: string; description: string; active: boolean; rates: number };

export type BulkAction =
  | { type: "SET_HOURS"; hours: number }
  | { type: "SET_RATE"; rate: number }
  | { type: "CHANGE_PERCENT"; percent: number; roundTo: number }
  | { type: "SET_PRICING"; pricing: Pricing }
  | { type: "SET_ACTIVE"; active: boolean };

export type RateScope = { ids: string[] } | { filter: RateFilter };

export type BulkResult = {
  matched: number;
  changing: number;
  field: string;
  sample: { model: string; labour: string; old: unknown; new: unknown }[];
  applied: boolean;
};

export type SpreadResult = {
  models: number;
  create: number;
  update: number;
  keep: number;
  applied: boolean;
  labour?: string;
  from?: string;
  sourceRates?: number;
};

/** Every bulk write is previewed first (`dryRun`) and applied with the previewed count (`expected`). */
export type DryRun = { dryRun?: boolean; expected?: number };

export type ApplyToModelsInput = {
  labourItemId: string;
  modelIds?: string[];
  pricing: Pricing;
  hours: number;
  rate: number;
  active: boolean;
  overwrite: boolean;
} & DryRun;

export type CopyModelInput = {
  fromModelId: string;
  toModelIds: string[];
  overwrite: boolean;
  percent?: number;
  roundTo: number;
} & DryRun;

function filterQuery(filter: RateFilter, page: number, limit: number): string {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filter.modelIds?.length) q.set("modelIds", filter.modelIds.join(","));
  if (filter.vehicleSystem) q.set("vehicleSystem", filter.vehicleSystem);
  if (filter.group) q.set("group", filter.group);
  if (filter.search) q.set("search", filter.search);
  if (filter.pricing) q.set("pricing", filter.pricing);
  if (filter.active !== undefined) q.set("active", String(filter.active));
  return q.toString();
}

export const labourRateKeys = {
  all: ["labour-rates"] as const,
  grid: (filter: RateFilter, page: number) => [...labourRateKeys.all, "grid", filter, page] as const,
  options: () => [...labourRateKeys.all, "options"] as const,
};

export const getRateGrid = (filter: RateFilter, page: number, limit: number) =>
  apiGet<{ rates: LabourRateRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
    `${BASE}/grid?${filterQuery(filter, page, limit)}`,
  );

export const getRateOptions = () =>
  apiGet<{ models: RateModelOption[]; vehicleSystems: string[]; groups: string[] }>(`${BASE}/options`);

export const editRate = (id: string, data: Partial<Pick<LabourRateRow, "pricing" | "hours" | "rate" | "active">>) =>
  apiPatch<{ rate: LabourRateRow }>(`${BASE}/${id}`, data);

export const bulkUpdateRates = (body: { scope: RateScope; action: BulkAction } & DryRun) =>
  apiPost<BulkResult>(`${BASE}/bulk`, body);

export const applyLabourToModels = (body: ApplyToModelsInput) => apiPost<SpreadResult>(`${BASE}/apply-to-models`, body);

export const copyModelRates = (body: CopyModelInput) => apiPost<SpreadResult>(`${BASE}/copy-model`, body);

/** The API's error message, for toasts. */
export function errorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}
