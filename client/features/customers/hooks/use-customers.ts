import { useQuery } from "@tanstack/react-query";
import { customerKeys } from "../api/customer.keys";
import { getCustomersRequest } from "../api/customer.api";
import type { CustomerCategory } from "../lib/customer-category";

type UseCustomersParams = {
  page?: number;
  limit?: number;
  search?: string;
  category?: CustomerCategory;
  branchId?: string;
};

export function useCustomers(params?: UseCustomersParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => getCustomersRequest(params),
  });
}
