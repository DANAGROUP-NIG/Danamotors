import { useQuery } from "@tanstack/react-query";
import { vehicleKeys } from "../api/vehicle.keys";
import { getVehiclesRequest } from "../api/vehicle.api";

type UseVehiclesParams = {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
};

export function useVehicles(params?: UseVehiclesParams) {
  return useQuery({
    queryKey: vehicleKeys.list(params),
    queryFn: () => getVehiclesRequest(params),
  });
}
