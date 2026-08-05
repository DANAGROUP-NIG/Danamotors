import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  InventoryItem,
  SparePartPayload,
  UpdateSparePartPayload,
  BranchStockItem,
  BranchStockListResponse,
} from "../types/inventory.types";

export async function getInventoryRequest(params?: {
  page?: number;
  pageSize?: number;
  category?: string;
}): Promise<{ spareParts: InventoryItem[] }> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.category) query.set("category", params.category);
  const qs = query.toString();
  return apiGet<{ spareParts: InventoryItem[] }>(
    `${API_ROUTES.inventory.parts.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getInventoryItemRequest(
  id: string,
): Promise<InventoryItem> {
  const data = await apiGet<{ sparePart: InventoryItem }>(
    API_ROUTES.inventory.parts.detail(id),
  );
  return data.sparePart;
}

export async function createInventoryItemRequest(
  payload: SparePartPayload,
): Promise<InventoryItem> {
  const data = await apiPost<{ sparePart: InventoryItem }, SparePartPayload>(
    API_ROUTES.inventory.parts.base,
    payload,
  );
  return data.sparePart;
}

export async function updateInventoryItemRequest(
  id: string,
  payload: UpdateSparePartPayload,
): Promise<InventoryItem> {
  const data = await apiPatch<{ sparePart: InventoryItem }, UpdateSparePartPayload>(
    API_ROUTES.inventory.parts.detail(id),
    payload,
  );
  return data.sparePart;
}

export async function deleteInventoryItemRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.inventory.parts.detail(id));
}

// ── Branch Stock ──────────────────────────────────────────────────────────

export async function getBranchStockRequest(
  branchId: string,
): Promise<BranchStockItem[]> {
  const data = await apiGet<BranchStockListResponse>(
    API_ROUTES.inventory.stock.byBranch(branchId),
  );
  return data.stockItems;
}
