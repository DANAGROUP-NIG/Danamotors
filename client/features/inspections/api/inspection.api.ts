import { apiGet } from "@/lib/api/apiClient";
import type { InspectionListResponse } from "../types/inspection.types";

const BASE = "/service/inspections";

export async function getInspectionsRequest(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<InspectionListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiGet<InspectionListResponse>(`${BASE}${qs ? `?${qs}` : ""}`);
}
