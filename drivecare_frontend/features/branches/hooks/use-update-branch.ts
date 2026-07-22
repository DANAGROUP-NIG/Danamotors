import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { branchKeys } from "../api/branch.keys";
import { updateBranchRequest } from "../api/branch.api";
import type { UpdateBranchPayload } from "../types/branch.types";

export function useUpdateBranch(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateBranchPayload) =>
      updateBranchRequest(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
      toast.success("Branch updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update branch";
      toast.error(message);
    },
  });
}
