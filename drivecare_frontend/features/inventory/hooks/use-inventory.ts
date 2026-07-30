import { useQuery } from "@tanstack/react-query";
import { inventoryKeys } from "../api/inventory.keys";
import { getInventoryRequest } from "../api/inventory.api";

type UseInventoryParams = {
  page?: number;
  pageSize?: number;
  category?: string;
};

export function useInventory(params?: UseInventoryParams) {
  return useQuery({
    queryKey: inventoryKeys.list(params as Record<string, unknown>),
    queryFn: () => getInventoryRequest(params),
  });
}
