"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { jobCardKeys } from "@/features/job-cards/api/job-card.keys";
import * as api from "../api/repeat-job.api";
import { repeatKeys, type RepeatListParams } from "../api/repeat-job.api";
import { apiErrorMessage } from "../lib/repeat-job.logic";
import type { RepeatReviewPayload } from "../types/repeat-job.types";

export const useRepeatJobs = (params: RepeatListParams) =>
  useQuery({ queryKey: repeatKeys.list(params), queryFn: () => api.getRepeatJobs(params), placeholderData: keepPreviousData });

export const useRepeatJob = (id: string) => useQuery({ queryKey: repeatKeys.detail(id), queryFn: () => api.getRepeatJob(id), enabled: !!id });

export const useJobRepeat = (jobCardId: string, enabled = true) =>
  useQuery({ queryKey: repeatKeys.forJob(jobCardId), queryFn: () => api.getJobRepeat(jobCardId), enabled: enabled && !!jobCardId });

export const useRepeatReasons = () => useQuery({ queryKey: repeatKeys.reasons(), queryFn: api.getRepeatReasons, staleTime: 5 * 60_000 });

/** The opening form's repeat check; refreshes as the vehicle, branch or reading change. */
export const useRepeatPreview = (vehicleId: string, branchId: string | undefined, mileage: number | undefined, enabled: boolean) =>
  useQuery({
    queryKey: repeatKeys.preview(vehicleId, branchId, mileage),
    queryFn: () => api.getRepeatPreview(vehicleId, branchId, mileage),
    enabled: enabled && !!vehicleId,
    placeholderData: keepPreviousData,
  });

export function useReviewRepeatJob(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: RepeatReviewPayload) => api.reviewRepeatJob(id, payload),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: repeatKeys.all });
      void client.invalidateQueries({ queryKey: jobCardKeys.all });
      toast.success(result.status === "NOT_REPEAT" ? "Marked as not a repeat job" : "Repeat job review saved");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the review")),
  });
}
