"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "../api/inventory.keys";
import { deletePartRequest } from "../api/inventory.api";
import { partErrorMessage } from "./use-part-mutations";

/** Deletes Part Master records by part ID. Parts still in use are reported, not silently skipped. */
export function useBulkDeleteParts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (partIds: string[]) => {
      if (partIds.length === 0) return { deleted: 0, failed: 0, firstError: null as unknown };
      const deleting = toast.loading(`Deleting ${partIds.length} ${partIds.length === 1 ? "part" : "parts"}…`);
      const results = await Promise.allSettled(partIds.map((id) => deletePartRequest(id)));
      toast.dismiss(deleting);
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      return { deleted: results.length - failures.length, failed: failures.length, firstError: failures[0]?.reason };
    },
    onSuccess: ({ deleted, failed, firstError }) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      if (deleted) toast.success(`${deleted} ${deleted === 1 ? "part" : "parts"} deleted`);
      if (failed) {
        toast.error(`${failed} could not be deleted. ${partErrorMessage(firstError, "")}`.trim());
      }
    },
  });
}
