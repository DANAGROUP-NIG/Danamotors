import { apiGet, apiPut } from "@/lib/api/apiClient";
import type { LateDetail, LateKind, LateListResult, LateReasonOption, LateSavePayload, ReasonFilter } from "../types/late-delivery.types";

const BASE = "/late-deliveries";

export type LateListParams = { kind: LateKind; dateFrom?: string; dateTo?: string; search?: string; reasons: ReasonFilter; page: number; limit: number; branchId?: string };

export const lateKeys = {
  all: ["late-deliveries"] as const,
  list: (params: LateListParams) => [...lateKeys.all, "list", params] as const,
  detail: (id: string, kind: LateKind) => [...lateKeys.all, "detail", id, kind] as const,
  reasons: () => [...lateKeys.all, "reasons"] as const,
};

function query(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}` : "";
}

export const getLateReasons = () => apiGet<LateReasonOption[]>(`${BASE}/reasons`);
export const getLateJobs = (params: LateListParams) => apiGet<LateListResult>(`${BASE}${query(params)}`);
export const findLateJob = (kind: LateKind, q: string, branchId?: string) => apiGet<{ id: string }>(`${BASE}/find${query({ kind, q, branchId })}`);
export const getLateDetail = (id: string, kind: LateKind) => apiGet<LateDetail>(`${BASE}/${id}${query({ kind })}`);
export const saveLateReasons = (id: string, payload: LateSavePayload) => apiPut<{ id: string; changed: boolean }>(`${BASE}/${id}`, payload);
