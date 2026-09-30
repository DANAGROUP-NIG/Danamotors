import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { indentKeys } from "../api/indent.keys";
import {
  getIndentRequest,
  getIndentsRequest,
  lookupIndentPartRequest,
  searchIndentPartsRequest,
  type IndentListParams,
} from "../api/indent.api";

export function useIndents(params: IndentListParams = {}) {
  return useQuery({
    queryKey: indentKeys.list(params),
    queryFn: () => getIndentsRequest(params),
    placeholderData: keepPreviousData,
  });
}

export function useIndent(id: string) {
  return useQuery({
    queryKey: indentKeys.detail(id),
    queryFn: () => getIndentRequest(id),
    enabled: !!id,
  });
}

export function useIndentPartSearch(params: {
  search: string;
  requestingBranchId?: string;
  sourceBranchId?: string;
}) {
  return useQuery({
    queryKey: indentKeys.partSearch(params),
    queryFn: () => searchIndentPartsRequest(params),
    enabled: params.search.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useIndentPartLookup(params: {
  partId?: string;
  requestingBranchId?: string;
  sourceBranchId?: string;
}) {
  return useQuery({
    queryKey: indentKeys.partLookup(params),
    queryFn: () =>
      lookupIndentPartRequest({
        partId: params.partId!,
        requestingBranchId: params.requestingBranchId,
        sourceBranchId: params.sourceBranchId,
      }),
    enabled: !!params.partId,
  });
}
