import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import type { CreatePreJobEstimatePayload, Quotation, QuotationListResponse } from "../types/quotation.types";

const BASE = "/service/estimates";

export async function getQuotationsRequest(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<QuotationListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiGet<QuotationListResponse>(`${BASE}${qs ? `?${qs}` : ""}`);
}

/** An estimate prepared before a job card exists. */
export function createPreJobEstimateRequest(body: CreatePreJobEstimatePayload) {
  return apiPost<{ estimate: Quotation }>(BASE, body);
}

export function recordEstimateDecisionRequest(id: string, body: { customerId: string; approved: boolean; comments?: string }) {
  return apiPost(`${BASE}/${id}/approvals`, body);
}

export function cancelEstimateRequest(id: string, reason: string) {
  return apiPatch<{ estimate: Quotation }>(`${BASE}/${id}/cancel`, { reason });
}
