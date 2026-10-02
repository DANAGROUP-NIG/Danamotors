import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  CreateVehiclePayload,
  UpdateVehiclePayload,
  Vehicle,
  VehicleListResponse,
} from "../types/vehicle.types";

export async function getVehiclesRequest(params?: {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
  customerId?: string;
}): Promise<VehicleListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", params.branchId);
  if (params?.customerId) query.set("customerId", params.customerId);
  const qs = query.toString();
  return apiGet<VehicleListResponse>(
    `${API_ROUTES.vehicles.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getVehicleRequest(id: string): Promise<{ vehicle: Vehicle }> {
  return apiGet<{ vehicle: Vehicle }>(API_ROUTES.vehicles.detail(id));
}

export async function createVehicleRequest(
  payload: CreateVehiclePayload,
): Promise<{ vehicle: Vehicle }> {
  return apiPost<{ vehicle: Vehicle }, CreateVehiclePayload>(
    API_ROUTES.vehicles.base,
    Object.fromEntries(Object.entries(payload).filter(([key]) => !["make", "model", "trim", "warrantyProvider", "warrantyStatus", "warrantyExpiresAt"].includes(key)).map(([key, value]) => [key, ["pdiDate", "saleDate"].includes(key) ? (value ? new Date(String(value)).toISOString() : null) : key === "customerId" ? value || null : value])) as CreateVehiclePayload,
  );
}

export async function updateVehicleRequest(
  id: string,
  payload: UpdateVehiclePayload,
): Promise<{ vehicle: Vehicle }> {
  return apiPut<{ vehicle: Vehicle }, UpdateVehiclePayload>(
    API_ROUTES.vehicles.detail(id),
    Object.fromEntries(Object.entries(payload).filter(([key]) => !["vin", "customerId", "make", "model", "trim", "warrantyProvider", "warrantyStatus", "warrantyExpiresAt"].includes(key)).map(([key, value]) => [key, ["pdiDate", "saleDate"].includes(key) ? (value ? new Date(String(value)).toISOString() : null) : value])) as UpdateVehiclePayload,
  );
}

export async function deleteVehicleRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.vehicles.detail(id));
}
