import { apiGet, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  AdjustCreditPayload,
  CreateCreditApplicationPayload,
  CreditApplication,
  CustomerCredit,
} from "../types/credit.types";

export async function getCustomerCreditRequest(
  customerId: string,
): Promise<CustomerCredit> {
  const result = await apiGet<{ credit: CustomerCredit }>(
    API_ROUTES.credit.customerCredit(customerId),
  );
  return result.credit;
}

export async function adjustCustomerCreditRequest(
  customerId: string,
  payload: AdjustCreditPayload,
): Promise<void> {
  await apiPost<void, AdjustCreditPayload>(
    API_ROUTES.credit.customerCredit(customerId),
    payload,
  );
}

export async function getCreditApplicationsRequest(params?: {
  status?: string;
  branchId?: string;
}): Promise<CreditApplication[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.branchId) query.set("branchId", params.branchId);
  const qs = query.toString();
  const result = await apiGet<{ applications: CreditApplication[] }>(
    `${API_ROUTES.credit.applications.base}${qs ? `?${qs}` : ""}`,
  );
  return result.applications;
}

export async function createCreditApplicationRequest(
  payload: CreateCreditApplicationPayload,
): Promise<CreditApplication> {
  const result = await apiPost<{ application: CreditApplication }>(
    API_ROUTES.credit.applications.base,
    payload,
  );
  return result.application;
}
