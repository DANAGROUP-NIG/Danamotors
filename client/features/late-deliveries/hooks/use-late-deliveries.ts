"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { jobCardKeys } from "@/features/job-cards/api/job-card.keys";
import * as api from "../api/late-delivery.api";
import { lateKeys, type LateListParams } from "../api/late-delivery.api";
import { apiErrorMessage } from "../lib/late-delivery.logic";
import type { LateKind, LateSavePayload } from "../types/late-delivery.types";

export const useLateReasons = () => useQuery({ queryKey: lateKeys.reasons(), queryFn: api.getLateReasons, staleTime: 5 * 60_000 });

export const useLateJobs = (params: LateListParams) =>
  useQuery({ queryKey: lateKeys.list(params), queryFn: () => api.getLateJobs(params), placeholderData: keepPreviousData });

export const useLateDetail = (id: string | null, kind: LateKind) =>
  useQuery({ queryKey: lateKeys.detail(id ?? "", kind), queryFn: () => api.getLateDetail(id!, kind), enabled: !!id, retry: false });

/** Legacy Find: job number or registration → the job to open (errors explain why a job cannot be opened). */
export const useFindLateJob = (kind: LateKind, branchId?: string) => useMutation({ mutationFn: (q: string) => api.findLateJob(kind, q, branchId) });

export function useSaveLateReasons(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: LateSavePayload) => api.saveLateReasons(id, payload),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: lateKeys.all });
      void client.invalidateQueries({ queryKey: jobCardKeys.all });
      toast.success(result.changed ? "Late-delivery reasons saved" : "Nothing changed");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the reasons")),
  });
}
