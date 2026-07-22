import { useQuery } from "@tanstack/react-query";
import { paymentKeys } from "../api/payment.keys";
import { getPaymentsRequest } from "../api/payment.api";

type UsePaymentsParams = {
  branchId?: string;
};

export function usePayments(params?: UsePaymentsParams) {
  return useQuery({
    queryKey: paymentKeys.list(params),
    queryFn: () => getPaymentsRequest(params),
  });
}
