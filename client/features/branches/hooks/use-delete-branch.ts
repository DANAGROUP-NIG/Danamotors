import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { branchKeys } from "../api/branch.keys";
import { deleteBranchRequest } from "../api/branch.api";
import { apiGet } from "@/lib/api/apiClient";
import { useBranchStore, type Branch } from "@/store/branch.store";

export function useDeleteBranch() {
  const queryClient = useQueryClient();
  const { setBranches } = useBranchStore();

  return useMutation({
    mutationFn: (id: string) => deleteBranchRequest(id),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
      try {
        const data = await apiGet<{ branches: Branch[] }>("/branches");
        setBranches(data.branches);
      } catch {}
      toast.success("Branch deleted");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete branch";
      toast.error(message);
    },
  });
}
