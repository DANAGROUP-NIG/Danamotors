import { useQuery } from "@tanstack/react-query";
import { invoiceKeys } from "../api/invoice.keys";
import { getInvoiceRequest } from "../api/invoice.api";

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => getInvoiceRequest(id),
    enabled: !!id,
  });
}
