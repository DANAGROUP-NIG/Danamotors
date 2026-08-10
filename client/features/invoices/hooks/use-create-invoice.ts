"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createInvoiceRequest, type CreateInvoicePayload } from "../api/invoice.api";
import { invoiceKeys } from "../api/invoice.keys";
import { useQueryClient } from "@tanstack/react-query";

export function useCreateInvoice() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateInvoicePayload) => createInvoiceRequest(payload),
    onSuccess: () => {
      toast.success("Invoice created successfully");
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      router.push("/invoices");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to create invoice";
      toast.error(message);
    },
  });
}
