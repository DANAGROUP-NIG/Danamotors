import { useQuery } from "@tanstack/react-query";
import { servicesKeys } from "../api/service-catalog.keys";
import { getServiceRequest } from "../api/service-catalog.api";

export function useService(id: string) {
  return useQuery({
    queryKey: servicesKeys.detail(id),
    queryFn: () => getServiceRequest(id),
    enabled: !!id,
  });
}
