import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customerKeys } from "../api/customer.keys";
import { createCustomerRequest } from "../api/customer.api";
import type { CreateCustomerPayload } from "../types/customer.types";

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCustomerPayload) =>
      createCustomerRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      toast.success("Customer created");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to create customer";
      toast.error(message);
    },
  });
}
