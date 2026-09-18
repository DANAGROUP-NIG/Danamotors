"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { branchKeys } from "../api/branch.keys";
import { updateBranchRequest } from "../api/branch.api";
import type { Branch, UpdateBranchPayload } from "../types/branch.types";
import { apiGet } from "@/lib/api/apiClient";
import { useBranchStore } from "@/store/branch.store";

function isErrorWithMessage(error: unknown): error is {
  response?: { data?: { message?: string } };
} {
  return typeof error === "object" && error !== null;
}

export function useBulkUpdateBranches() {
  const queryClient = useQueryClient();
  const { setBranches } = useBranchStore();

  return useMutation({
    mutationFn: async ({
      branches,
      payload,
      label,
    }: {
      branches: Branch[];
      payload: UpdateBranchPayload;
      label: string;
    }) => {
      if (branches.length === 0) return { count: 0, label, ids: [] as string[] };

      const updating = toast.loading(`Updating ${branches.length} branches…`);
      try {
        await Promise.all(
          branches.map((branch) => updateBranchRequest(branch.id, payload)),
        );
        toast.dismiss(updating);
        return {
          count: branches.length,
          label,
          ids: branches.map((branch) => branch.id),
        };
      } catch (error) {
        toast.dismiss(updating);
        throw error;
      }
    },
    onSuccess: async ({ count, label, ids }) => {
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
      for (const id of ids) {
        queryClient.invalidateQueries({ queryKey: branchKeys.detail(id) });
      }
      toast.success(`${count} branch${count === 1 ? "" : "es"} ${label}`);
      try {
        const data = await apiGet<{ branches: Branch[] }>("/branches");
        setBranches(data.branches);
      } catch {}
    },
    onError: (error: unknown) => {
      const message =
        (isErrorWithMessage(error) && error.response?.data?.message) ||
        "Failed to update some branches";
      toast.error(message);
    },
  });
}
