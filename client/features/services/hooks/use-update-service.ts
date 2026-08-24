import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { servicesKeys } from "../api/service-catalog.keys";
import { updateServiceRequest } from "../api/service-catalog.api";
import type { UpdateServicePayload } from "../types/service-catalog.types";

export function useUpdateService(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateServicePayload) =>
      updateServiceRequest(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: servicesKeys.lists() });
      toast.success("Service updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update service";
      toast.error(message);
    },
  });
}
