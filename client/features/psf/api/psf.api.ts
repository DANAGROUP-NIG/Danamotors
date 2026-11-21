import { apiGet, apiPost } from "@/lib/api/apiClient";
import type { PsfCallPayload, PsfCallResult, PsfDetail, PsfListResult, PsfServiceType, PsfState } from "../types/psf.types";

const BASE = "/psf";

export type PsfListParams = { dateFrom?: string; dateTo?: string; search?: string; state: PsfState; page: number; limit: number; branchId?: string };

export const psfKeys = {
  all: ["psf"] as const,
  list: (params: PsfListParams) => [...psfKeys.all, "list", params] as const,
  detail: (id: string) => [...psfKeys.all, "detail", id] as const,
  serviceTypes: () => [...psfKeys.all, "service-types"] as const,
};

function query(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}` : "";
}

export const getPsfJobs = (params: PsfListParams) => apiGet<PsfListResult>(`${BASE}/jobs${query(params)}`);
export const findPsfJob = (q: string, branchId?: string) => apiGet<{ id: string }>(`${BASE}/find${query({ q, branchId })}`);
export const getPsfDetail = (id: string) => apiGet<PsfDetail>(`${BASE}/jobs/${id}`);
export const getPsfServiceTypes = () => apiGet<PsfServiceType[]>(`${BASE}/service-types`);
export const recordPsfCall = (id: string, payload: PsfCallPayload) => apiPost<PsfCallResult>(`${BASE}/jobs/${id}/calls`, payload);
