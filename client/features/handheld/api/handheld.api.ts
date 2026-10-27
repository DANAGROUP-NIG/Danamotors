import { apiGet, apiPatch } from "@/lib/api/apiClient";
import type { HandheldDocument, HandheldSourceFilter } from "../types/handheld.types";

const BASE = "/handheld/documents";

export const handheldKeys = {
  all: ["handheld"] as const,
  forSource: (filter: HandheldSourceFilter) => [...handheldKeys.all, "source", filter] as const,
};

export async function getHandheldDocumentsRequest(filter: HandheldSourceFilter) {
  const q = new URLSearchParams(filter as Record<string, string>);
  const data = await apiGet<{ documents: HandheldDocument[] }>(`${BASE}?${q.toString()}`);
  return data.documents;
}

export async function cancelHandheldDocumentRequest(id: string, remark: string) {
  const data = await apiPatch<{ document: HandheldDocument }>(`${BASE}/${id}/cancel`, { remark });
  return data.document;
}
