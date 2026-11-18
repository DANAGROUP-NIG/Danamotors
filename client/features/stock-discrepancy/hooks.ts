"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api/apiClient";
import { notificationKeys } from "@/features/notification/api/notification.keys";
import type { PendingDiscrepancy } from "./types";

export const discrepancyKeys = { all: ["stock-discrepancies"] as const };

/** Receipts whose shortage or damage still waits for approval (own branch, or all with cross-branch access). */
export function usePendingDiscrepancies(enabled = true) {
  return useQuery({
    queryKey: discrepancyKeys.all,
    queryFn: () => apiGet<{ items: PendingDiscrepancy[] }>("/inventory/discrepancies"),
    enabled,
  });
}

export function useApproveDiscrepancy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mrnId, remark }: { mrnId: string; remark?: string }) =>
      apiPatch(`/inventory/mrn/${mrnId}/approve-discrepancy`, remark ? { remark } : {}),
    onSuccess: () => {
      // The MIT and STN pages show the MRN, so refresh them along with the pending list.
      for (const key of [discrepancyKeys.all, ["mobis-mit"], ["stns"], notificationKeys.all]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success("Shortage approved");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Could not approve the shortage";
      toast.error(message);
    },
  });
}
