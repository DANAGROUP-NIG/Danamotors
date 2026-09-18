"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "../api/inventory.keys";
import { deleteInventoryItemRequest } from "../api/inventory.api";
import type { BranchStockItem } from "../types/inventory.types";

interface ApiErrorResponse {
  response?: {
    data?: {
      message?: string;
    };
  };
}

function isApiErrorResponse(error: unknown): error is ApiErrorResponse {
  return typeof error === "object" && error !== null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (!isApiErrorResponse(error)) return fallback;
  return error.response?.data?.message || fallback;
}

export function useBulkDeleteInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: BranchStockItem[]) => {
      if (items.length === 0) return { count: 0 };

      const deleting = toast.loading(`Deleting ${items.length} inventory items…`);
      try {
        await Promise.all(items.map((item) => deleteInventoryItemRequest(item.part.id)));
        toast.dismiss(deleting);
        return { count: items.length };
      } catch (error) {
        toast.dismiss(deleting);
        throw error;
      }
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(`${count} item${count === 1 ? "" : "s"} deleted`);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Failed to delete some inventory items"));
    },
  });
}
