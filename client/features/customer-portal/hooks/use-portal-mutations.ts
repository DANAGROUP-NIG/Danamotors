"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { clearSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth.store";
import {
  bookPortalAppointmentRequest,
  changePortalPasswordRequest,
  decidePortalCreditApplicationRequest,
  registerPortalVehicleRequest,
  submitEstimateApprovalRequest,
  updatePortalProfileRequest,
} from "../api/portal.api";
import { portalKeys } from "../api/portal.keys";
import type {
  EstimateApprovalPayload,
  PortalAppointmentBooking,
  PortalCreditDecisionPayload,
  PortalPasswordChange,
  PortalProfileUpdate,
  PortalVehicleRegistration,
} from "../types/portal.types";

export function useUpdatePortalProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PortalProfileUpdate) =>
      updatePortalProfileRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.profile });
      toast.success("Profile updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update profile";
      toast.error(message);
    },
  });
}

export function useChangePortalPassword() {
  const router = useRouter();

  return useMutation({
    mutationFn: (payload: PortalPasswordChange) =>
      changePortalPasswordRequest(payload),
    onSuccess: () => {
      toast.success("Password changed. Please sign in again.");
      clearSession();
      useAuthStore.getState().reset();
      router.push("/login");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to change password";
      toast.error(message);
    },
  });
}

export function useRegisterPortalVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PortalVehicleRegistration) =>
      registerPortalVehicleRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.vehicles });
      queryClient.invalidateQueries({ queryKey: portalKeys.dashboard });
      toast.success("Vehicle registered");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to register vehicle";
      toast.error(message);
    },
  });
}

export function useBookPortalAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PortalAppointmentBooking) =>
      bookPortalAppointmentRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.appointments });
      queryClient.invalidateQueries({ queryKey: portalKeys.dashboard });
      toast.success("Appointment booked");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to book appointment";
      toast.error(message);
    },
  });
}

export function useEstimateApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      estimateId,
      payload,
    }: {
      estimateId: string;
      payload: EstimateApprovalPayload;
    }) => submitEstimateApprovalRequest(estimateId, payload),
    onSuccess: (result) => {
      toast.success(
        result.status === "Approved"
          ? "Estimate approved"
          : "Estimate rejected",
      );
      queryClient.invalidateQueries({ queryKey: ["portal", "job-cards"] });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to record your decision";
      toast.error(message);
    },
  });
}

export function usePortalCreditDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: PortalCreditDecisionPayload;
    }) => decidePortalCreditApplicationRequest(id, payload),
    onSuccess: (result) => {
      toast.success(
        result.status === "Approved"
          ? "Credit approved and applied to your invoice"
          : "Credit application declined",
      );
      queryClient.invalidateQueries({ queryKey: portalKeys.credit });
      queryClient.invalidateQueries({
        queryKey: portalKeys.creditApplications,
      });
      queryClient.invalidateQueries({ queryKey: portalKeys.invoices });
      queryClient.invalidateQueries({ queryKey: portalKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: portalKeys.profile });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to record your decision";
      toast.error(message);
    },
  });
}
