import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { indentKeys } from "../api/indent.keys";
import { notificationKeys } from "@/features/notification/api/notification.keys";
import {
  approveIndentRequest,
  cancelIndentRequest,
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
      i.pickingList
        ? `Approved. Picking list ${i.pickingList.pickingNumber} created`
        : "Approved. No stock available yet, all lines are on back order",
    "Failed to approve indent",
  );

export const usePickIndent = () =>
  useIndentMutation((id: string) => pickIndentRequest(id), "Picking list created", "Failed to pick indent");

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
    (i) => `Dispatched. STN ${i.stn?.stnNumber} and MIT ${i.stn?.mit?.mitNumber} created`,
    "Failed to dispatch",
  );

export const useReceiveIndent = () =>
  useIndentMutation(
    ({ id, body }: { id: string; body: ReceiveIndentPayload }) => receiveIndentRequest(id, body),
    (i) => {
      const srn = i.stn?.srns[i.stn.srns.length - 1];
      return i.status === "COMPLETED"
        ? `SRN ${srn?.srnNumber} posted. Transfer complete`
        : `SRN ${srn?.srnNumber} posted. Some items are still outstanding`;
    },
    "Failed to receive",
  );
