"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import type { JobWorkspace, StageActionInput } from "../types/job-workspace.types";

/** The staged job card for the signed-in user: step, owner, actions with reasons, alerts and summaries. */
export function useJobWorkspace(id: string, enabled = true) {
  return useQuery({
    queryKey: jobCardKeys.workspace(id),
    queryFn: () => apiGet<JobWorkspace>(`/service/job-cards/${id}/workspace`),
    enabled: enabled && !!id,
  });
}

/**
 * Runs one step action. The caller creates the request ID once per attempt
 * (crypto.randomUUID()) so a double click or retry acts only once.
 */
export function useJobStageAction(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: StageActionInput) => apiPost<JobWorkspace, StageActionInput>(`/service/job-cards/${id}/stage`, input),
    onSuccess: async (workspace) => {
      client.setQueryData(jobCardKeys.workspace(id), workspace);
      await client.invalidateQueries({ queryKey: jobCardKeys.all });
    },
  });
}
