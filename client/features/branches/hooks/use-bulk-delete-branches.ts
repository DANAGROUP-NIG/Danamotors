"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { branchKeys } from "../api/branch.keys";
import { deleteBranchRequest } from "../api/branch.api";
import type { Branch } from "../types/branch.types";
import { apiGet } from "@/lib/api/apiClient";
import { useBranchStore } from "@/store/branch.store";

function isErrorWithMessage(error: unknown): error is {
  response?: { data?: { message?: string } };
} {
  return typeof error === "object" && error !== null;
}

export function useBulkDeleteBranches() {
  const queryClient = useQueryClient();
  const { setBranches } = useBranchStore();

  return useMutation({
    mutationFn: async (branches: Branch[]) => {
      if (branches.length === 0) return { count: 0, ids: [] as string[] };

      const deleting = toast.loading(`Deleting ${branches.length} branches…`);
      try {
        await Promise.all(branches.map((branch) => deleteBranchRequest(branch.id)));
        toast.dismiss(deleting);
        return {
          count: branches.length,
          ids: branches.map((branch) => branch.id),
        };
      } catch (error) {
        toast.dismiss(deleting);
        throw error;
      }
    },
    onSuccess: async ({ count, ids }) => {
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
      for (const id of ids) {
        queryClient.invalidateQueries({ queryKey: branchKeys.detail(id) });
      }
      toast.success(`${count} branch${count === 1 ? "" : "es"} deleted`);
      try {
        const data = await apiGet<{ branches: Branch[] }>("/branches");
        setBranches(data.branches);
      } catch {}
    },
    onError: (error: unknown) => {
      const message =
        (isErrorWithMessage(error) && error.response?.data?.message) ||
        "Failed to delete some branches";
      toast.error(message);
    },
  });
}
