import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  CreateCustomerPayload,
  Customer,
  CustomerListResponse,
  UpdateCustomerPayload,
} from "../types/customer.types";

export async function getCustomersRequest(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<CustomerListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiGet<CustomerListResponse>(
    `${API_ROUTES.customers.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getCustomerRequest(id: string): Promise<Customer> {
  return apiGet<Customer>(API_ROUTES.customers.detail(id));
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
  return apiPatch<Customer, UpdateCustomerPayload>(
    API_ROUTES.customers.detail(id),
    payload,
  );
}

export async function deleteCustomerRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.customers.detail(id));
}
