import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { branchKeys } from "../api/branch.keys";
import { updateBranchRequest } from "../api/branch.api";
import type { UpdateBranchPayload } from "../types/branch.types";
import { apiGet } from "@/lib/api/apiClient";
import { useBranchStore, type Branch } from "@/store/branch.store";

export function useUpdateBranch(id: string) {
  const queryClient = useQueryClient();
  const { setBranches } = useBranchStore();

  return useMutation({
    mutationFn: (payload: UpdateBranchPayload) =>
      updateBranchRequest(id, payload),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
      try {
        const data = await apiGet<{ branches: Branch[] }>("/branches");
        setBranches(data.branches);
      } catch {}
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
