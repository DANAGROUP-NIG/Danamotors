import { useQuery } from "@tanstack/react-query";
import { invoiceKeys } from "../api/invoice.keys";
import { getInvoicesRequest } from "../api/invoice.api";

type UseInvoicesParams = {
  branchId?: string;
};

export function useInvoices(params?: UseInvoicesParams) {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: () => getInvoicesRequest(params),
  });
}
