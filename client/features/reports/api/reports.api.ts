import { apiGet } from "@/lib/api/apiClient";
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
