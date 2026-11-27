"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobQualityCheckStep, QualityCheckPayload } from "../types/job-quality-check.types";
import { repairStepKey } from "./use-job-repair";

export const qualityCheckKey = (id: string) => [...jobCardKeys.detail(id), "quality-check"] as const;
const base = (id: string) => `/service/job-cards/${id}/quality-check`;

/** The quality check step: approved work, general checks, every check so far, and who may record it. */
export function useJobQualityCheck(id: string, enabled = true) {
  return useQuery({
    queryKey: qualityCheckKey(id),
    queryFn: () => apiGet<JobQualityCheckStep>(base(id)),
    enabled: enabled && !!id,
    retry: (count, error) => (error as { response?: { status?: number } })?.response?.status !== 403 && count < 2,
  });
}

/**
 * Pass or fail. The job moves step in the same request (to Billing, or back to Repair), so the
 * job, its workspace, the repair step and My jobs are refreshed. Offline it fails at once.
 */
export function useRecordQualityCheck(id: string) {
  const client = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (body: QualityCheckPayload) => apiPost<JobQualityCheckStep, QualityCheckPayload>(base(id), body),
    onSuccess: async (step) => {
      client.setQueryData(qualityCheckKey(id), step);
      void client.invalidateQueries({ queryKey: repairStepKey(id) });
      void client.invalidateQueries({ queryKey: [...jobCardKeys.all, "my-jobs"] });
      await Promise.all([
        client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) }),
        client.invalidateQueries({ queryKey: jobCardKeys.detail(id), exact: true }),
      ]);
    },
  });
}
