import { useQuery } from "@tanstack/react-query";
import { portalKeys } from "../api/portal.keys";
import {
  getPortalAppointmentsRequest,
  getPortalCreditApplicationsRequest,
  getPortalCreditRequest,
  getPortalDashboardRequest,
  getPortalInvoiceRequest,
  getPortalInvoicesRequest,
  getPortalJobCardRequest,
  getPortalJobCardsRequest,
  getPortalProfileRequest,
  getPortalServicesRequest,
  getPortalVehicleRequest,
  getPortalVehiclesRequest,
} from "../api/portal.api";
import type { PortalJobCardFilter } from "../types/portal.types";

export function usePortalProfile() {
  return useQuery({
    queryKey: portalKeys.profile,
    queryFn: getPortalProfileRequest,
  });
}

export function usePortalDashboard() {
  return useQuery({
    queryKey: portalKeys.dashboard,
    queryFn: getPortalDashboardRequest,
  });
}

export function usePortalVehicles() {
  return useQuery({
    queryKey: portalKeys.vehicles,
    queryFn: getPortalVehiclesRequest,
  });
}

export function usePortalVehicle(id: string) {
  return useQuery({
    queryKey: portalKeys.vehicle(id),
    queryFn: () => getPortalVehicleRequest(id),
    enabled: !!id,
  });
}

export function usePortalJobCards(filters?: PortalJobCardFilter) {
  return useQuery({
    queryKey: portalKeys.jobCards(filters),
    queryFn: () => getPortalJobCardsRequest(filters),
  });
}

export function usePortalJobCard(id: string) {
  return useQuery({
    queryKey: portalKeys.jobCard(id),
    queryFn: () => getPortalJobCardRequest(id),
    enabled: !!id,
  });
}

export function usePortalAppointments() {
  return useQuery({
    queryKey: portalKeys.appointments,
    queryFn: getPortalAppointmentsRequest,
  });
}

export function usePortalServices() {
  return useQuery({
    queryKey: portalKeys.services,
    queryFn: getPortalServicesRequest,
  });
}

export function usePortalInvoices() {
  return useQuery({
    queryKey: portalKeys.invoices,
    queryFn: getPortalInvoicesRequest,
  });
}

export function usePortalInvoice(id: string) {
  return useQuery({
    queryKey: portalKeys.invoice(id),
    queryFn: () => getPortalInvoiceRequest(id),
    enabled: !!id,
  });
}

export function usePortalCredit() {
  return useQuery({
    queryKey: portalKeys.credit,
    queryFn: getPortalCreditRequest,
  });
}

export function usePortalCreditApplications() {
  return useQuery({
    queryKey: portalKeys.creditApplications,
    queryFn: getPortalCreditApplicationsRequest,
  });
}
