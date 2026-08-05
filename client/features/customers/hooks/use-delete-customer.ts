import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customerKeys } from "../api/customer.keys";
import { deleteCustomerRequest } from "../api/customer.api";

export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCustomerRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      toast.success("Customer deleted");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete customer";
      toast.error(message);
    },
  });
}
