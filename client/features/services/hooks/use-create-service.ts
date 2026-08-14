import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { servicesKeys } from "../api/service-catalog.keys";
import { createServiceRequest } from "../api/service-catalog.api";
import type { CreateServicePayload } from "../types/service-catalog.types";

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateServicePayload) =>
      createServiceRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.lists() });
      toast.success("Service created");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to create service";
      toast.error(message);
    },
  });
}
