import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { branchKeys } from "../api/branch.keys";
import { createBranchRequest } from "../api/branch.api";
import type { CreateBranchPayload } from "../types/branch.types";
import { apiGet } from "@/lib/api/apiClient";
import { useBranchStore, type Branch } from "@/store/branch.store";

export function useCreateBranch() {
  const queryClient = useQueryClient();
  const { setBranches } = useBranchStore();

  return useMutation({
    mutationFn: (payload: CreateBranchPayload) => createBranchRequest(payload),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
      try {
        const data = await apiGet<{ branches: Branch[] }>("/branches");
        setBranches(data.branches);
      } catch {}
      toast.success("Branch created");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to create branch";
      toast.error(message);
    },
  });
}
