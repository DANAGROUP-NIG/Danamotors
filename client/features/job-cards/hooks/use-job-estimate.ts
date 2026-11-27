"use client";
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import type { ApprovePayload, JobEstimateStep, ManualExemption, PhoneApprovalPayload, SaveDraftPayload } from "../types/job-estimate.types";

export const estimateStepKey = (id: string) => [...jobCardKeys.detail(id), "estimate"] as const;

/** The estimate step: revision, totals, approval, estimation charge, advance and parts request. */
export function useJobEstimate(id: string, enabled = true) {
  return useQuery({
    queryKey: estimateStepKey(id),
    queryFn: () => apiGet<JobEstimateStep>(`/service/job-cards/${id}/estimate`),
    enabled: enabled && !!id,
    // A 403 (no estimate access) is an answer, not a failure to retry.
    retry: (count, error) => (error as { response?: { status?: number } })?.response?.status !== 403 && count < 2,
  });
}

/** After a change: the step (from the response), the handoff gates on the action bar, and the job. */
function useApply(id: string) {
  const client = useQueryClient();
  return useCallback(
    (step: JobEstimateStep) => {
      client.setQueryData(estimateStepKey(id), step);
      void client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) });
      return client.invalidateQueries({ queryKey: jobCardKeys.detail(id), exact: true });
    },
    [client, id],
  );
}

function useEstimateMutation<T>(id: string, send: (body: T) => Promise<JobEstimateStep>) {
  const apply = useApply(id);
  return useMutation({
    // Offline, fail at once with a message (input stays on screen) rather than wait silently.
    networkMode: "always",
    mutationFn: send,
    onSuccess: apply,
  });
}

const base = (id: string) => `/service/job-cards/${id}/estimate`;

export const usePrepareEstimate = (id: string) =>
  useEstimateMutation(id, (requestId: string) => apiPost<JobEstimateStep, { requestId: string }>(`${base(id)}/prepare`, { requestId }));

export const useSaveEstimateDraft = (id: string) =>
  useEstimateMutation(id, (body: SaveDraftPayload) => apiPut<JobEstimateStep, SaveDraftPayload>(`${base(id)}/draft`, body));

export const usePresentEstimate = (id: string) =>
  useEstimateMutation(id, (estimateId: string) => apiPost<JobEstimateStep, { estimateId: string }>(`${base(id)}/present`, { estimateId }));

export const useApproveEstimate = (id: string) =>
  useEstimateMutation(id, (body: ApprovePayload) => apiPost<JobEstimateStep, ApprovePayload>(`${base(id)}/approval`, body));

export const usePhoneApproval = (id: string) =>
  useEstimateMutation(id, (body: PhoneApprovalPayload) => apiPost<JobEstimateStep, PhoneApprovalPayload>(`${base(id)}/phone-approval`, body));

export const useRetryPartsRequest = (id: string) =>
  useEstimateMutation(id, (requestId: string) => apiPost<JobEstimateStep, { requestId: string }>(`${base(id)}/parts-request`, { requestId }));

export const useAddEstimationCharge = (id: string) =>
  useEstimateMutation(id, (requestId: string) => apiPost<JobEstimateStep, { requestId: string }>(`${base(id)}/estimation-charge`, { requestId }));

export const useRequestWaiver = (id: string) =>
  useEstimateMutation(id, (body: { reason: string; requestId: string }) =>
    apiPost<JobEstimateStep, { reason: string; requestId: string }>(`${base(id)}/estimation-charge/waiver`, body),
  );

export const useDecideWaiver = (id: string) =>
  useEstimateMutation(id, (body: { approve: boolean; note?: string; requestId: string }) =>
    apiPut<JobEstimateStep, { approve: boolean; note?: string; requestId: string }>(`${base(id)}/estimation-charge/waiver`, body),
  );

export const useAdvanceExemption = (id: string) =>
  useEstimateMutation(id, (body: { exemption: ManualExemption | null; reason?: string }) =>
    apiPut<JobEstimateStep, { exemption: ManualExemption | null; reason?: string }>(`${base(id)}/advance-exemption`, body),
  );

export function useNotifyCashier(id: string) {
  const apply = useApply(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (requestId: string) =>
      apiPost<{ notified: string[]; estimate: JobEstimateStep }, { requestId: string }>(`${base(id)}/notify-cashier`, { requestId }),
    onSuccess: (result) => apply(result.estimate),
  });
}
