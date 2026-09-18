"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customerKeys } from "../api/customer.keys";
import { deleteCustomerRequest } from "../api/customer.api";
import type { Customer } from "../types/customer.types";

export function useBulkDeleteCustomers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customers: Customer[]) => {
      if (customers.length === 0) return { count: 0 };

      const deleting = toast.loading(`Deleting ${customers.length} customers…`);
      try {
        await Promise.all(customers.map((c) => deleteCustomerRequest(c.id)));
        toast.dismiss(deleting);
        return { count: customers.length };
      } catch (error) {
        toast.dismiss(deleting);
        throw error;
      }
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      toast.success(`${count} customer${count === 1 ? "" : "s"} deleted`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete some customers";
      toast.error(message);
    },
  });
}
