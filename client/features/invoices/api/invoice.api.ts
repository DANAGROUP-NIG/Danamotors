import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
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

export type CreateInvoicePayload = {
  customerId: string;
  jobCardId?: string;
  invoiceNumber: string;
  issuedDate?: string;
  dueDate?: string;
  subtotal: number;
  tax?: number;
  total: number;
  status?: string;
  notes?: string;
};

export type UpdateInvoicePayload = {
  dueDate?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  status?: string;
  notes?: string;
};

export async function createInvoiceRequest(
  payload: CreateInvoicePayload,
): Promise<Invoice> {
  const result = await apiPost<{ invoice: Invoice }>(
    API_ROUTES.finance.invoices.base,
    payload,
  );
  return result.invoice;
}

export async function updateInvoiceRequest(
  id: string,
  payload: UpdateInvoicePayload,
): Promise<Invoice> {
  const result = await apiPut<{ invoice: Invoice }>(
    API_ROUTES.finance.invoices.detail(id),
    payload,
  );
  return result.invoice;
}
