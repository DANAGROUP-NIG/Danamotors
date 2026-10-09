"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { creditKeys } from "@/features/credit/api/credit.keys";
import { invoiceKeys } from "../api/invoice.keys";
import { createReceiptRequest, type CreateReceiptPayload } from "../api/invoice.api";

export function useCreateReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateReceiptPayload) => createReceiptRequest(payload),
    onSuccess: (_result, payload) => {
      queryClient.invalidateQueries({ queryKey: ["party-account", payload.customerId] });
      queryClient.invalidateQueries({ queryKey: creditKeys.customer(payload.customerId) });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment receipt created");
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: ["receipt-invoice"] });
      queryClient.invalidateQueries({ queryKey: ["job-cards"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      queryClient.invalidateQueries({ queryKey: ["receipt-register"] });
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Failed to create receipt";
      toast.error(message);
    },
  });
}