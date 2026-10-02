import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api/apiClient";
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
  const result = await apiGet<{ invoice: Invoice }>(API_ROUTES.finance.invoices.detail(id));
  return result.invoice;
}

export type UpdateInvoicePayload = {
  dueDate?: string;
  notes?: string;
};

export type BillableJobCard = {
  serviceAdvisorId?: string | null;
  id: string;
  jobNumber: string;
  status: string;
  description: string;
  customer?: { id: string; firstName: string; lastName: string } | null;
  vehicle?: { make?: string | null; model?: string | null; registrationNumber?: string | null } | null;
  branch: { id: string; name: string };
};

export type JobBillPreview = {
  jobCard: BillableJobCard;
  lines: Array<{ id?: string; type: "PART" | "LABOUR"; description: string; quantity: number; rate: number; amount: number }>;
  totals: {
    partsTotal: number;
    labourTotal: number;
    partsDiscountAmount: number;
    labourDiscountAmount: number;
    vatRate: number;
    vatAmount: number;
    roundOff: number;
    subtotal: number;
    total: number;
  };
};

export type ServiceAdvisor = { id: string; firstName: string; lastName: string; email: string };
export type ReceivingBank = { id: string; code: string; name: string; accountNumber?: string | null };
export type CreateReceiptPayload = {
  customerId: string;
  mode: "POS" | "BANK_TRANSFER" | "CASH";
  category: "SERVICE_PARTS" | "SALES_ENQUIRY";
  bankId?: string;
  amount: number;
  reference?: string;
  narration?: string;
  allocations: Array<{ invoiceId: string; amount: number }>;
};
export type ReceiptRegisterRow = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  mode: string;
  category: "SERVICE_PARTS" | "SALES_ENQUIRY";
  amount: number;
  advanceAmount: number;
  notes?: string | null;
  status: string;
  customer: { id: string; firstName: string; lastName: string };
  bank?: { id: string; name: string } | null;
  allocations: Array<{ invoice: { invoiceNumber: string } }>;
};
export type ReceiptRegisterResponse = {
  receipts: ReceiptRegisterRow[];
  totalsByMode: Record<string, number>;
  grandTotal: number;
};
export type CreateJobBillPayload = {
  jobCardId: string;
  partsDiscountPercent: number;
  labourDiscountPercent: number;
  serviceAdvisorId: string;
  notes?: string;
};

export async function getBillableJobCardsRequest(): Promise<{ jobCards: BillableJobCard[] }> {
  return apiGet(API_ROUTES.finance.jobCardsBillable);
}

export async function getServiceAdvisorsRequest(): Promise<{ advisors: ServiceAdvisor[] }> {
  return apiGet(API_ROUTES.finance.serviceAdvisors);
}

export async function previewJobBillRequest(input: {
  jobCardId: string;
  partsDiscountPercent: number;
  labourDiscountPercent: number;
}): Promise<{ preview: JobBillPreview }> {
  return apiPost(API_ROUTES.finance.jobBillPreview, input);
}

export async function createJobBillRequest(payload: CreateJobBillPayload): Promise<Invoice> {
  const result = await apiPost<{ invoice: Invoice }>(API_ROUTES.finance.jobBills, payload);
  return result.invoice;
}

export async function getBanksRequest(): Promise<{ banks: ReceivingBank[] }> {
  return apiGet(API_ROUTES.finance.banks);
}

export async function createReceiptRequest(payload: CreateReceiptPayload) {
  return apiPost(API_ROUTES.finance.receipts, payload);
}

export async function cancelInvoiceRequest(id: string, remark: string): Promise<Invoice> {
  const result = await apiPatch<{ invoice: Invoice }>(`${API_ROUTES.finance.invoices.detail(id)}/cancel`, { remark });
  return result.invoice;
}

export async function getReceiptRegisterRequest(params: {
  from?: string;
  to?: string;
  category: "ALL" | "SERVICE_PARTS" | "SALES_ENQUIRY";
}): Promise<ReceiptRegisterResponse> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  query.set("category", params.category);
  return apiGet(`${API_ROUTES.finance.receiptRegister}?${query.toString()}`);
}

export async function updateReceiptRequest(id: string, payload: { amount?: number; narration?: string }) {
  return apiPatch(`${API_ROUTES.finance.receipts}/${id}`, payload);
}

export async function cancelReceiptRequest(id: string, remark: string) {
  return apiPatch(`${API_ROUTES.finance.receipts}/${id}/cancel`, { remark });
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
