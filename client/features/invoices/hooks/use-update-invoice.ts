"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateInvoiceRequest, type UpdateInvoicePayload } from "../api/invoice.api";
import { invoiceKeys } from "../api/invoice.keys";
import { useQueryClient } from "@tanstack/react-query";

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateInvoicePayload }) =>
      updateInvoiceRequest(id, payload),
    onSuccess: () => {
      toast.success("Invoice updated successfully");
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.details() });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update invoice";
      toast.error(message);
    },
  });
}
