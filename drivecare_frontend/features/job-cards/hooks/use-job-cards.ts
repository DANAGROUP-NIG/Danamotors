import { useQuery } from "@tanstack/react-query";
import { jobCardKeys } from "../api/job-card.keys";
import { getJobCardsRequest } from "../api/job-card.api";

type UseJobCardsParams = {
  page?: number;
  limit?: number;
  branchId?: string;
};

export function useJobCards(params?: UseJobCardsParams) {
  return useQuery({
    queryKey: jobCardKeys.list(params),
    queryFn: () => getJobCardsRequest(params),
  });
}
