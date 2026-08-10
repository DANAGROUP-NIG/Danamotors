import { apiGet } from "@/lib/api/apiClient";
import type { TechnicianListResponse } from "../types/technician.types";

const BASE = "/workshop/technicians";

export async function getTechniciansRequest(params?: {
  page?: number;
  limit?: number;
  branchId?: string;
  search?: string;
}): Promise<TechnicianListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.branchId) query.set("branchId", params.branchId);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiGet<TechnicianListResponse>(`${BASE}${qs ? `?${qs}` : ""}`);
}
