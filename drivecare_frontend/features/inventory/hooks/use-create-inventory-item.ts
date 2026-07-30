import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "../api/inventory.keys";
import { createInventoryItemRequest } from "../api/inventory.api";
import type { SparePartPayload } from "../types/inventory.types";

export function useCreateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SparePartPayload) =>
      createInventoryItemRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      toast.success("Item added to inventory");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to add item";
      toast.error(message);
    },
  });
}
