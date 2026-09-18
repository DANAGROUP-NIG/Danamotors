"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { servicesKeys } from "../api/service-catalog.keys";
import { deleteServiceRequest } from "../api/service-catalog.api";
import type { ServiceItem } from "../types/service-catalog.types";

export function useBulkDeleteServices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (services: ServiceItem[]) => {
      if (services.length === 0) return { count: 0 };

      const deleting = toast.loading(`Deleting ${services.length} services…`);
      try {
        await Promise.all(services.map((s) => deleteServiceRequest(s.id)));
        toast.dismiss(deleting);
        return { count: services.length };
      } catch (error) {
        toast.dismiss(deleting);
        throw error;
      }
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.lists() });
      toast.success(`${count} service${count === 1 ? "" : "s"} deleted`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete some services";
      toast.error(message);
    },
  });
}
