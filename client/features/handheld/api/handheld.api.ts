import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import type {
  HandheldDevice,
  HandheldDocument,
  HandheldDocumentType,
  HandheldOverview,
  HandheldPicker,
  HandheldShortReason,
  HandheldSource,
  HandheldSourceFilter,
  HandheldStation,
  StationState,
} from "../types/handheld.types";

const BASE = "/handheld/documents";

export const handheldKeys = {
  all: ["handheld"] as const,
  forSource: (filter: HandheldSourceFilter) => [...handheldKeys.all, "source", filter] as const,
  stationState: (branchId: string) => [...handheldKeys.all, "station-state", branchId] as const,
  pickers: (branchId: string) => [...handheldKeys.all, "pickers", branchId] as const,
  overview: (branchId?: string) => [...handheldKeys.all, "overview", branchId ?? "mine"] as const,
  sources: (type: HandheldDocumentType) => [...handheldKeys.all, "sources", type] as const,
};

export async function getHandheldSourcesRequest(type: HandheldDocumentType) {
  return (await apiGet<{ sources: HandheldSource[] }>(`/handheld/sources?type=${type}`)).sources;
}

export async function getHandheldDocumentsRequest(filter: HandheldSourceFilter) {
  const q = new URLSearchParams(filter as Record<string, string>);
  const data = await apiGet<{ documents: HandheldDocument[] }>(`${BASE}?${q.toString()}`);
  return data.documents;
}

export async function createHandheldDocumentRequest(body: { type: HandheldDocumentType; sourceId: string; pickerId?: string; checkerId?: string }) {
  const data = await apiPost<{ document: HandheldDocument }>(BASE, body);
  return data.document;
}

export async function postHandheldDocumentRequest(id: string, body: { unreportedReason?: HandheldShortReason; uncounted?: "ZERO" | "RELEASE" }) {
  const data = await apiPost<{ document: HandheldDocument }>(`${BASE}/${id}/post`, body);
  return data.document;
}

export async function cancelHandheldDocumentRequest(id: string, remark: string) {
  const data = await apiPatch<{ document: HandheldDocument }>(`${BASE}/${id}/cancel`, { remark });
  return data.document;
}

export async function getHandheldPickersRequest(branchId: string) {
  return (await apiGet<{ pickers: HandheldPicker[] }>(`/handheld/pickers?branchId=${branchId}`)).pickers;
}

export async function getStationStateRequest(branchId: string) {
  return apiGet<StationState>(`/handheld/stations/status?branchId=${branchId}`);
}

export async function getHandheldOverviewRequest(branchId?: string) {
  return apiGet<HandheldOverview>(`/handheld/stations${branchId ? `?branchId=${branchId}` : ""}`);
}

export async function createStationRequest(body: { branchId: string; name: string }) {
  return apiPost<{ station: HandheldStation; key: string }>("/handheld/stations", body);
}

export async function rotateStationKeyRequest(id: string) {
  return apiPost<{ station: HandheldStation; key: string }>(`/handheld/stations/${id}/rotate-key`);
}

export async function revokeStationRequest(id: string) {
  return (await apiPatch<{ station: HandheldStation }>(`/handheld/stations/${id}/revoke`)).station;
}

export async function renameDeviceRequest(id: string, name: string) {
  return (await apiPatch<{ device: HandheldDevice }>(`/handheld/devices/${id}`, { name })).device;
}
