import { useQuery } from "@tanstack/react-query";
import { purchaseRequestKeys } from "../api/purchase-request.keys";
import { getPurchaseRequestsRequest } from "../api/purchase-request.api";

type UsePurchaseRequestsParams = {
  page?: number;
  limit?: number;
  status?: string;
};

export function usePurchaseRequests(params?: UsePurchaseRequestsParams) {
  return useQuery({
    queryKey: purchaseRequestKeys.list(params),
    queryFn: () => getPurchaseRequestsRequest(params),
  });
}
