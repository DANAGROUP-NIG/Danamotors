"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/apiClient";
import type { CsiQuestionnaire } from "./use-csi-issuance";
export const csiSurveyStatus = {
  ISSUED: { label: "Awaiting response", tone: "blue" },
  RESPONDED: { label: "Response recorded", tone: "green" },
} as const;
export type CsiSurveyDetail = CsiQuestionnaire & {
  status: keyof typeof csiSurveyStatus;
  responseDate: string | null;
  comments: string | null;
  score: string | null;
  scorePercent: string | null;
  version: number;
  responseDateMin: string;
  responseDateMax: string;
  answers: { attributeId: string; responseId: string }[];
};
export type CsiResponseInput = {
  version: number;
  responseDate: string;
  comments: string;
  answers: { attributeId: string; responseId: string }[];
};
type SurveyRow = Pick<
  CsiSurveyDetail,
  | "id"
  | "status"
  | "jobSnapshot"
  | "generatedAt"
  | "responseDate"
  | "score"
  | "scorePercent"
  | "version"
>;
function url(branchId: string, id?: string) {
  return `/csi/surveys/issued${id ? "/" + id : ""}?${new URLSearchParams({ branchId })}`;
}
export function useCsiResponseList(
  branchId: string,
  search: string,
  page: number,
) {
  return useQuery({
    queryKey: ["csi-response-list", branchId, search, page],
    queryFn: ({ signal }) =>
      apiGet<{ items: SurveyRow[]; hasNext: boolean }>(
        url(branchId) +
          `&${new URLSearchParams({ search, page: String(page) })}`,
        { signal },
      ),
    enabled: !!branchId,
  });
}
export function useCsiResponse(branchId: string, id: string) {
  return useQuery({
    queryKey: ["csi-response", branchId, id],
    queryFn: ({ signal }) =>
      apiGet<CsiSurveyDetail>(url(branchId, id), { signal }),
    enabled: !!branchId && !!id,
    refetchOnWindowFocus: false,
  });
}
export function useSaveCsiResponse(branchId: string, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CsiResponseInput) =>
      apiPatch<CsiSurveyDetail>(
        `/csi/surveys/issued/${id}/responses?${new URLSearchParams({ branchId })}`,
        input,
      ),
    onSuccess: (data) => {
      client.setQueryData(["csi-response", branchId, id], data);
      return client.invalidateQueries({
        queryKey: ["csi-response-list", branchId],
      });
    },
  });
}
