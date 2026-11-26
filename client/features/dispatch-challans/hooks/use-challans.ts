import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "@/features/inventory/api/inventory.keys";
import { partSaleErrorMessage } from "@/features/part-sale/hooks/use-part-sale";
import {
  challanKeys,
  createChallanRequest,
  createChallanReturnRequest,
  getChallanRequest,
  getChallanReturnsRequest,
  getChallansRequest,
} from "../api/challan.api";
import type { ChallanFilters, CreateChallanPayload, CreateChallanReturnPayload } from "../types/challan.types";

export function useChallans(params: ChallanFilters = {}) {
  return useQuery({ queryKey: challanKeys.list(params), queryFn: () => getChallansRequest(params), placeholderData: keepPreviousData });
}

export function useChallan(id: string) {
  return useQuery({ queryKey: challanKeys.detail(id), queryFn: () => getChallanRequest(id), enabled: !!id });
}

export function useChallanReturns(params: ChallanFilters = {}) {
  return useQuery({
    queryKey: challanKeys.returns(params),
    queryFn: () => getChallanReturnsRequest(params),
    placeholderData: keepPreviousData,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: challanKeys.all });
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
  };
}

export function useCreateChallan() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (payload: CreateChallanPayload) => createChallanRequest(payload),
    onSuccess: (challan) => {
      refresh();
      toast.success(`Challan ${challan.challanNumber} issued`);
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to issue the challan")),
  });
}

export function useCreateChallanReturn(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (payload: CreateChallanReturnPayload) => createChallanReturnRequest(id, payload),
    onSuccess: (challan) => {
      refresh();
      toast.success(`Challan return ${challan.returns.at(-1)?.returnNumber ?? ""} recorded`.trim());
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to record the return")),
  });
}
