import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { branchKeys } from "../api/branch.keys";
import { createBranchRequest } from "../api/branch.api";
import type { CreateBranchPayload } from "../types/branch.types";

export function useCreateBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateBranchPayload) => createBranchRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
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
