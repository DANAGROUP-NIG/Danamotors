"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { servicesKeys } from "../api/service-catalog.keys";
import { updateServiceRequest } from "../api/service-catalog.api";
import type {
  ServiceItem,
  UpdateServicePayload,
} from "../types/service-catalog.types";

export function useBulkUpdateServices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      services,
      payload,
      label,
    }: {
      services: ServiceItem[];
      payload: UpdateServicePayload;
      label: string;
    }) => {
      if (services.length === 0) return { count: 0 };

      const updating = toast.loading(`Updating ${services.length} services…`);
      try {
        await Promise.all(
          services.map((s) => updateServiceRequest(s.id, payload)),
        );
        toast.dismiss(updating);
        return { count: services.length, label };
      } catch (error) {
        toast.dismiss(updating);
        throw error;
      }
    },
    onSuccess: ({ count, label }) => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.lists() });
      toast.success(`${count} service${count === 1 ? "" : "s"} ${label}`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update some services";
      toast.error(message);
    },
  });
}
