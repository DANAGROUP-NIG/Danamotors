import { useQuery } from "@tanstack/react-query";
import { transferKeys } from "../api/transfer.keys";
import { getTransferRequest } from "../api/transfer.api";

export function useTransfer(id: string) {
  return useQuery({
    queryKey: transferKeys.detail(id),
    queryFn: () => getTransferRequest(id),
    enabled: !!id,
  });
}
