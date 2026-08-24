import { useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseRequestKeys } from "../api/purchase-request.keys";
import { updatePurchaseRequestStatusRequest } from "../api/purchase-request.api";

export function useUpdatePurchaseRequestStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; status: "Approved" | "Rejected"; approvalNotes?: string }) =>
      updatePurchaseRequestStatusRequest(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: purchaseRequestKeys.lists() });
    },
  });
}
