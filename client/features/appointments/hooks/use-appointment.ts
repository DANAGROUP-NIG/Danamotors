import { useQuery } from "@tanstack/react-query";
import { appointmentKeys } from "../api/appointment.keys";
import { getAppointmentRequest } from "../api/appointment.api";

export function useAppointment(id: string) {
  return useQuery({
    queryKey: appointmentKeys.detail(id),
    queryFn: () => getAppointmentRequest(id),
    enabled: !!id,
  });
}
