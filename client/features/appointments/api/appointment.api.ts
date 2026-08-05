import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  Appointment,
  AppointmentListResponse,
  CreateAppointmentPayload,
  UpdateAppointmentPayload,
} from "../types/appointment.types";

export async function getAppointmentsRequest(params?: {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AppointmentListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", params.branchId);
  if (params?.status) query.set("status", params.status);
  if (params?.customerId) query.set("customerId", params.customerId);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  const qs = query.toString();
  return apiGet<AppointmentListResponse>(
    `${API_ROUTES.appointments.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getAppointmentRequest(
  id: string,
): Promise<{ appointment: Appointment }> {
  return apiGet<{ appointment: Appointment }>(
    API_ROUTES.appointments.detail(id),
  );
}

export async function createAppointmentRequest(
  payload: CreateAppointmentPayload,
): Promise<{ appointment: Appointment }> {
  return apiPost<{ appointment: Appointment }, CreateAppointmentPayload>(
    API_ROUTES.appointments.base,
    payload,
  );
}

export async function updateAppointmentRequest(
  id: string,
  payload: UpdateAppointmentPayload,
): Promise<{ appointment: Appointment }> {
  return apiPut<{ appointment: Appointment }, UpdateAppointmentPayload>(
    API_ROUTES.appointments.detail(id),
    payload,
  );
}

export async function deleteAppointmentRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.appointments.detail(id));
}
