import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appointmentKeys } from "../api/appointment.keys";
import { dashboardKeys } from "@/features/dashboard/api/dashboard.keys";
import { deleteAppointmentRequest } from "../api/appointment.api";

export function useDeleteAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAppointmentRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      toast.success("Appointment deleted");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete appointment";
      toast.error(message);
    },
  });
}
