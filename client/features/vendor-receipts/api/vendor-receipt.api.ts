import { apiGet, apiPost } from "@/lib/api/apiClient";
import type {
  CreateVendorReceiptPayload,
  ReceivablePart,
  Vendor,
  VendorReceipt,
  VendorReceiptListItem,
} from "../types/vendor-receipt.types";

const BASE = "/inventory/vendor-receipts";

export const vendorReceiptKeys = {
  all: ["vendor-receipts"] as const,
  list: (search: string) => [...vendorReceiptKeys.all, "list", search] as const,
  detail: (id: string) => [...vendorReceiptKeys.all, "detail", id] as const,
  vendors: (search: string) => [...vendorReceiptKeys.all, "vendors", search] as const,
  parts: (branchId: string, search: string) => [...vendorReceiptKeys.all, "parts", branchId, search] as const,
};

export async function getVendorReceiptsRequest(search?: string) {
  const data = await apiGet<{ receipts: VendorReceiptListItem[] }>(`${BASE}${search ? `?search=${encodeURIComponent(search)}` : ""}`);
  return data.receipts;
}

export async function getVendorReceiptRequest(id: string) {
  const data = await apiGet<{ receipt: VendorReceipt }>(`${BASE}/${id}`);
  return data.receipt;
}

export async function searchVendorsRequest(search: string) {
  const data = await apiGet<{ vendors: Vendor[] }>(`${BASE}/vendors?search=${encodeURIComponent(search)}`);
  return data.vendors;
}

export async function searchReceivablePartsRequest(branchId: string, search: string) {
  const q = new URLSearchParams({ branchId, search });
  const data = await apiGet<{ parts: ReceivablePart[] }>(`${BASE}/parts?${q}`);
  return data.parts;
}

export async function createVendorReceiptRequest(payload: CreateVendorReceiptPayload) {
  const data = await apiPost<{ receipt: VendorReceipt }>(BASE, payload);
  return data.receipt;
}
