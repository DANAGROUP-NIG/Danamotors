import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customerKeys } from "../api/customer.keys";
import { manageCustomerAccountRequest } from "../api/customer.api";

export function useManageCustomerAccount(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      password: string;
      isActive?: boolean;
      isExisting?: boolean;
    }) =>
      manageCustomerAccountRequest(id, {
        password: payload.password,
        isActive: payload.isActive,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      if (variables.isActive === false) {
        toast.success("Portal login disabled");
      } else if (variables.isExisting) {
        toast.success("Portal password reset");
      } else {
        toast.success("Portal login created");
      }
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update portal login";
      toast.error(message);
    },
  });
}
