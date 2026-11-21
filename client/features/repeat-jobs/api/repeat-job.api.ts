import { apiGet, apiPut } from "@/lib/api/apiClient";
import type { JobRepeatSummary, RepeatDetail, RepeatListResult, RepeatPreview, RepeatReasonOption, RepeatReviewPayload, RepeatSource, RepeatStatusFilter } from "../types/repeat-job.types";

const BASE = "/repeat-jobs";

export type RepeatListParams = { status: RepeatStatusFilter; source?: RepeatSource; search?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; branchId?: string };

export const repeatKeys = {
  all: ["repeat-jobs"] as const,
  list: (params: RepeatListParams) => [...repeatKeys.all, "list", params] as const,
  detail: (id: string) => [...repeatKeys.all, "detail", id] as const,
  forJob: (jobCardId: string) => [...repeatKeys.all, "job", jobCardId] as const,
  reasons: () => [...repeatKeys.all, "reasons"] as const,
  preview: (vehicleId: string, branchId: string | undefined, mileage: number | undefined) => [...repeatKeys.all, "preview", vehicleId, branchId ?? "", mileage ?? ""] as const,
};

function query(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}` : "";
}

export const getRepeatJobs = (params: RepeatListParams) => apiGet<RepeatListResult>(`${BASE}${query(params)}`);
export const getRepeatJob = (id: string) => apiGet<RepeatDetail>(`${BASE}/${id}`);
export const getJobRepeat = (jobCardId: string) => apiGet<JobRepeatSummary>(`${BASE}/job/${jobCardId}`);
export const getRepeatReasons = () => apiGet<RepeatReasonOption[]>(`${BASE}/reasons`);
export const reviewRepeatJob = (id: string, payload: RepeatReviewPayload) => apiPut<{ id: string; status: string; reviewedAt: string }>(`${BASE}/${id}/review`, payload);
export const getRepeatPreview = (vehicleId: string, branchId?: string, mileage?: number) =>
  apiGet<RepeatPreview>(`/service/vehicles/${vehicleId}/recent-jobs${query({ branchId, mileage })}`);
