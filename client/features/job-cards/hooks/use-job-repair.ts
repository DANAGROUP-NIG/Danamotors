"use client";
import { useCallback } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobEstimateStep } from "../types/job-estimate.types";
import type { JobRepairStep, MyJobTab, MyJobsResponse, RepairFindingPayload, WorkLineAction } from "../types/job-repair.types";
import { estimateStepKey } from "./use-job-estimate";

export const repairStepKey = (id: string) => [...jobCardKeys.detail(id), "repair"] as const;
export const myJobsKey = (tab: MyJobTab, page: number) => [...jobCardKeys.all, "my-jobs", tab, page] as const;
const base = (id: string) => `/service/job-cards/${id}/repair`;

/** The repair step: work list, parts, labour, new findings and the supplementary estimate. */
export function useJobRepair(id: string, enabled = true) {
  return useQuery({
    queryKey: repairStepKey(id),
    queryFn: () => apiGet<JobRepairStep>(base(id)),
    enabled: enabled && !!id,
    retry: (count, error) => (error as { response?: { status?: number } })?.response?.status !== 403 && count < 2,
  });
}

/** After a change: the step from the response, the action bar's gates, the job and My jobs. */
function useApply(id: string) {
  const client = useQueryClient();
  return useCallback(
    (step: JobRepairStep) => {
      client.setQueryData(repairStepKey(id), step);
      void client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) });
      void client.invalidateQueries({ queryKey: [...jobCardKeys.all, "my-jobs"] });
      return client.invalidateQueries({ queryKey: jobCardKeys.detail(id), exact: true });
    },
    [client, id],
  );
}

/** Start, Done or Waiting parts. Offline it fails at once with a message, so the technician can retry. */
export function useMoveWorkLine(id: string) {
  const apply = useApply(id);
  return useMutation({
    networkMode: "always",
    mutationFn: ({ lineId, action, requestId }: { lineId: string; action: WorkLineAction; requestId: string }) =>
      apiPost<JobRepairStep, { action: WorkLineAction; requestId: string }>(`${base(id)}/lines/${lineId}`, { action, requestId }),
    onSuccess: apply,
  });
}

/** "Need a part" or "Add a finding". */
export function useRaiseFinding(id: string) {
  const apply = useApply(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (body: RepairFindingPayload) => apiPost<JobRepairStep, RepairFindingPayload>(`${base(id)}/findings`, body),
    onSuccess: apply,
  });
}

/**
 * "Collect and sign": one signature for the ticked parts, sent to the existing collection endpoint
 * once per issued part. Each call is safe to repeat (a collected part stays collected), so a retry
 * after a partial failure sends only what failed.
 */
export function useCollectParts(id: string) {
  const client = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ issuanceIds, signatureImage }: { issuanceIds: string[]; signatureImage: string }) => {
      const failed: { issuanceId: string; error: unknown }[] = [];
      for (const issuanceId of issuanceIds) {
        try {
          await apiPost(`/workshop/parts/${issuanceId}/receive`, { confirmed: true, signatureImage });
        } catch (error) {
          failed.push({ issuanceId, error });
        }
      }
      return { collected: issuanceIds.length - failed.length, failed };
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: repairStepKey(id) });
      void client.invalidateQueries({ queryKey: [...jobCardKeys.all, "my-jobs"] });
    },
  });
}

/** "Prepare supplementary estimate": revision N+1 with the new findings priced. */
export function usePrepareSupplementary(id: string) {
  const client = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (requestId: string) => apiPost<JobEstimateStep, { requestId: string }>(`/service/job-cards/${id}/estimate/supplementary`, { requestId }),
    onSuccess: async (step) => {
      client.setQueryData(estimateStepKey(id), step);
      await client.invalidateQueries({ queryKey: repairStepKey(id) });
      void client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) });
    },
  });
}

/** The technician's home, one tab and page at a time; the counts come with every page. */
export function useMyJobs(tab: MyJobTab, page: number) {
  return useQuery({
    queryKey: myJobsKey(tab, page),
    queryFn: () => apiGet<MyJobsResponse>(`/service/my-jobs?tab=${tab}&page=${page}&limit=20`),
    placeholderData: keepPreviousData,
    // Offline, say so (with Try again) rather than wait silently on the previous tab's cards.
    networkMode: "always",
    retry: 1,
  });
}
