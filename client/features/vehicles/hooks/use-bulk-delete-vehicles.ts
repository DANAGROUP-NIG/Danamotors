"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { vehicleKeys } from "../api/vehicle.keys";
import { deleteVehicleRequest } from "../api/vehicle.api";
import type { Vehicle } from "../types/vehicle.types";

export function useBulkDeleteVehicles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicles: Vehicle[]) => {
      if (vehicles.length === 0) return { count: 0 };

      const deleting = toast.loading(`Deleting ${vehicles.length} vehicles…`);
      try {
        await Promise.all(vehicles.map((v) => deleteVehicleRequest(v.id)));
        toast.dismiss(deleting);
        return { count: vehicles.length };
      } catch (error) {
        toast.dismiss(deleting);
        throw error;
      }
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
      toast.success(`${count} vehicle${count === 1 ? "" : "s"} deleted`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to delete some vehicles";
      toast.error(message);
    },
  });
}
