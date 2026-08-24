import { useQuery } from "@tanstack/react-query";
import { quotationKeys } from "../api/quotation.keys";
import { getQuotationsRequest } from "../api/quotation.api";

type UseQuotationsParams = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
};

export function useQuotations(params?: UseQuotationsParams) {
  return useQuery({
    queryKey: quotationKeys.list(params),
    queryFn: () => getQuotationsRequest(params),
  });
}
