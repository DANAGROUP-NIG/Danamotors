import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  CreateVehiclePayload,
  UpdateVehiclePayload,
  Vehicle,
  VehicleListResponse,
} from "../types/vehicle.types";

export async function getVehiclesRequest(params?: {
  page?: number;
  pageSize?: number;
  customerId?: string;
}): Promise<VehicleListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.customerId) query.set("customerId", params.customerId);
  const qs = query.toString();
  return apiGet<VehicleListResponse>(
    `${API_ROUTES.vehicles.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getVehicleRequest(id: string): Promise<Vehicle> {
  return apiGet<Vehicle>(API_ROUTES.vehicles.detail(id));
}

export async function createVehicleRequest(
  payload: CreateVehiclePayload,
): Promise<Vehicle> {
  return apiPost<Vehicle, CreateVehiclePayload>(
    API_ROUTES.vehicles.base,
    payload,
  );
}

export async function updateVehicleRequest(
  id: string,
  payload: UpdateVehiclePayload,
): Promise<Vehicle> {
  return apiPatch<Vehicle, UpdateVehiclePayload>(
    API_ROUTES.vehicles.detail(id),
    payload,
  );
}

export async function deleteVehicleRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.vehicles.detail(id));
}
