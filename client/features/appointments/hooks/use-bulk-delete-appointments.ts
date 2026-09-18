"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appointmentKeys } from "../api/appointment.keys";
import { dashboardKeys } from "@/features/dashboard/api/dashboard.keys";
import { deleteAppointmentRequest } from "../api/appointment.api";
import type { Appointment } from "../types/appointment.types";

export function useBulkDeleteAppointments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appointments: Appointment[]) => {
      if (appointments.length === 0) return { count: 0 };

      const deleting = toast.loading(
        `Deleting ${appointments.length} appointments…`,
      );
      try {
        await Promise.all(
          appointments.map((a) => deleteAppointmentRequest(a.id)),
        );
        toast.dismiss(deleting);
        return { count: appointments.length };
      } catch (error) {
        toast.dismiss(deleting);
        throw error;
      }
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      toast.success(`${count} appointment${count === 1 ? "" : "s"} deleted`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete some appointments";
      toast.error(message);
    },
  });
}
