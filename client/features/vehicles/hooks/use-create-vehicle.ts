import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customerKeys } from "@/features/customers/api/customer.keys";
import { vehicleKeys } from "../api/vehicle.keys";
import { createVehicleRequest } from "../api/vehicle.api";
import type { CreateVehiclePayload } from "../types/vehicle.types";

export function useCreateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) =>
      createVehicleRequest(payload),
    onSuccess: (_result, payload) => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      if (payload.customerId) {
        queryClient.invalidateQueries({ queryKey: customerKeys.detail(payload.customerId) });
      }
      toast.success("Vehicle added and linked to customer");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to add vehicle";
      toast.error(message);
    },
  });
}
