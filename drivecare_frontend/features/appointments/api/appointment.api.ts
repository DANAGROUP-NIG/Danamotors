import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  Appointment,
  AppointmentListResponse,
  CreateAppointmentPayload,
  UpdateAppointmentPayload,
} from "../types/appointment.types";

export async function getAppointmentsRequest(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<AppointmentListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiGet<AppointmentListResponse>(
    `${API_ROUTES.appointments.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getAppointmentRequest(
  id: string,
): Promise<Appointment> {
  return apiGet<Appointment>(API_ROUTES.appointments.detail(id));
}

export async function createAppointmentRequest(
  payload: CreateAppointmentPayload,
): Promise<Appointment> {
  return apiPost<Appointment, CreateAppointmentPayload>(
    API_ROUTES.appointments.base,
    payload,
  );
}

export async function updateAppointmentRequest(
  id: string,
  payload: UpdateAppointmentPayload,
): Promise<Appointment> {
  return apiPatch<Appointment, UpdateAppointmentPayload>(
    API_ROUTES.appointments.detail(id),
    payload,
  );
}

export async function deleteAppointmentRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.appointments.detail(id));
}
