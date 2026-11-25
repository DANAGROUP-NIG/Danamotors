import { apiGet, apiPost } from "@/lib/api/apiClient";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import type { CustomerSearchResult } from "@/features/part-sale/types/part-sale.types";
import type {
  Challan,
  ChallanFilters,
  ChallanListItem,
  ChallanReturnListItem,
  CreateChallanPayload,
  CreateChallanReturnPayload,
} from "../types/challan.types";

const BASE = "/dispatch-challans";

export const challanKeys = {
  all: ["dispatch-challans"] as const,
  list: (params: ChallanFilters) => [...challanKeys.all, "list", params] as const,
  detail: (id: string) => [...challanKeys.all, "detail", id] as const,
  returns: (params: ChallanFilters) => [...challanKeys.all, "returns", params] as const,
  costCentres: (search: string) => [...challanKeys.all, "cost-centres", search] as const,
  parts: (search: string, branchId: string) => [...challanKeys.all, "parts", search, branchId] as const,
};

function qs(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const s = query.toString();
  return s ? `?${s}` : "";
}

export async function getChallansRequest(params: ChallanFilters) {
  return (await apiGet<{ challans: ChallanListItem[] }>(`${BASE}${qs(params)}`)).challans;
}

export async function getChallanRequest(id: string) {
  return (await apiGet<{ challan: Challan }>(`${BASE}/${id}`)).challan;
}

export async function getChallanReturnsRequest(params: ChallanFilters) {
  return (await apiGet<{ returns: ChallanReturnListItem[] }>(`${BASE}/returns${qs(params)}`)).returns;
}

export async function createChallanRequest(payload: CreateChallanPayload) {
  return (await apiPost<{ challan: Challan }>(BASE, payload)).challan;
}

export async function createChallanReturnRequest(id: string, payload: CreateChallanReturnPayload) {
  return (await apiPost<{ challan: Challan }>(`${BASE}/${id}/returns`, payload)).challan;
}

export async function searchCostCentresRequest(search: string) {
  return (await apiGet<{ customers: CustomerSearchResult[] }>(`${BASE}/cost-centres${qs({ search })}`)).customers;
}

export async function searchChallanPartsRequest(search: string, branchId: string) {
  return (await apiGet<{ parts: PartSearchResult[] }>(`${BASE}/parts${qs({ search, branchId })}`)).parts;
}
