import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";

export const applicabilityLabels = {
  NON_ACCIDENTAL: "Non-accidental",
  ACCIDENTAL: "Accidental",
  BOTH: "Both",
} as const;
export type Applicability = keyof typeof applicabilityLabels;
export type MasterKind = "attributes" | "responses" | "cards";
type BaseInput = { code: string; description: string; active: boolean };
export type AttributeInput = BaseInput & {
  shortDescription: string;
  weightage: string;
};
export type ResponseInput = BaseInput & { marks: string };
export type Attribute = AttributeInput & { id: string };
export type Rating = ResponseInput & { id: string };
export type CardDetails = {
  description: string;
  cardDate: string;
  effectiveDate: string;
  appliesTo: Applicability;
  attributes: { attributeId: string; description: string; weightage: string }[];
  responses: { responseId: string; description: string; marks: string }[];
};
export type Card = {
  id: string;
  code: string;
  active: boolean;
  version: number;
  revisions: CardDetails[];
};
export type Master = Attribute | Rating | Card;
export type Payload =
  | AttributeInput
  | ResponseInput
  | (Omit<CardDetails, "attributes" | "responses"> & {
      code: string;
      active: boolean;
      version?: number;
      attributes: { attributeId: string; weightage: string }[];
      responses: { responseId: string; marks: string }[];
    });

function url(kind: MasterKind, branchId: string, id?: string, page?: number) {
  const query = new URLSearchParams({ branchId });
  if (page) query.set("page", String(page));
  return "/csi/" + kind + (id ? "/" + id : "") + "?" + query.toString();
}

export function useCsiMasters<T extends Master>(
  kind: MasterKind,
  branchId: string,
  page: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["csi-masters", branchId, kind, page],
    enabled: enabled && Boolean(branchId),
    queryFn: ({ signal }) =>
      apiGet<{ items: T[]; hasNext: boolean }>(
        url(kind, branchId, undefined, page),
        { signal },
      ),
  });
}

export function useSaveCsiMaster(
  kind: MasterKind,
  branchId: string,
  id?: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: Payload) =>
      id
        ? apiPatch(url(kind, branchId, id), payload)
        : apiPost(url(kind, branchId), payload),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["csi-masters", branchId, kind] }),
  });
}
