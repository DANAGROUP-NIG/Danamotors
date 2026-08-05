import { apiGet, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type { JobCard, JobCardListResponse } from "../types/job-card.types";

export async function getJobCardsRequest(params?: {
  page?: number;
  limit?: number;
  branchId?: string;
  customerId?: string;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<JobCardListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.branchId) query.set("branchId", params.branchId);
  if (params?.customerId) query.set("customerId", params.customerId);
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  const qs = query.toString();
  return apiGet<JobCardListResponse>(
    `${API_ROUTES.service.jobCards.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getJobCardRequest(id: string): Promise<JobCard> {
  const data = await apiGet<{ jobCard: JobCard }>(
    API_ROUTES.service.jobCards.detail(id),
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
