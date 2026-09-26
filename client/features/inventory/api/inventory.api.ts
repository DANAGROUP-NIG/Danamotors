import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  AlternatePartPayload,
  BranchStockItem,
  BranchStockListResponse,
  PartListParams,
  PartListResponse,
  PartMaster,
  PartMasterPayload,
  PartStockItem,
  UpdatePartMasterPayload,
} from "../types/inventory.types";

/** The list returns `unitPrice`, the detail returns `unitRate`. Expose one name. */
type RawPart = Omit<PartMaster, "unitRate"> & { unitRate?: number; unitPrice?: number };
export function normalizePart(raw: RawPart): PartMaster {
  const { unitPrice, unitRate, ...rest } = raw;
  return { ...rest, unitRate: unitRate ?? unitPrice ?? 0 };
}

function qs(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const s = query.toString();
  return s ? `?${s}` : "";
}

// ── Part Master ─────────────────────────────────────────────────────────────

export async function getPartsRequest(params: PartListParams = {}): Promise<PartListResponse> {
  const data = await apiGet<Omit<PartListResponse, "items"> & { items: RawPart[] }>(
    `${API_ROUTES.inventory.parts.base}${qs(params)}`,
  );
  return { ...data, items: data.items.map(normalizePart) };
}

export async function getPartRequest(id: string): Promise<PartMaster> {
  const data = await apiGet<{ part: RawPart }>(API_ROUTES.inventory.parts.detail(id));
  return normalizePart(data.part);
}

export async function createPartRequest(payload: PartMasterPayload): Promise<PartMaster> {
  const data = await apiPost<{ part: RawPart }, PartMasterPayload>(API_ROUTES.inventory.parts.base, payload);
  return normalizePart(data.part);
}

export async function updatePartRequest(id: string, payload: UpdatePartMasterPayload): Promise<PartMaster> {
  const data = await apiPut<{ part: RawPart }, UpdatePartMasterPayload>(
    API_ROUTES.inventory.parts.detail(id),
    payload,
  );
  return normalizePart(data.part);
}

export async function deletePartRequest(id: string): Promise<void> {
  await apiDelete<void>(API_ROUTES.inventory.parts.detail(id));
}

export async function getAlternatesRequest(mainPartId: string): Promise<PartMaster[]> {
  // The backend names this list `part`.
  const data = await apiGet<{ part: RawPart[] }>(API_ROUTES.inventory.parts.alternates(mainPartId));
  return data.part.map(normalizePart);
}

export async function createAlternateRequest(mainPartId: string, payload: AlternatePartPayload): Promise<PartMaster> {
  const data = await apiPost<{ alternatePart: RawPart }, AlternatePartPayload>(
    API_ROUTES.inventory.parts.alternates(mainPartId),
    payload,
  );
  return normalizePart(data.alternatePart);
}

// ── Stock ───────────────────────────────────────────────────────────────────

export async function getBranchStockRequest(branchId: string): Promise<BranchStockItem[]> {
  const data = await apiGet<BranchStockListResponse>(API_ROUTES.inventory.stock.byBranch(branchId));
  return data.stockItems;
}

/** Stock for one part at every branch the user may see. */
export async function getPartStockRequest(partId: string): Promise<PartStockItem[]> {
  const data = await apiGet<{ stockItems: PartStockItem[] }>(`${API_ROUTES.inventory.stock.base}${qs({ partId })}`);
  return data.stockItems;
}

export async function adjustStockRequest(payload: {
  branchId: string;
  partId: string;
  quantity: number;
  type: string;
  notes?: string;
}) {
  return apiPost<unknown>(API_ROUTES.inventory.stock.adjust, payload);
}
