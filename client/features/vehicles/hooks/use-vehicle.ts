import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { vehicleKeys } from "../api/vehicle.keys";
import { getVehicleRequest } from "../api/vehicle.api";

export function useVehicle(id: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  return useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => getVehicleRequest(id),
    enabled: !!id && isHydrated && isAuthenticated,
  });
}
