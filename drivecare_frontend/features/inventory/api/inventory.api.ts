import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  CreateInventoryItemPayload,
  InventoryItem,
  InventoryListResponse,
  UpdateInventoryItemPayload,
} from "../types/inventory.types";

export async function getInventoryRequest(params?: {
  page?: number;
  pageSize?: number;
  category?: string;
}): Promise<InventoryListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.category) query.set("category", params.category);
  const qs = query.toString();
  return apiGet<InventoryListResponse>(
    `${API_ROUTES.inventory.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getInventoryItemRequest(
  id: string,
): Promise<InventoryItem> {
  return apiGet<InventoryItem>(API_ROUTES.inventory.detail(id));
}

export async function createInventoryItemRequest(
  payload: CreateInventoryItemPayload,
): Promise<InventoryItem> {
  return apiPost<InventoryItem, CreateInventoryItemPayload>(
    API_ROUTES.inventory.base,
    payload,
  );
}

export async function updateInventoryItemRequest(
  id: string,
  payload: UpdateInventoryItemPayload,
): Promise<InventoryItem> {
  return apiPatch<InventoryItem, UpdateInventoryItemPayload>(
    API_ROUTES.inventory.detail(id),
    payload,
  );
}

export async function deleteInventoryItemRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.inventory.detail(id));
}
