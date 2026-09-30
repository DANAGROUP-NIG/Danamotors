import { useQuery } from "@tanstack/react-query";
import { getVehiclesRequest } from "@/features/vehicles/api/vehicle.api";
import { vehicleKeys } from "@/features/vehicles/api/vehicle.keys";

export function useAllVehicles(opts?: { customerId?: string; branchId?: string }) {
  return useQuery({
    queryKey: [...vehicleKeys.all, "all", opts],
    queryFn: () => getVehiclesRequest({
      limit: 500,
      branchId: opts?.branchId,
      customerId: opts?.customerId,
    }).then(response => response.vehicles),
    staleTime: 5 * 60 * 1000,
  });
}

