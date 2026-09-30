import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { inventoryKeys } from "../api/inventory.keys";
import {
  getAlternatesRequest,
  getPartRequest,
  getPartStockRequest,
  getPartsRequest,
  getPriceCategoriesRequest,
  partQueryRequest,
} from "../api/inventory.api";
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

/** Runs only once a part number has been submitted. */
export function usePartQuery(partNumber: string, branchId?: string) {
  return useQuery({
    queryKey: inventoryKeys.partQuery(partNumber, branchId),
    queryFn: () => partQueryRequest(partNumber, branchId),
    enabled: partNumber.trim().length > 0,
    retry: false,
  });
}

/** Legacy price categories; they rarely change, so cache them for the session. */
export function usePriceCategories() {
  return useQuery({
    queryKey: inventoryKeys.priceCategories(),
    queryFn: getPriceCategoriesRequest,
    staleTime: Infinity,
  });
}
