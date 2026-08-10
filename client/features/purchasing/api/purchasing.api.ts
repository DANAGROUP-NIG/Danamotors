import { apiGet } from "@/lib/api/apiClient";
import type { PurchaseRequestListResponse } from "@/features/purchase-requests";

const BASE = "/inventory/purchase-requests";

export async function getPurchasingRequest(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<PurchaseRequestListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiGet<PurchaseRequestListResponse>(`${BASE}${qs ? `?${qs}` : ""}`);
}
