import { apiGet, apiPatch, apiDelete, apiPost } from '@/lib/api/apiClient';
import { API_ROUTES } from '@/lib/constants/apiRoutes';
import type {
  CreateEnquiryPayload,
  CreateEnquiryResponse,
  EnquiryListResponse,
  Enquiry,
  ReviewEnquiryPayload,
  ReviewEnquiryResponse,
} from '../types/enquiry.types';

export async function createEnquiryRequest(
  payload: CreateEnquiryPayload,
): Promise<CreateEnquiryResponse> {
  return apiPost<CreateEnquiryResponse, CreateEnquiryPayload>(
    API_ROUTES.enquiries.base,
    payload,
  );
}

export async function getEnquiriesRequest(params?: {
  page?:     number;
  limit?:    number;
  branchId?: string;
  status?:   string;
  search?:   string;
  dateFrom?: string;
  dateTo?:   string;
}): Promise<EnquiryListResponse> {
  const query = new URLSearchParams();
  if (params?.page)     query.set('page',     String(params.page));
  if (params?.limit)    query.set('limit',    String(params.limit));
  if (params?.branchId) query.set('branchId', params.branchId);
  if (params?.status)   query.set('status',   params.status);
  if (params?.search)   query.set('search',   params.search);
  if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params?.dateTo)   query.set('dateTo',   params.dateTo);
  const qs = query.toString();
  return apiGet<EnquiryListResponse>(
    `${API_ROUTES.enquiries.base}${qs ? `?${qs}` : ''}`,
  );
}

export async function getEnquiryRequest(id: string): Promise<{ enquiry: Enquiry }> {
  return apiGet<{ enquiry: Enquiry }>(`${API_ROUTES.enquiries.base}/${id}`);
}

export async function reviewEnquiryRequest(
  id: string,
  payload: ReviewEnquiryPayload,
): Promise<ReviewEnquiryResponse> {
  return apiPatch<ReviewEnquiryResponse, ReviewEnquiryPayload>(
    API_ROUTES.enquiries.review(id),
    payload,
  );
}

export async function deleteEnquiryRequest(id: string): Promise<void> {
  return apiDelete<void>(`${API_ROUTES.enquiries.base}/${id}`);
}

