import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import type {
  CaseListParams,
  CscCaseDetail,
  CscListResult,
  CscModelRules,
  CscModelSummary,
  CscReason,
  CscServiceType,
  CscStaff,
  CscSummary,
  FollowUpPayload,
  FollowUpResult,
  GeneratePayload,
  GenerateResult,
  ReasonPayload,
  SaveRulesPayload,
} from "../types/csc.types";

const BASE = "/csc";

export const cscKeys = {
  all: ["csc"] as const,
  models: () => [...cscKeys.all, "models"] as const,
  rules: (modelId: string) => [...cscKeys.all, "rules", modelId] as const,
  serviceTypes: () => [...cscKeys.all, "service-types"] as const,
  reasons: (includeInactive: boolean) => [...cscKeys.all, "reasons", includeInactive] as const,
  cases: () => [...cscKeys.all, "cases"] as const,
  list: (params: CaseListParams) => [...cscKeys.cases(), "list", params] as const,
  detail: (id: string) => [...cscKeys.cases(), "detail", id] as const,
  summary: () => [...cscKeys.all, "summary"] as const,
  staff: () => [...cscKeys.all, "staff"] as const,
};

function query(params: Record<string, string | number | boolean | string[] | undefined>) {
  const entries = Object.entries(params).flatMap(([key, value]): [string, string][] => {
    if (value === undefined || value === "" || value === false) return [];
    if (Array.isArray(value)) return value.length ? [[key, value.join(",")]] : [];
    return [[key, String(value)]];
  });
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
}

export const getRuleModels = () => apiGet<CscModelSummary[]>(`${BASE}/rules/models`);
export const getModelRules = (modelId: string) => apiGet<CscModelRules>(`${BASE}/rules${query({ modelId })}`);
export const saveRules = (payload: SaveRulesPayload) => apiPut<{ saved: number; models: number; effectiveDate: string }>(`${BASE}/rules`, payload);
export const getServiceTypes = () => apiGet<CscServiceType[]>(`${BASE}/service-types`);
export const getReasons = (includeInactive: boolean) => apiGet<CscReason[]>(`${BASE}/close-reasons${query({ includeInactive })}`);
export const createReason = (payload: ReasonPayload) => apiPost<CscReason>(`${BASE}/close-reasons`, payload);
export const updateReason = (id: string, payload: ReasonPayload) => apiPut<CscReason>(`${BASE}/close-reasons/${id}`, payload);
export const deleteReason = (id: string) => apiDelete<{ id: string }>(`${BASE}/close-reasons/${id}`);
export const generateCases = (payload: GeneratePayload) => apiPost<GenerateResult>(`${BASE}/cases/generate`, payload);
export const getCases = (params: CaseListParams) => apiGet<CscListResult>(`${BASE}/cases${query({ ...params })}`);
export const getCase = (id: string) => apiGet<CscCaseDetail>(`${BASE}/cases/${id}`);
export const saveFollowUp = (id: string, payload: FollowUpPayload) => apiPut<FollowUpResult>(`${BASE}/cases/${id}/follow-up`, payload);
export const getSummary = () => apiGet<CscSummary>(`${BASE}/summary`);
export const getStaff = () => apiGet<CscStaff[]>(`${BASE}/staff`);
