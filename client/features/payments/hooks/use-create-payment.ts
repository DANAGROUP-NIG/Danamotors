"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createPaymentRequest, type CreatePaymentPayload } from "../api/payment.api";
import { paymentKeys } from "../api/payment.keys";
import { invoiceKeys } from "@/features/invoices/api/invoice.keys";
import { useQueryClient } from "@tanstack/react-query";

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreatePaymentPayload) => createPaymentRequest(payload),
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to record payment";
      toast.error(message);
    },
  });
}
