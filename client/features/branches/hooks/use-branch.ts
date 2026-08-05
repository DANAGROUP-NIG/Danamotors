import { useQuery } from "@tanstack/react-query";
import { branchKeys } from "../api/branch.keys";
import { getBranchRequest } from "../api/branch.api";

export function useBranch(id: string) {
  return useQuery({
    queryKey: branchKeys.detail(id),
    queryFn: () => getBranchRequest(id),
    enabled: !!id,
  });
}
