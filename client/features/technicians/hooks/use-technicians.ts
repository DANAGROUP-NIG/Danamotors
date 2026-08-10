import { useQuery } from "@tanstack/react-query";
import { technicianKeys } from "../api/technician.keys";
import { getTechniciansRequest } from "../api/technician.api";

type UseTechniciansParams = {
  page?: number;
  limit?: number;
  branchId?: string;
  search?: string;
};

export function useTechnicians(params?: UseTechniciansParams) {
  return useQuery({
    queryKey: technicianKeys.list(params),
    queryFn: () => getTechniciansRequest(params),
  });
}
