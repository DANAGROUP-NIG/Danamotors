import { useQuery } from "@tanstack/react-query";
import { jobCardKeys } from "../api/job-card.keys";
import { getJobCardsRequest } from "../api/job-card.api";

type UseJobCardsParams = {
  page?: number;
  limit?: number;
  branchId?: string;
  customerId?: string;
  search?: string;
  status?: string;
  unassignedTechnician?: boolean;
  jobType?: "SERVICE" | "PDI" | "ALL" | "HISTORY";
  dateFrom?: string;
  dateTo?: string;
  advisorId?: string;
  technicianId?: string;
  stage?: string;
};

export function useJobCards(params?: UseJobCardsParams, enabled = true) {
  return useQuery({
    queryKey: jobCardKeys.list(params),
    queryFn: () => getJobCardsRequest(params),
    enabled,
  });
}
