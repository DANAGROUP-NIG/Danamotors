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
  list: (search: string, branchId?: string) => [...vendorReceiptKeys.all, "list", search, branchId ?? "all"] as const,
  detail: (id: string) => [...vendorReceiptKeys.all, "detail", id] as const,
  vendors: (search: string) => [...vendorReceiptKeys.all, "vendors", search] as const,
  parts: (branchId: string, search: string) => [...vendorReceiptKeys.all, "parts", branchId, search] as const,
};

/** `branchId` narrows the list for cross-branch users; the server keeps everyone else to their own branch. */
export async function getVendorReceiptsRequest(search?: string, branchId?: string) {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  if (branchId) q.set("branchId", branchId);
  const qs = q.toString();
  const data = await apiGet<{ receipts: VendorReceiptListItem[] }>(`${BASE}${qs ? `?${qs}` : ""}`);
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
