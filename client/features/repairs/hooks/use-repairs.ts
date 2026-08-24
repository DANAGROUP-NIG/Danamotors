import { useQuery } from "@tanstack/react-query";
import { repairKeys } from "../api/repair.keys";
import { getRepairsRequest } from "../api/repair.api";

type UseRepairsParams = {
  page?: number;
  limit?: number;
  branchId?: string;
  status?: string;
  search?: string;
};

export function useRepairs(params?: UseRepairsParams) {
  return useQuery({
    queryKey: repairKeys.list(params),
    queryFn: () => getRepairsRequest(params),
  });
}
