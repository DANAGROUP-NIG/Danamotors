import { useQuery } from "@tanstack/react-query";
import { getVehiclesRequest } from "@/features/vehicles/api/vehicle.api";
import { vehicleKeys } from "@/features/vehicles/api/vehicle.keys";
import type { Vehicle } from "@/features/vehicles/types/vehicle.types";

export function useAllVehicles(opts?: { customerId?: string; branchId?: string }) {
  return useQuery({
    queryKey: [...vehicleKeys.all, "all", opts],
    queryFn: () =>
      getVehiclesRequest({ limit: 500, branchId: opts?.branchId }).then(
        (r) =>
          opts?.customerId
            ? r.vehicles.filter(
                (v: any) =>
                  v.customer?.id === opts.customerId ||
                  v.customerId === opts.customerId,
              )
            : r.vehicles,
      ),
    staleTime: 5 * 60 * 1000,
  });
}

