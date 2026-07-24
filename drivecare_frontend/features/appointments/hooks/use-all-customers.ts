import { useQuery } from "@tanstack/react-query";
import { getCustomersRequest } from "@/features/customers/api/customer.api";
import { customerKeys } from "@/features/customers/api/customer.keys";

export function useAllCustomers(branchId?: string) {
  return useQuery({
    queryKey: [...customerKeys.all, "all", { branchId }],
    queryFn: () =>
      getCustomersRequest({ limit: 500, branchId }).then((r) => r.customers),
    staleTime: 5 * 60 * 1000,
  });
}
