import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import type {
  CounterSale,
  CounterSaleListItem,
  CreateCounterSalePayload,
  CreateOrderPayload,
  CreateReturnPayload,
  CustomerOrder,
  CustomerOrderListItem,
  CustomerOrderStatus,
  CustomerSearchResult,
  SaleReturnListItem,
} from "../types/part-sale.types";

const BASE = "/part-sale";

export const partSaleKeys = {
  all: ["part-sale"] as const,
  orders: (params: Record<string, unknown>) => [...partSaleKeys.all, "orders", params] as const,
  order: (id: string) => [...partSaleKeys.all, "order", id] as const,
  sales: (params: Record<string, unknown>) => [...partSaleKeys.all, "sales", params] as const,
  sale: (id: string) => [...partSaleKeys.all, "sale", id] as const,
  returns: (params: Record<string, unknown>) => [...partSaleKeys.all, "returns", params] as const,
  customers: (search: string) => [...partSaleKeys.all, "customers", search] as const,
  parts: (search: string, branchId: string) => [...partSaleKeys.all, "parts", search, branchId] as const,
};

function qs(params: Record<string, string | boolean | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== false) query.set(key, String(value));
  }
  const s = query.toString();
  return s ? `?${s}` : "";
}

export async function searchSaleCustomersRequest(search: string) {
  return (await apiGet<{ customers: CustomerSearchResult[] }>(`${BASE}/customers${qs({ search })}`)).customers;
}

export async function searchSalePartsRequest(search: string, branchId: string) {
  return (await apiGet<{ parts: PartSearchResult[] }>(`${BASE}/parts${qs({ search, branchId })}`)).parts;
}

export type OrderFilters = { status?: CustomerOrderStatus; customerId?: string; billable?: boolean; search?: string };

export async function getOrdersRequest(params: OrderFilters = {}) {
  return (await apiGet<{ orders: CustomerOrderListItem[] }>(`${BASE}/orders${qs(params)}`)).orders;
}

export async function getOrderRequest(id: string) {
  return (await apiGet<{ order: CustomerOrder }>(`${BASE}/orders/${id}`)).order;
}

export async function createOrderRequest(payload: CreateOrderPayload) {
  return (await apiPost<{ order: CustomerOrder }>(`${BASE}/orders`, payload)).order;
}

export async function pickOrderRequest(id: string, lines?: { lineId: string; quantity: number }[]) {
  return apiPatch<{ order: CustomerOrder; picked: number; short: number }>(`${BASE}/orders/${id}/pick`, { lines });
}

export async function releaseOrderRequest(id: string) {
  return (await apiPatch<{ order: CustomerOrder }>(`${BASE}/orders/${id}/release`)).order;
}

export async function cancelOrderRequest(id: string, remark: string) {
  return (await apiPatch<{ order: CustomerOrder }>(`${BASE}/orders/${id}/cancel`, { remark })).order;
}

export async function getCounterSalesRequest(params: { customerId?: string; search?: string } = {}) {
  return (await apiGet<{ sales: CounterSaleListItem[] }>(`${BASE}/counter-sales${qs(params)}`)).sales;
}

export async function getCounterSaleRequest(id: string) {
  return (await apiGet<{ sale: CounterSale }>(`${BASE}/counter-sales/${id}`)).sale;
}

export async function createCounterSaleRequest(payload: CreateCounterSalePayload) {
  return (await apiPost<{ sale: CounterSale }>(`${BASE}/counter-sales`, payload)).sale;
}

export async function cancelCounterSaleRequest(id: string, remark: string) {
  return (await apiPatch<{ sale: CounterSale }>(`${BASE}/counter-sales/${id}/cancel`, { remark })).sale;
}

export async function createReturnRequest(id: string, payload: CreateReturnPayload) {
  return (await apiPost<{ sale: CounterSale }>(`${BASE}/counter-sales/${id}/returns`, payload)).sale;
}

export async function getReturnsRequest(params: { search?: string } = {}) {
  return (await apiGet<{ returns: SaleReturnListItem[] }>(`${BASE}/returns${qs(params)}`)).returns;
}
