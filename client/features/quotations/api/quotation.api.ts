import { apiGet } from "@/lib/api/apiClient";
import type { QuotationListResponse } from "../types/quotation.types";

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
