import { useQuery } from "@tanstack/react-query";
import { appointmentKeys } from "../api/appointment.keys";
import { getAppointmentsRequest } from "../api/appointment.api";

type UseAppointmentsParams = {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
  status?: string;
};

export function useAppointments(params?: UseAppointmentsParams) {
  return useQuery({
    queryKey: appointmentKeys.list(params),
    queryFn: () => getAppointmentsRequest(params),
  });
}
