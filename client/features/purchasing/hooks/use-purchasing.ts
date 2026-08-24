import { useQuery } from "@tanstack/react-query";
import { purchasingKeys } from "../api/purchasing.keys";
import { getPurchasingRequest } from "../api/purchasing.api";

type UsePurchasingParams = {
  page?: number;
  limit?: number;
  status?: string;
};

export function usePurchasing(params?: UsePurchasingParams) {
  return useQuery({
    queryKey: purchasingKeys.list(params),
    queryFn: () => getPurchasingRequest(params),
  });
}
