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
  serviceId: string;
  bayId: string;
  serviceAdvisorId: string;
  technicianId?: string;
  teamId?: string;
  serviceTypeId?: string;
  freeServiceCouponNo?: string;
  /** A pre-job estimate the job is opened from. */
  estimateId?: string;
  mileage: number;
  promisedAt: string;
  complaints: {
    complaintCodeId?: string;
    defectCode?: string;
    description?: string;
    spare?: number;
    oil?: number;
    labour?: number;
  }[];
  isRepeat?: boolean;
  previousJobId?: string;
  repeatReason?: string;
  description: string;
  appointmentId?: string;
  customerId?: string;
  vehicleId?: string;
  tyres?: { makeId?: string; number?: string }[];
  batteryMakeId?: string;
  batteryNumber?: string;
  customField1?: string;
  acType?: "FACTORY" | "DEALER" | "NONE";
  checklist?: string;
  estimatedParts?: number;
  estimatedOil?: number;
  estimatedLabour?: number;
  serviceCharge?: number;
  acFitted?: boolean;
  inHouse?: boolean;
  remarks?: string;
  estimatedHours?: number;
  estimatedCost?: number;
  odometerReplaced?: boolean;
  odometerReplacedReason?: string;
  /** The adviser informed the customer of the warranty coverage. */
  warrantyAcknowledged?: boolean;
  /** Open campaigns the adviser acknowledged. */
  acknowledgedCampaignIds?: string[];
}

export type CreatedJobCard = JobCard & {
  warrantyCase: { id: string; caseNumber: string } | null;
}

export async function createJobCardRequest(
  data: CreateJobCardPayload,
): Promise<CreatedJobCard> {
  const result = await apiPost<{ jobCard: CreatedJobCard }>(
    API_ROUTES.service.jobCards.base,
    {
      ...data,
      appointmentId: data.appointmentId || undefined,
      customerId: data.customerId || undefined,
      vehicleId: data.vehicleId || undefined,
    },
  );
  return result.jobCard;
}
