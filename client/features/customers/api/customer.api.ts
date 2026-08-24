import { apiDelete, apiGet, apiPut, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  CreateCustomerPayload,
  Customer,
  CustomerListResponse,
  UpdateCustomerPayload,
} from "../types/customer.types";

export async function getCustomersRequest(params?: {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
}): Promise<CustomerListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", params.branchId);
  const qs = query.toString();
  return apiGet<CustomerListResponse>(
    `${API_ROUTES.customers.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getCustomerRequest(id: string): Promise<Customer> {
  const data = await apiGet<{ customer: Customer }>(
    API_ROUTES.customers.detail(id),
  );
  return data.customer;
}

export async function createCustomerRequest(
  payload: CreateCustomerPayload,
): Promise<Customer> {
  return apiPost<Customer, CreateCustomerPayload>(
    API_ROUTES.customers.base,
    payload,
  );
}

export async function updateCustomerRequest(
  id: string,
  payload: UpdateCustomerPayload,
): Promise<Customer> {
  return apiPut<Customer, UpdateCustomerPayload>(
    API_ROUTES.customers.detail(id),
    payload,
  );
}

export async function deleteCustomerRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.customers.detail(id));
}

export async function manageCustomerAccountRequest(
  id: string,
  payload: { password: string; isActive?: boolean },
): Promise<{ account: NonNullable<Customer["account"]> }> {
  const result = await apiPost<{ account: NonNullable<Customer["account"]> }>(
    API_ROUTES.customers.account(id),
    { password: payload.password, isActive: payload.isActive },
  );
  return result;
}
