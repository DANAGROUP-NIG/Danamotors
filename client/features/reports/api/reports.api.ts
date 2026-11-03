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
  | "technician"
  | "campaign"
  | "engineer"
  | "serviceGroup"
  | "partCategory"
  | "freeService";

export function runReportRequest(slug: string, query: Record<string, string>) {
  const search = new URLSearchParams(query).toString();
  return apiGet<ReportResponse>(`/reports/${encodeURIComponent(slug)}?${search}`);
}

export function getReportLookupRequest(source: LookupSource, branchId?: string) {
  const search = branchId ? `?${new URLSearchParams({ branchId }).toString()}` : "";
  return apiGet<LookupOption[]>(`/reports/lookups/${source}${search}`);
}

export interface ReportSettings {
  fpcLetterTemplate: string;
  fpcLetterIsDefault: boolean;
  fpcLetterPlaceholders: string[];
}

export function getReportSettingsRequest() {
  return apiGet<ReportSettings>("/reports/settings");
}

/** null resets the FPC letter to the default template. */
export function saveReportSettingsRequest(body: { fpcLetterTemplate: string | null }) {
  return apiPut<ReportSettings>("/reports/settings", body);
}
