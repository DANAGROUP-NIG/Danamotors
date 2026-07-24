import { useQuery } from "@tanstack/react-query";
import { inventoryKeys } from "../api/inventory.keys";
import { getInventoryItemRequest } from "../api/inventory.api";

export function useInventoryItem(id: string) {
  return useQuery({
    queryKey: inventoryKeys.detail(id),
    queryFn: () => getInventoryItemRequest(id),
    enabled: !!id,
  });
}
