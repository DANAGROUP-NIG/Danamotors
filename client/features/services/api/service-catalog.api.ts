import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  CreateServicePayload,
  ServiceItem,
  ServiceListResponse,
  UpdateServicePayload,
} from "../types/service-catalog.types";

export async function getServicesRequest(params?: {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  isActive?: boolean;
}): Promise<ServiceListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.category) query.set("category", params.category);
  if (params?.isActive !== undefined)
    query.set("isActive", String(params.isActive));
  const qs = query.toString();
  return apiGet<ServiceListResponse>(
    `${API_ROUTES.services.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getServiceRequest(
  id: string,
): Promise<{ service: ServiceItem }> {
  return apiGet<{ service: ServiceItem }>(API_ROUTES.services.detail(id));
}

export async function createServiceRequest(
  payload: CreateServicePayload,
): Promise<{ service: ServiceItem }> {
  return apiPost<{ service: ServiceItem }, CreateServicePayload>(
    API_ROUTES.services.base,
    payload,
  );
}

export async function updateServiceRequest(
  id: string,
  payload: UpdateServicePayload,
): Promise<{ service: ServiceItem }> {
  return apiPut<{ service: ServiceItem }, UpdateServicePayload>(
    API_ROUTES.services.detail(id),
    payload,
  );
}

export async function deleteServiceRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.services.detail(id));
}
