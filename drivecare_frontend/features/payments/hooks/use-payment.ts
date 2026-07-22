import { useQuery } from "@tanstack/react-query";
import { paymentKeys } from "../api/payment.keys";
import { getPaymentRequest } from "../api/payment.api";

export function usePayment(id: string) {
  return useQuery({
    queryKey: paymentKeys.detail(id),
    queryFn: () => getPaymentRequest(id),
    enabled: !!id,
  });
}
