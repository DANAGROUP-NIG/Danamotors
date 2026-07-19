import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { vehicleKeys } from "../api/vehicle.keys";
import { updateVehicleRequest } from "../api/vehicle.api";
import type { UpdateVehiclePayload } from "../types/vehicle.types";

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateVehiclePayload) =>
      updateVehicleRequest(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
      toast.success("Vehicle updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update vehicle";
      toast.error(message);
    },
  });
}
