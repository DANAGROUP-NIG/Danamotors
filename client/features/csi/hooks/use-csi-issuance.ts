"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/apiClient";

export type CsiJobSnapshot = {
  branch: string;
  jobNumber: string;
  jobDate: string;
  deliveredDate: string | null;
  customer: string;
  address: string | null;
  mobile: string | null;
  residencePhone: string | null;
  officePhone: string | null;
  registration: string | null;
  vin: string | null;
  model: string | null;
  variant: string | null;
  saleDate: string | null;
  mileage: number | null;
  service: string | null;
};
export type CsiCandidate = CsiJobSnapshot & {
  jobCardId: string;
  surveyId: string | null;
  card: string | null;
  cardDescription: string | null;
  reason: string | null;
  canGenerate: boolean;
};
export type CsiQuestionnaire = {
  id: string;
  generatedAt: string;
  jobSnapshot: CsiJobSnapshot;
  revision: {
    code: string;
    description: string;
    version: number;
    cardDate: string;
    attributes: {
      attributeId: string;
      sequence: number;
      description: string;
      weightage: string;
    }[];
    responses: {
      responseId: string;
      sequence: number;
      description: string;
      marks: string;
    }[];
  };
};
export type GenerationFilters = {
  from: string;
  to: string;
  jobFrom: string;
  jobTo: string;
  serviceTypeId: string;
  modelId: string;
  variantId: string;
  registration: string;
  order: "CARD" | "JOB" | "MODEL" | "REGISTRATION";
};
type Option = { id: string; description: string; parentId: string | null };
function url(
  path: string,
  branchId: string,
  filters?: GenerationFilters,
  page?: number,
) {
  const query = new URLSearchParams({ branchId });
  for (const [key, value] of Object.entries(filters ?? {}))
    if (value) query.set(key, value);
  if (page) query.set("page", String(page));
  return `/csi/surveys${path}?${query}`;
}
export function useCsiGenerationOptions(branchId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["csi-generation-options", branchId],
    queryFn: () =>
      apiGet<{ serviceTypes: Option[]; models: Option[]; variants: Option[] }>(
        url("/options", branchId),
      ),
    enabled: enabled && !!branchId,
    staleTime: 60000,
  });
}
export function useCsiCandidates(
  branchId: string,
  filters: GenerationFilters | null,
  page: number,
) {
  return useQuery({
    queryKey: ["csi-candidates", branchId, filters, page],
    queryFn: ({ signal }) =>
      apiGet<{ items: CsiCandidate[]; total: number; totalPages: number }>(
        url("", branchId, filters!, page),
        { signal },
      ),
    enabled: !!branchId && filters !== null,
    refetchOnWindowFocus: false,
  });
}
export function useGenerateCsiCards(branchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (jobCardIds: string[]) => {
      const issued = await apiPost<{
        surveyIds: string[];
        created: number;
        reused: number;
      }>(url("/generate", branchId), { jobCardIds });
      const printed = await apiPost<{ surveys: CsiQuestionnaire[] }>(
        url("/print", branchId),
        { surveyIds: issued.surveyIds },
      );
      return { ...issued, ...printed };
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["csi-candidates", branchId] }),
  });
}
