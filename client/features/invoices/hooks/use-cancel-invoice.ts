"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelInvoiceRequest } from "../api/invoice.api";
import { invoiceKeys } from "../api/invoice.keys";

export function useCancelInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, remark }: { id: string; remark: string }) => cancelInvoiceRequest(id, remark),
    onSuccess: () => {
      toast.success("Job bill cancelled");
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.billableJobCards() });
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Could not cancel this job bill";
      toast.error(message);
    },
  });
}