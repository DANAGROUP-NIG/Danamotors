import { apiGet } from "@/lib/api/apiClient";
import type { InspectionListResponse } from "../types/inspection.types";

const BASE = "/service/inspections";

export async function getInspectionsRequest(params?: {
  page?: number;
  limit?: number;
  result?: string;
  search?: string;
  branchId?: string;
}): Promise<InspectionListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.result) query.set("result", params.result);
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", params.branchId);
  const qs = query.toString();
  return apiGet<InspectionListResponse>(`${BASE}${qs ? `?${qs}` : ""}`);
}
