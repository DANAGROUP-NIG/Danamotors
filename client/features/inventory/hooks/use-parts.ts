import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { inventoryKeys } from "../api/inventory.keys";
import { getAlternatesRequest, getPartRequest, getPartStockRequest, getPartsRequest } from "../api/inventory.api";
import type { PartListParams } from "../types/inventory.types";

export function useParts(params: PartListParams = {}) {
  return useQuery({
    queryKey: inventoryKeys.list(params as Record<string, unknown>),
    queryFn: () => getPartsRequest(params),
    placeholderData: keepPreviousData,
  });
}

export function usePart(id: string) {
  return useQuery({
    queryKey: inventoryKeys.detail(id),
    queryFn: () => getPartRequest(id),
    enabled: !!id,
  });
}

export function usePartAlternates(mainPartId: string | null | undefined) {
  return useQuery({
    queryKey: inventoryKeys.alternates(mainPartId ?? ""),
    queryFn: () => getAlternatesRequest(mainPartId!),
    enabled: !!mainPartId,
  });
}

export function usePartStock(partId: string, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.partStock(partId),
    queryFn: () => getPartStockRequest(partId),
    enabled: !!partId && enabled,
  });
}
