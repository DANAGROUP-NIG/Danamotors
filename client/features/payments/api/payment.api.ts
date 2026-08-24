import { apiGet, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type { Payment, PaymentListResponse } from "../types/payment.types";

export async function getPaymentsRequest(params?: {
  branchId?: string;
}): Promise<PaymentListResponse> {
  const query = new URLSearchParams();
  if (params?.branchId) query.set("branchId", params.branchId);
  const qs = query.toString();
  return apiGet<PaymentListResponse>(
    `${API_ROUTES.finance.payments.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getPaymentRequest(id: string): Promise<Payment> {
  return apiGet<Payment>(API_ROUTES.finance.payments.detail(id));
}

export type CreatePaymentPayload = {
  invoiceId: string;
  amount: number;
  method: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
};

export async function createPaymentRequest(
  payload: CreatePaymentPayload,
): Promise<Payment> {
  const result = await apiPost<{ payment: Payment }>(
    API_ROUTES.finance.payments.base,
    payload,
  );
  return result.payment;
}
