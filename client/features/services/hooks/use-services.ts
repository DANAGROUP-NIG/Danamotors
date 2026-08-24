import { useQuery } from "@tanstack/react-query";
import { servicesKeys } from "../api/service-catalog.keys";
import { getServicesRequest } from "../api/service-catalog.api";

type UseServicesParams = {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  isActive?: boolean;
};

export function useServices(params?: UseServicesParams) {
  return useQuery({
    queryKey: servicesKeys.list(params),
    queryFn: () => getServicesRequest(params),
  });
}
