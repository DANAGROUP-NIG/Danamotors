import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { vehicleKeys } from "../api/vehicle.keys";
import { createVehicleRequest } from "../api/vehicle.api";
import type { CreateVehiclePayload } from "../types/vehicle.types";

export function useCreateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) =>
      createVehicleRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      toast.success("Vehicle added");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to add vehicle";
      toast.error(message);
    },
  });
}
