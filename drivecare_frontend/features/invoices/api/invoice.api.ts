import { apiGet } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type { Invoice, InvoiceListResponse } from "../types/invoice.types";

export async function getInvoicesRequest(params?: {
  branchId?: string;
  customerId?: string;
}): Promise<InvoiceListResponse> {
  const query = new URLSearchParams();
  if (params?.branchId) query.set("branchId", params.branchId);
  if (params?.customerId) query.set("customerId", params.customerId);
  const qs = query.toString();
  return apiGet<InvoiceListResponse>(
    `${API_ROUTES.finance.invoices.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getInvoiceRequest(id: string): Promise<Invoice> {
  return apiGet<Invoice>(API_ROUTES.finance.invoices.detail(id));
}
