import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "@/features/inventory/api/inventory.keys";
import { useBranchStore } from "@/store/branch.store";
import { mobisErrorMessage } from "@/features/mobis-receipts/hooks/use-mobis";
import {
  createVendorReceiptRequest,
  createVendorReturnRequest,
  editVendorReceiptRequest,
  getMrnSettingsRequest,
  getVendorReturnRequest,
  getVendorReturnsRequest,
  getVendorReceiptRequest,
  getVendorReceiptsRequest,
  searchReceivablePartsRequest,
  searchVendorsRequest,
  vendorReceiptKeys,
} from "../api/vendor-receipt.api";
import type { CreateVendorReceiptPayload, CreateVendorReturnPayload, EditVendorReceiptPayload } from "../types/vendor-receipt.types";

/** Receipts at the branch picked in the branch switcher. */
export function useVendorReceipts(search = "") {
  const branchId = useBranchStore((s) => s.activeBranch?.id);
  return useQuery({
    queryKey: vendorReceiptKeys.list(search, branchId),
    queryFn: () => getVendorReceiptsRequest(search || undefined, branchId),
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
    onError: (error) => {
      // A duplicate invoice (409) is handled by the form, which asks for a reason.
      if (errorStatus(error) !== 409) toast.error(mobisErrorMessage(error, "Failed to post the vendor receipt"));
    },
  });
}

/** HTTP status of a failed request. */
export const errorStatus = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;

export function useMrnSettings(branchId: string) {
  return useQuery({ queryKey: vendorReceiptKeys.settings(branchId), queryFn: () => getMrnSettingsRequest(branchId), enabled: !!branchId, staleTime: 300_000 });
}

export function useEditVendorReceipt(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EditVendorReceiptPayload) => editVendorReceiptRequest(id, payload),
    onSuccess: (receipt) => {
      queryClient.setQueryData(vendorReceiptKeys.detail(receipt.id), receipt);
      queryClient.invalidateQueries({ queryKey: vendorReceiptKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(`MRN ${receipt.mrnNumber} corrected`);
    },
    onError: (error) => toast.error(mobisErrorMessage(error, "Failed to correct the MRN")),
  });
}

export function useCreateVendorReturn(mrnId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVendorReturnPayload) => createVendorReturnRequest(mrnId, payload),
    onSuccess: (ret) => {
      queryClient.invalidateQueries({ queryKey: vendorReceiptKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(`MRN return ${ret.returnNumber} posted: ${ret.totalQuantity} unit(s) out of stock`);
    },
    onError: (error) => toast.error(mobisErrorMessage(error, "Failed to post the MRN return")),
  });
}

/** MRN returns at the branch picked in the branch switcher. */
export function useVendorReturns(search = "") {
  const branchId = useBranchStore((s) => s.activeBranch?.id);
  return useQuery({
    queryKey: vendorReceiptKeys.returns(search, branchId),
    queryFn: () => getVendorReturnsRequest(search || undefined, branchId),
    placeholderData: keepPreviousData,
  });
}

export function useVendorReturn(id: string) {
  return useQuery({ queryKey: vendorReceiptKeys.returnDetail(id), queryFn: () => getVendorReturnRequest(id), enabled: !!id });
}
