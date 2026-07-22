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
}): Promise<VehicleListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", params.branchId);
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
    payload,
  );
}

export async function updateVehicleRequest(
  id: string,
  payload: UpdateVehiclePayload,
): Promise<{ vehicle: Vehicle }> {
  return apiPut<{ vehicle: Vehicle }, UpdateVehiclePayload>(
    API_ROUTES.vehicles.detail(id),
    payload,
  );
}

export async function deleteVehicleRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.vehicles.detail(id));
}
