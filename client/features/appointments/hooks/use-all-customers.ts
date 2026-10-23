import { useQuery } from "@tanstack/react-query";
import { getCustomersRequest } from "@/features/customers/api/customer.api";
import { customerKeys } from "@/features/customers/api/customer.keys";

/** Customers for pickers — all branches, so a customer registered elsewhere can still be served. */
export function useAllCustomers() {
  return useQuery({
    queryKey: [...customerKeys.all, "all"],
    queryFn: () =>
      getCustomersRequest({ limit: 500 }).then((r) => r.customers),
    staleTime: 5 * 60 * 1000,
  });
}
