import { useQuery } from "@tanstack/react-query";
import { branchKeys } from "../api/branch.keys";
import { getBranchesRequest } from "../api/branch.api";

type UseBranchesParams = {
  page?: number;
  limit?: number;
  search?: string;
};

export function useBranches(params?: UseBranchesParams) {
  return useQuery({
    queryKey: branchKeys.list(params),
    queryFn: () => getBranchesRequest(params),
  });
}
