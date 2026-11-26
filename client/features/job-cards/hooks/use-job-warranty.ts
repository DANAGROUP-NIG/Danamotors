"use client";
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import type { DecisionsPayload, JobWarrantyCheck, OutsideRecordPayload } from "../types/job-warranty.types";

export const warrantyCheckKey = (id: string) => [...jobCardKeys.detail(id), "warranty"] as const;

/** Coverage, service history, campaigns and the items to decide for one job. */
export function useJobWarranty(id: string, enabled = true) {
  return useQuery({
    queryKey: warrantyCheckKey(id),
    queryFn: () => apiGet<JobWarrantyCheck>(`/service/job-cards/${id}/warranty`),
    enabled: enabled && !!id,
    // A 403 (no warranty access) is an answer, not a failure to retry.
    retry: (count, error) => (error as { response?: { status?: number } })?.response?.status !== 403 && count < 2,
  });
}

/** After a change: the check (from the response) and the handoff gates on the action bar. */
function useApplyCheck(id: string) {
  const client = useQueryClient();
  return useCallback(
    (check: JobWarrantyCheck) => {
      client.setQueryData(warrantyCheckKey(id), check);
      return client.invalidateQueries({ queryKey: jobCardKeys.workspace(id) });
    },
    [client, id],
  );
}

export function useSaveWarrantyDecisions(id: string) {
  const apply = useApplyCheck(id);
  return useMutation({
    // Offline, fail at once and show the message (choices stay on screen) rather than wait silently.
    networkMode: "always",
    mutationFn: (body: DecisionsPayload) => apiPut<JobWarrantyCheck, DecisionsPayload>(`/service/job-cards/${id}/warranty`, body),
    onSuccess: apply,
  });
}

export function useAddOutsideRecord(id: string) {
  const apply = useApplyCheck(id);
  return useMutation({
    networkMode: "always",
    mutationFn: (body: OutsideRecordPayload) =>
      apiPost<JobWarrantyCheck, OutsideRecordPayload>(`/service/job-cards/${id}/warranty/outside-services`, body),
    onSuccess: apply,
  });
}

export function useRemoveOutsideRecord(id: string) {
  const apply = useApplyCheck(id);
  return useMutation({
    networkMode: "always",
    mutationFn: ({ recordId, reason }: { recordId: string; reason: string }) =>
      apiDelete<JobWarrantyCheck>(`/service/job-cards/${id}/warranty/outside-services/${recordId}`, { data: { reason } }),
    onSuccess: apply,
  });
}
