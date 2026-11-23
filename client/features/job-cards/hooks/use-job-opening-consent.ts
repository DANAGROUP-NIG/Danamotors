"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/apiClient";
import { jobCardKeys } from "../api/job-card.keys";
import type {
  JobOpeningConsent,
  JobOpeningPrint,
  OpeningSignature,
  OpeningSignatureInput,
} from "../types/job-opening-consent.types";

export function useJobOpeningConsent(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["job-opening-consent", id],
    queryFn: () =>
      apiGet<JobOpeningConsent>(`/service/job-cards/${id}/opening-consent`),
    enabled,
  });
}
export function useSignJobOpening(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: OpeningSignatureInput) =>
      apiPost<OpeningSignature>(
        `/service/job-cards/${id}/opening-consent`,
        body,
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["job-opening-consent", id] }),
        client.invalidateQueries({ queryKey: jobCardKeys.all }),
      ]);
    },
  });
}
export function useJobOpeningPrint(
  id: string,
  signatureId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["job-opening-print", id, signatureId],
    queryFn: () =>
      apiGet<JobOpeningPrint>(
        `/service/job-cards/${id}/opening-consent/${signatureId}/print`,
      ),
    enabled,
  });
}
