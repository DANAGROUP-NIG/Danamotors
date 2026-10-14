import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "@/features/inventory/api/inventory.keys";
import { notificationKeys } from "@/features/notification/api/notification.keys";
import { indentKeys } from "../api/indent.keys";
import {
  directStnRequest,
  dispatchStnRequest,
  getStnRequest,
  getStnsRequest,
  receiveStnRequest,
  stnKeys,
} from "../api/stn.api";
import { apiErrorMessage } from "./use-indent-mutations";
import type {
  DirectStnPayload,
  DispatchStnPayload,
  ReceiveIndentPayload,
  StnDetail,
  StnListItem,
} from "../types/indent.types";

export function useStns(params: { status?: StnListItem["status"] } = {}) {
  return useQuery({ queryKey: stnKeys.list(params), queryFn: () => getStnsRequest(params), placeholderData: keepPreviousData });
}

export function useStn(id: string) {
  return useQuery({ queryKey: stnKeys.detail(id), queryFn: () => getStnRequest(id), enabled: !!id });
}

/** STN actions move stock and change every indent on the STN. */
function useStnMutation<V>(fn: (vars: V) => Promise<StnDetail>, success: (stn: StnDetail) => string, failure: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (stn) => {
      queryClient.setQueryData(stnKeys.detail(stn.id), stn);
      queryClient.invalidateQueries({ queryKey: stnKeys.all });
      queryClient.invalidateQueries({ queryKey: indentKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(success(stn));
    },
    onError: (error) => toast.error(apiErrorMessage(error, failure)),
  });
}

export const useDispatchStn = () =>
  useStnMutation(
    (payload: DispatchStnPayload) => dispatchStnRequest(payload),
    (stn) => `STN ${stn.stnNumber} dispatched for ${stn.indents.length} indent(s)`,
    "Failed to dispatch",
  );

export const useDirectStn = () =>
  useStnMutation(
    (payload: DirectStnPayload) => directStnRequest(payload),
    (stn) => `Direct STN ${stn.stnNumber} dispatched`,
    "Failed to send the direct STN",
  );

export const useReceiveStn = () =>
  useStnMutation(
    ({ id, body }: { id: string; body: ReceiveIndentPayload }) => receiveStnRequest(id, body),
    (stn) => {
      const mrn = stn.mrns[stn.mrns.length - 1];
      return stn.status === "RECEIVED"
        ? `MRN ${mrn?.mrnNumber} generated. STN ${stn.stnNumber} is fully received`
        : `MRN ${mrn?.mrnNumber} generated. Some items are still outstanding`;
    },
    "Failed to receive",
  );
