import { useQuery } from "@tanstack/react-query";
import { inventoryKeys } from "../api/inventory.keys";
import { getBranchStockRequest } from "../api/inventory.api";

export function useBranchStock(branchId: string | null) {
  return useQuery({
    queryKey: inventoryKeys.branchStock(branchId ?? ""),
    queryFn: () => getBranchStockRequest(branchId!),
    enabled: !!branchId,
  });
}
