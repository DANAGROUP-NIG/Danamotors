import { useQuery } from "@tanstack/react-query";
import { vehicleKeys } from "../api/vehicle.keys";
import { getVehicleRequest } from "../api/vehicle.api";

export function useVehicle(id: string) {
  return useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => getVehicleRequest(id),
    enabled: !!id,
  });
}
