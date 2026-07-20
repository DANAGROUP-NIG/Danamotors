import { useQuery } from "@tanstack/react-query";
import { customerKeys } from "../api/customer.keys";
import { getCustomersRequest } from "../api/customer.api";

type UseCustomersParams = {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
};

export function useCustomers(params?: UseCustomersParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => getCustomersRequest(params),
  });
}
