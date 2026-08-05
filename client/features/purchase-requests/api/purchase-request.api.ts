import { apiGet, apiPatch } from "@/lib/api/apiClient";
import type { PurchaseRequest, PurchaseRequestListResponse } from "../types/purchase-request.types";

const BASE = "/inventory/purchase-requests";

export async function getPurchaseRequestsRequest(params?: {
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

export async function getPurchaseRequestRequest(id: string): Promise<PurchaseRequest> {
  const data = await apiGet<{ purchaseRequest: PurchaseRequest }>(`${BASE}/${id}`);
  return data.purchaseRequest;
}

export async function updatePurchaseRequestStatusRequest(
  id: string,
  payload: { status: "Approved" | "Rejected"; approvalNotes?: string },
): Promise<PurchaseRequest> {
  return apiPatch<PurchaseRequest>(`${BASE}/${id}/status`, payload);
}
