import { apiGet, apiPost, apiPatch } from "@/lib/api/apiClient";
import type { Transfer, TransferListResponse } from "../types/transfer.types";

const BASE = "/inventory/transfers";

export async function getTransfersRequest(params?: {
  status?: string;
  requestingBranchId?: string;
  sourceBranchId?: string;
}): Promise<TransferListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.requestingBranchId) query.set("requestingBranchId", params.requestingBranchId);
  if (params?.sourceBranchId) query.set("sourceBranchId", params.sourceBranchId);
  const qs = query.toString();
  return apiGet<TransferListResponse>(`${BASE}${qs ? `?${qs}` : ""}`);
}

export async function getTransferRequest(id: string): Promise<Transfer> {
  const data = await apiGet<{ transfer: Transfer }>(`${BASE}/${id}`);
  return data.transfer;
}

export async function createTransferRequest(payload: {
  requestingBranchId: string;
  sourceBranchId: string;
  notes?: string;
  items: { partId: string; requestedQuantity: number }[];
}): Promise<Transfer> {
  const data = await apiPost<{ transfer: Transfer }>(BASE, payload);
  return data.transfer;
}

export async function approveTransferRequest(id: string): Promise<Transfer> {
  const data = await apiPatch<{ transfer: Transfer }>(`${BASE}/${id}/approve`);
  return data.transfer;
}

export async function dispatchTransferRequest(
  id: string,
  items?: { id: string; dispatchedQuantity: number }[],
): Promise<Transfer> {
  const data = await apiPatch<{ transfer: Transfer }>(`${BASE}/${id}/dispatch`, { items });
  return data.transfer;
}

export async function receiveTransferRequest(
  id: string,
  items?: { id: string; receivedQuantity: number }[],
): Promise<Transfer> {
  const data = await apiPatch<{ transfer: Transfer }>(`${BASE}/${id}/receive`, { items });
  return data.transfer;
}

export async function rejectTransferRequest(id: string, notes?: string): Promise<Transfer> {
  const data = await apiPatch<{ transfer: Transfer }>(`${BASE}/${id}/reject`, { notes });
  return data.transfer;
}

export async function cancelTransferRequest(id: string): Promise<Transfer> {
  const data = await apiPatch<{ transfer: Transfer }>(`${BASE}/${id}/cancel`);
  return data.transfer;
}
