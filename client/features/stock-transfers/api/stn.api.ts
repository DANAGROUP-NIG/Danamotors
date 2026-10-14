import { apiGet, apiPost } from "@/lib/api/apiClient";
import type {
  DirectStnPayload,
  DispatchStnPayload,
  ReceiveIndentPayload,
  StnDetail,
  StnListItem,
} from "../types/indent.types";

const BASE = "/inventory/stn";

export const stnKeys = {
  all: ["stns"] as const,
  list: (params: Record<string, unknown>) => [...stnKeys.all, "list", params] as const,
  detail: (id: string) => [...stnKeys.all, "detail", id] as const,
};

export async function getStnsRequest(params: { status?: StnListItem["status"] } = {}) {
  const qs = params.status ? `?status=${params.status}` : "";
  return (await apiGet<{ stns: StnListItem[] }>(`${BASE}${qs}`)).stns;
}

export async function getStnRequest(id: string) {
  return (await apiGet<{ stn: StnDetail }>(`${BASE}/${id}`)).stn;
}

/** One STN for the picked indents of one branch. */
export async function dispatchStnRequest(payload: DispatchStnPayload) {
  return (await apiPost<{ stn: StnDetail }>(`${BASE}/dispatch`, payload)).stn;
}

/** Free stock sent without an indent. */
export async function directStnRequest(payload: DirectStnPayload) {
  return (await apiPost<{ stn: StnDetail }>(`${BASE}/direct`, payload)).stn;
}

export async function receiveStnRequest(id: string, payload: ReceiveIndentPayload) {
  return (await apiPost<{ stn: StnDetail }>(`${BASE}/${id}/receive`, payload)).stn;
}
