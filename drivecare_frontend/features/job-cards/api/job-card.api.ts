import { apiGet, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type { JobCard, JobCardListResponse } from "../types/job-card.types";

export async function getJobCardsRequest(params?: {
  page?: number;
  limit?: number;
  branchId?: string;
}): Promise<JobCardListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.branchId) query.set("branchId", params.branchId);
  const qs = query.toString();
  return apiGet<JobCardListResponse>(
    `${API_ROUTES.service.jobCards.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getJobCardRequest(id: string): Promise<JobCard> {
  const data = await apiGet<{ jobCard: JobCard }>(
    API_ROUTES.workshop.jobCards.detail(id),
  );
  return data.jobCard;
}

export interface CreateJobCardPayload {
  branchName: string;
  jobNumber: string;
  description: string;
  appointmentId?: string;
  customerId?: string;
  vehicleId?: string;
  status?: string;
  estimatedHours?: number;
  estimatedCost?: number;
  assignedTo?: string;
}

export async function createJobCardRequest(
  data: CreateJobCardPayload,
): Promise<JobCard> {
  return apiPost<JobCard>(API_ROUTES.service.jobCards.base, data);
}
