import { apiGet, apiPut } from "@/lib/api/apiClient";
import type { LookupOption, ReportResponse } from "../types";

export type LookupSource =
  | "model"
  | "variant"
  | "serviceType"
  | "team"
  | "complaint"
  | "labourOperation"
  | "serviceAdvisor"
  | "technician";

export function runReportRequest(slug: string, query: Record<string, string>) {
  const search = new URLSearchParams(query).toString();
  return apiGet<ReportResponse>(`/reports/${encodeURIComponent(slug)}?${search}`);
}

export function getReportLookupRequest(source: LookupSource, branchId?: string) {
  const search = branchId ? `?${new URLSearchParams({ branchId }).toString()}` : "";
  return apiGet<LookupOption[]>(`/reports/lookups/${source}${search}`);
}

export interface MileageBand {
  id?: string;
  fromKm: number;
  toKm: number | null;
  label: string;
  active: boolean;
  sortOrder?: number;
}

export interface ReportSettings {
  mileageBands: MileageBand[];
  dueSoonHours: number;
}

export function getReportSettingsRequest() {
  return apiGet<ReportSettings>("/reports/settings");
}

export function saveReportSettingsRequest(body: { mileageBands?: Omit<MileageBand, "id" | "sortOrder">[]; dueSoonHours?: number }) {
  return apiPut<ReportSettings>("/reports/settings", body);
}
