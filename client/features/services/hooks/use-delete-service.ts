import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { servicesKeys } from "../api/service-catalog.keys";
import { deleteServiceRequest } from "../api/service-catalog.api";

export function useDeleteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteServiceRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.lists() });
      toast.success("Service deleted");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete service";
      toast.error(message);
    },
  });
}
