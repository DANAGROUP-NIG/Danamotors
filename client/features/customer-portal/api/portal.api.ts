import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  EstimateApprovalPayload,
  EstimateApprovalResult,
  PortalAppointment,
  PortalAppointmentBooking,
  PortalCredit,
  PortalCreditApplication,
  PortalCreditDecisionPayload,
  PortalDashboard,
  PortalInvoice,
  PortalInvoiceDetail,
  PortalJobCard,
  PortalJobCardFilter,
  PortalPasswordChange,
  PortalProfile,
  PortalProfileUpdate,
  PortalServiceItem,
  PortalVehicle,
  PortalVehicleDetail,
  PortalVehicleRegistration,
} from "../types/portal.types";

export async function getPortalProfileRequest(): Promise<PortalProfile> {
  const result = await apiGet<{ profile: PortalProfile }>(API_ROUTES.portal.me);
  return result.profile;
}

export async function updatePortalProfileRequest(
  payload: PortalProfileUpdate,
): Promise<PortalProfile> {
  const result = await apiPut<{ profile: PortalProfile }>(
    API_ROUTES.portal.me,
    payload,
  );
  return result.profile;
}

export async function changePortalPasswordRequest(
  payload: PortalPasswordChange,
): Promise<void> {
  return apiPost<void>(API_ROUTES.portal.changePassword, payload);
}

export async function getPortalDashboardRequest(): Promise<PortalDashboard> {
  const result = await apiGet<{ stats: PortalDashboard }>(
    API_ROUTES.portal.dashboard,
  );
  return result.stats;
}

export async function getPortalVehiclesRequest(): Promise<PortalVehicle[]> {
  const result = await apiGet<{ vehicles: PortalVehicle[] }>(
    API_ROUTES.portal.vehicles.base,
  );
  return result.vehicles;
}

export async function getPortalVehicleRequest(id: string): Promise<PortalVehicleDetail> {
  const result = await apiGet<{ vehicle: PortalVehicleDetail }>(
    API_ROUTES.portal.vehicles.detail(id),
  );
  return result.vehicle;
}

export async function registerPortalVehicleRequest(
  payload: PortalVehicleRegistration,
): Promise<PortalVehicle> {
  const result = await apiPost<{ vehicle: PortalVehicle }>(
    API_ROUTES.portal.vehicles.base,
    payload,
  );
  return result.vehicle;
}

export async function getPortalJobCardsRequest(
  filters?: PortalJobCardFilter,
): Promise<PortalJobCard[]> {
  const query = new URLSearchParams();
  if (filters?.status) query.set("status", filters.status);
  if (filters?.vehicleId) query.set("vehicleId", filters.vehicleId);
  const qs = query.toString();
  const result = await apiGet<{ jobCards: PortalJobCard[] }>(
    `${API_ROUTES.portal.jobCards.base}${qs ? `?${qs}` : ""}`,
  );
  return result.jobCards;
}

export async function getPortalJobCardRequest(id: string): Promise<PortalJobCard> {
  const result = await apiGet<{ jobCard: PortalJobCard }>(
    API_ROUTES.portal.jobCards.detail(id),
  );
  return result.jobCard;
}

export async function getPortalAppointmentsRequest(): Promise<PortalAppointment[]> {
  const result = await apiGet<{ appointments: PortalAppointment[] }>(
    API_ROUTES.portal.appointments.base,
  );
  return result.appointments;
}

export async function getPortalServicesRequest(): Promise<PortalServiceItem[]> {
  const result = await apiGet<{ services: PortalServiceItem[] }>(
    API_ROUTES.portal.services.base,
  );
  return result.services;
}

export async function bookPortalAppointmentRequest(
  payload: PortalAppointmentBooking,
): Promise<PortalAppointment> {
  const result = await apiPost<{ appointment: PortalAppointment }>(
    API_ROUTES.portal.appointments.base,
    payload,
  );
  return result.appointment;
}

export async function getPortalInvoicesRequest(): Promise<PortalInvoice[]> {
  const result = await apiGet<{ invoices: PortalInvoice[] }>(
    API_ROUTES.portal.invoices.base,
  );
  return result.invoices;
}

export async function getPortalInvoiceRequest(id: string): Promise<PortalInvoiceDetail> {
  const result = await apiGet<{ invoice: PortalInvoiceDetail }>(
    API_ROUTES.portal.invoices.detail(id),
  );
  return result.invoice;
}

export async function submitEstimateApprovalRequest(
  estimateId: string,
  payload: EstimateApprovalPayload,
): Promise<EstimateApprovalResult> {
  return apiPost<EstimateApprovalResult>(
    API_ROUTES.portal.estimateApproval(estimateId),
    payload,
  );
}

export async function getPortalCreditRequest(): Promise<PortalCredit> {
  const result = await apiGet<{ credit: PortalCredit }>(
    API_ROUTES.portal.credit,
  );
  return result.credit;
}

export async function getPortalCreditApplicationsRequest(): Promise<
  PortalCreditApplication[]
> {
  const result = await apiGet<{ applications: PortalCreditApplication[] }>(
    API_ROUTES.portal.creditApplications,
  );
  return result.applications;
}

export async function decidePortalCreditApplicationRequest(
  id: string,
  payload: PortalCreditDecisionPayload,
): Promise<PortalCreditApplication> {
  const result = await apiPost<{ application: PortalCreditApplication }>(
    API_ROUTES.portal.creditDecision(id),
    payload,
  );
  return result.application;
}
