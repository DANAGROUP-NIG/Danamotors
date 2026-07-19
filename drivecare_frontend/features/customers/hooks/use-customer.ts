import { useQuery } from "@tanstack/react-query";
import { customerKeys } from "../api/customer.keys";
import { getCustomerRequest } from "../api/customer.api";

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomerRequest(id),
    enabled: !!id,
  });
}
