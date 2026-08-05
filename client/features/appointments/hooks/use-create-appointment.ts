import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appointmentKeys } from "../api/appointment.keys";
import { dashboardKeys } from "@/features/dashboard/api/dashboard.keys";
import { createAppointmentRequest } from "../api/appointment.api";
import type { CreateAppointmentPayload } from "../types/appointment.types";

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAppointmentPayload) =>
      createAppointmentRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
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
