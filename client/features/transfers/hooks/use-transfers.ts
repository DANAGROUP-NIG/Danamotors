import { useQuery } from "@tanstack/react-query";
import { transferKeys } from "../api/transfer.keys";
import { getTransfersRequest } from "../api/transfer.api";

export function useTransfers(params?: {
  status?: string;
  requestingBranchId?: string;
  sourceBranchId?: string;
}) {
  return useQuery({
    queryKey: transferKeys.list(params),
    queryFn: () => getTransfersRequest(params),
  });
}
