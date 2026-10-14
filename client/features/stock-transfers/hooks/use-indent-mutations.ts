import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { indentKeys } from "../api/indent.keys";
import { notificationKeys } from "@/features/notification/api/notification.keys";
import {
  approveIndentRequest,
  cancelIndentRequest,
  closeIndentRequest,
  createIndentRequest,
  dispatchIndentRequest,
  pickIndentRequest,
  receiveIndentRequest,
  rejectIndentRequest,
  submitIndentRequest,
} from "../api/indent.api";
import type {
  ApproveIndentPayload,
  CreateIndentPayload,
  DispatchIndentPayload,
  Indent,
  ReceiveIndentPayload,
} from "../types/indent.types";

export function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; errors?: { message: string }[] } } })
    ?.response?.data;
  return data?.errors?.[0]?.message ?? data?.message ?? fallback;
}

/** Shared wiring: refresh lists and the detail cache, then toast. */
function useIndentMutation<V>(
  fn: (vars: V) => Promise<Indent>,
  success: string | ((indent: Indent) => string),
  failure: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (indent) => {
      queryClient.setQueryData(indentKeys.detail(indent.id), indent);
      queryClient.invalidateQueries({ queryKey: indentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(typeof success === "function" ? success(indent) : success);
    },
    onError: (error) => toast.error(apiErrorMessage(error, failure)),
  });
}

export const useCreateIndent = () =>
  useIndentMutation(
    (payload: CreateIndentPayload) => createIndentRequest(payload),
    (i) => (i.status === "DRAFT" ? `Indent ${i.indentNumber} saved as draft` : `Indent ${i.indentNumber} submitted`),
    "Failed to create indent",
  );

export const useSubmitIndent = () =>
  useIndentMutation((id: string) => submitIndentRequest(id), "Indent submitted", "Failed to submit indent");

export const useApproveIndent = () =>
  useIndentMutation(
    ({ id, body }: { id: string; body: ApproveIndentPayload }) => approveIndentRequest(id, body),
    (i) =>
      i.openPickingList
        ? `Approved. Picking list ${i.openPickingList.pickingNumber} created`
        : "Approved. No stock available yet, all lines are on back order",
    "Failed to approve indent",
  );

export const usePickIndent = () =>
  useIndentMutation(
    ({ id, pickerName }: { id: string; pickerName?: string }) => pickIndentRequest(id, pickerName),
    (i) => `Picking list ${i.openPickingList?.pickingNumber ?? ""} created`.trim(),
    "Failed to pick indent",
  );

export const useCloseIndent = () =>
  useIndentMutation(
    ({ id, reason }: { id: string; reason: string }) => closeIndentRequest(id, reason),
    "Back order closed",
    "Failed to close the back order",
  );

export const useRejectIndent = () =>
  useIndentMutation(
    ({ id, reason }: { id: string; reason: string }) => rejectIndentRequest(id, reason),
    "Indent rejected",
    "Failed to reject indent",
  );

export const useCancelIndent = () =>
  useIndentMutation(
    ({ id, reason }: { id: string; reason?: string }) => cancelIndentRequest(id, reason),
    "Indent cancelled",
    "Failed to cancel indent",
  );

export const useDispatchIndent = () =>
  useIndentMutation(
    ({ id, body }: { id: string; body: DispatchIndentPayload }) => dispatchIndentRequest(id, body),
    (i) => {
      const stn = i.stns[i.stns.length - 1];
      return i.status === "PARTLY_DISPATCHED"
        ? `Dispatched on STN ${stn?.stnNumber}. The rest stays on back order`
        : `Dispatched on STN ${stn?.stnNumber}. The goods are now in transit`;
    },
    "Failed to dispatch",
  );

export const useReceiveIndent = () =>
  useIndentMutation(
    ({ id, body }: { id: string; body: ReceiveIndentPayload }) => receiveIndentRequest(id, body),
    (i) => {
      const mrn = i.stns.flatMap((s) => s.mrns).sort((a, b) => a.receiptDate.localeCompare(b.receiptDate)).pop();
      return i.status === "COMPLETED"
        ? `MRN ${mrn?.mrnNumber} generated. Transfer complete`
        : `MRN ${mrn?.mrnNumber} generated. Some items are still outstanding`;
    },
    "Failed to receive",
  );
