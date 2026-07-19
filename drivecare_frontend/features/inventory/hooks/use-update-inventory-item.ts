import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "../api/inventory.keys";
import { updateInventoryItemRequest } from "../api/inventory.api";
import type { UpdateInventoryItemPayload } from "../types/inventory.types";

export function useUpdateInventoryItem(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateInventoryItemPayload) =>
      updateInventoryItemRequest(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      toast.success("Item updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to update item";
      toast.error(message);
    },
  });
}
