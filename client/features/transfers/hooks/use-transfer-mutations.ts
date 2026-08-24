import { useMutation, useQueryClient } from "@tanstack/react-query";
import { transferKeys } from "../api/transfer.keys";
import {
  approveTransferRequest,
  dispatchTransferRequest,
  receiveTransferRequest,
  rejectTransferRequest,
  cancelTransferRequest,
} from "../api/transfer.api";

export function useApproveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveTransferRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transferKeys.all });
    },
  });
}

export function useDispatchTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items?: { id: string; dispatchedQuantity: number }[] }) =>
      dispatchTransferRequest(id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transferKeys.all });
    },
  });
}

export function useReceiveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items?: { id: string; receivedQuantity: number }[] }) =>
      receiveTransferRequest(id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transferKeys.all });
    },
  });
}

export function useRejectTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => rejectTransferRequest(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transferKeys.all });
    },
  });
}

export function useCancelTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelTransferRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transferKeys.all });
    },
  });
}
