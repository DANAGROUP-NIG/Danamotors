import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { vehicleKeys } from "../api/vehicle.keys";
import { getVehiclesRequest } from "../api/vehicle.api";

type UseVehiclesParams = {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
};

export function useVehicles(params?: UseVehiclesParams) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  return useQuery({
    queryKey: vehicleKeys.list(params),
    queryFn: () => getVehiclesRequest(params),
    enabled: isHydrated && isAuthenticated,
  });
}
