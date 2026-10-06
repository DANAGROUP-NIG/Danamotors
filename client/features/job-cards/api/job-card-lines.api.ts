import { apiGet, apiPatch } from "@/lib/api/apiClient";
import type { JobCardLine, JobCardLines, UpdateLinePayload } from "../types/job-card-line.types";

export const getJobCardLinesRequest = (jobCardId: string) => apiGet<JobCardLines>(`/service/job-cards/${jobCardId}/lines`);

export async function updateJobCardLineRequest(jobCardId: string, lineId: string, body: UpdateLinePayload) {
  return (await apiPatch<{ line: JobCardLine }>(`/service/job-cards/${jobCardId}/lines/${lineId}`, body)).line;
}
