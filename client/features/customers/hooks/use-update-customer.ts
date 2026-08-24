import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customerKeys } from "../api/customer.keys";
import { updateCustomerRequest } from "../api/customer.api";
import type { UpdateCustomerPayload } from "../types/customer.types";

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCustomerPayload) =>
      updateCustomerRequest(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      toast.success("Customer updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update customer";
      toast.error(message);
    },
  });
}
