import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import type { JobCardLine, JobCardLines, LabourLinePayload, UpdateLinePayload } from "../types/job-card-line.types";

export const getJobCardLinesRequest = (jobCardId: string) => apiGet<JobCardLines>(`/service/job-cards/${jobCardId}/lines`);

export async function addLabourLineRequest(jobCardId: string, body: LabourLinePayload) {
  return (await apiPost<{ line: JobCardLine }>(`/service/job-cards/${jobCardId}/lines`, body)).line;
}

export async function updateJobCardLineRequest(jobCardId: string, lineId: string, body: UpdateLinePayload) {
  return (await apiPatch<{ line: JobCardLine }>(`/service/job-cards/${jobCardId}/lines/${lineId}`, body)).line;
}

export const deleteJobCardLineRequest = (jobCardId: string, lineId: string) =>
  apiDelete<null>(`/service/job-cards/${jobCardId}/lines/${lineId}`);

export async function generateJobCardInvoiceRequest(jobCardId: string, body: { dueDate?: string | null; notes?: string | null }) {
  return (await apiPost<{ invoice: { id: string; invoiceNumber: string; total: number } }>(`/finance/invoices/from-job-card/${jobCardId}`, body)).invoice;
}

export function issuePartRequest(body: { sparePartId: string; branchId: string; jobCardId: string; issuedById: string; quantity: number; notes?: string }) {
  return apiPost<unknown>("/inventory/issuances", body);
}
