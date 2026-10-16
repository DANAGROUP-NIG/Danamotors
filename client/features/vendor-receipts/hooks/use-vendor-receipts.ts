import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "@/features/inventory/api/inventory.keys";
import { mobisErrorMessage } from "@/features/mobis-receipts/hooks/use-mobis";
import {
  createVendorReceiptRequest,
  getVendorReceiptRequest,
  getVendorReceiptsRequest,
  searchReceivablePartsRequest,
  searchVendorsRequest,
  vendorReceiptKeys,
} from "../api/vendor-receipt.api";
import type { CreateVendorReceiptPayload } from "../types/vendor-receipt.types";

export function useVendorReceipts(search = "") {
  return useQuery({
    queryKey: vendorReceiptKeys.list(search),
    queryFn: () => getVendorReceiptsRequest(search || undefined),
    placeholderData: keepPreviousData,
  });
}

export function useVendorReceipt(id: string) {
  return useQuery({ queryKey: vendorReceiptKeys.detail(id), queryFn: () => getVendorReceiptRequest(id), enabled: !!id });
}

export function useVendorSearch(search: string) {
  return useQuery({
    queryKey: vendorReceiptKeys.vendors(search),
    queryFn: () => searchVendorsRequest(search),
    staleTime: 60_000,
  });
}

export function useReceivableParts(branchId: string, search: string) {
  return useQuery({
    queryKey: vendorReceiptKeys.parts(branchId, search),
    queryFn: () => searchReceivablePartsRequest(branchId, search),
    enabled: !!branchId && search.length >= 2,
    staleTime: 15_000,
    retry: false,
  });
}

export function useCreateVendorReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVendorReceiptPayload) => createVendorReceiptRequest(payload),
    onSuccess: (receipt) => {
      queryClient.setQueryData(vendorReceiptKeys.detail(receipt.id), receipt);
      queryClient.invalidateQueries({ queryKey: vendorReceiptKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(`MRN ${receipt.mrnNumber} posted. Stock added to ${receipt.receivingBranch.name}`);
    },
    onError: (error) => toast.error(mobisErrorMessage(error, "Failed to post the vendor receipt")),
  });
}
