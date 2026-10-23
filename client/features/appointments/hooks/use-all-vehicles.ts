import { useQuery } from "@tanstack/react-query";
import { getVehiclesRequest } from "@/features/vehicles/api/vehicle.api";
import { vehicleKeys } from "@/features/vehicles/api/vehicle.keys";

/** Vehicles for pickers — all branches, so a vehicle registered elsewhere can still be served. */
export function useAllVehicles(opts?: { customerId?: string }) {
  return useQuery({
    queryKey: [...vehicleKeys.all, "all", opts],
    queryFn: () => getVehiclesRequest({
      limit: 500,
      customerId: opts?.customerId,
    }).then(response => response.vehicles),
    staleTime: 5 * 60 * 1000,
  });
}

