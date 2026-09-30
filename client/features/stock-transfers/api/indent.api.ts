import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import type {
  ApproveIndentPayload,
  CreateIndentPayload,
  DispatchIndentPayload,
  Indent,
  IndentListResponse,
  IndentStatus,
  PartLookup,
  PartSearchResult,
  ReceiveIndentPayload,
} from "../types/indent.types";

const BASE = "/inventory/indents";

function qs(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const s = query.toString();
  return s ? `?${s}` : "";
}

export type IndentListParams = {
  status?: IndentStatus;
  requestingBranchId?: string;
  sourceBranchId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export function getIndentsRequest(params: IndentListParams = {}) {
  return apiGet<IndentListResponse>(`${BASE}${qs(params)}`);
}

export async function getIndentRequest(id: string) {
  const data = await apiGet<{ indent: Indent }>(`${BASE}/${id}`);
  return data.indent;
}

export async function searchIndentPartsRequest(params: {
  search: string;
  requestingBranchId?: string;
  sourceBranchId?: string;
}) {
  const data = await apiGet<{ parts: PartSearchResult[] }>(`${BASE}/part-search${qs(params)}`);
  return data.parts;
}

export function lookupIndentPartRequest(params: {
  partId: string;
  requestingBranchId?: string;
  sourceBranchId?: string;
}) {
  return apiGet<PartLookup>(`${BASE}/part-lookup${qs(params)}`);
}

export async function createIndentRequest(payload: CreateIndentPayload) {
  const data = await apiPost<{ indent: Indent }>(BASE, payload);
  return data.indent;
}

async function action<B>(id: string, verb: string, body?: B) {
  const data = await apiPatch<{ indent: Indent }>(`${BASE}/${id}/${verb}`, body ?? {});
  return data.indent;
}

export const submitIndentRequest = (id: string) => action(id, "submit");
export const approveIndentRequest = (id: string, body: ApproveIndentPayload) => action(id, "approve", body);
export const pickIndentRequest = (id: string) => action(id, "pick");
export const rejectIndentRequest = (id: string, reason: string) => action(id, "reject", { reason });
export const cancelIndentRequest = (id: string, reason?: string) => action(id, "cancel", { reason });
export const dispatchIndentRequest = (id: string, body: DispatchIndentPayload) => action(id, "dispatch", body);
export const receiveIndentRequest = (id: string, body: ReceiveIndentPayload) => action(id, "receive", body);
