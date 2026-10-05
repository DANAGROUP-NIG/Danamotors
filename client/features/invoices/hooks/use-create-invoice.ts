"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createJobBillRequest, type CreateJobBillPayload } from "../api/invoice.api";
import { invoiceKeys } from "../api/invoice.keys";
import { useQueryClient } from "@tanstack/react-query";

export function useCreateInvoice() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateJobBillPayload) => createJobBillRequest(payload),
    onSuccess: (invoice) => {
      toast.success(`Job bill ${invoice.invoiceNumber} created`);
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: ["job-cards"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      router.push(`/invoices/${invoice.id}`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to create job bill";
      toast.error(message);
    },
  });
}
