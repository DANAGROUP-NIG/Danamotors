import { useQuery } from "@tanstack/react-query";
import { jobCardKeys } from "../api/job-card.keys";
import { getJobCardRequest } from "../api/job-card.api";

export function useJobCard(id: string) {
  return useQuery({
    queryKey: jobCardKeys.detail(id),
    queryFn: () => getJobCardRequest(id),
    enabled: !!id,
  });
}
