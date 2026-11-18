import { apiGet, apiPost } from "@/lib/api/apiClient";
import type { PartSearchResult } from "@/features/stock-transfers/types/indent.types";
import type { LabelPart, LabelPrinter, LabelPrintJob } from "../types/labels.types";

const qs = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const labelKeys = {
  all: ["labels"] as const,
  parts: (search: string, branchId?: string) => [...labelKeys.all, "parts", search, branchId ?? "mine"] as const,
  printers: (branchId?: string) => [...labelKeys.all, "printers", branchId ?? "mine"] as const,
  jobs: (branchId?: string) => [...labelKeys.all, "jobs", branchId ?? "mine"] as const,
};

/** Typed for the shared PartPicker, which shows the bin and stock through its renderMeta. */
export async function searchLabelPartsRequest(search: string, branchId?: string) {
  return (await apiGet<{ parts: (LabelPart & PartSearchResult)[] }>(`/labels/parts${qs({ search, branchId })}`)).parts;
}

export async function getLabelPrintersRequest(branchId?: string) {
  return (await apiGet<{ printers: LabelPrinter[] }>(`/labels/printers${qs({ branchId })}`)).printers;
}

export async function getLabelJobsRequest(branchId?: string) {
  return (await apiGet<{ jobs: LabelPrintJob[] }>(`/labels/jobs${qs({ branchId })}`)).jobs;
}

export async function printLabelsRequest(body: { branchId?: string; labels: { partId: string; copies: number }[] }) {
  return apiPost<{ job: LabelPrintJob; printers: LabelPrinter[] }>("/labels/jobs", body);
}

export async function retryLabelJobRequest(id: string) {
  return (await apiPost<{ job: LabelPrintJob }>(`/labels/jobs/${id}/retry`, {})).job;
}

export async function cancelLabelJobRequest(id: string) {
  return (await apiPost<{ job: LabelPrintJob }>(`/labels/jobs/${id}/cancel`, {})).job;
}
