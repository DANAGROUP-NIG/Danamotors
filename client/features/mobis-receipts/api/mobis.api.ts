import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import type {
  CreateMrnPayload,
  ImportMitPayload,
  MitStatus,
  MobisMit,
  MobisMitListItem,
  PartMatch,
} from "../types/mobis.types";

const BASE = "/inventory/mobis/mit";

export const mobisKeys = {
  all: ["mobis-mit"] as const,
  list: (params: Record<string, unknown>) => [...mobisKeys.all, "list", params] as const,
  detail: (id: string) => [...mobisKeys.all, "detail", id] as const,
};

export async function getMobisMitsRequest(params: { status?: MitStatus; search?: string } = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  const data = await apiGet<{ mits: MobisMitListItem[] }>(`${BASE}${qs ? `?${qs}` : ""}`);
  return data.mits;
}

export async function getMobisMitRequest(id: string) {
  const data = await apiGet<{ mit: MobisMit }>(`${BASE}/${id}`);
  return data.mit;
}

export async function matchPartsRequest(partNumbers: string[]) {
  const data = await apiPost<{ matches: PartMatch[] }>(`${BASE}/match-parts`, { partNumbers });
  return data.matches;
}

export async function importMitRequest(payload: ImportMitPayload) {
  const data = await apiPost<{ mit: MobisMit }>(BASE, payload);
  return data.mit;
}

export async function createMrnRequest(id: string, payload: CreateMrnPayload) {
  const data = await apiPost<{ mit: MobisMit }>(`${BASE}/${id}/mrn`, payload);
  return data.mit;
}

export async function cancelMitRequest(id: string, reason?: string) {
  const data = await apiPatch<{ mit: MobisMit }>(`${BASE}/${id}/cancel`, { reason });
  return data.mit;
}
