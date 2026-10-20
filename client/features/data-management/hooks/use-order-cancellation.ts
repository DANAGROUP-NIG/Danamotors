import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "@/features/inventory/api/inventory.keys";
import { notificationKeys } from "@/features/notification/api/notification.keys";
import { partSaleKeys } from "@/features/part-sale/api/part-sale.api";
import { partSaleErrorMessage } from "@/features/part-sale/hooks/use-part-sale";
import { indentKeys } from "@/features/stock-transfers/api/indent.keys";
import { cancelLinesRequest, getPendingOrdersRequest, orderCancellationKeys } from "../api/order-cancellation.api";
import { CANCELLATION_KINDS, type CancellationKind } from "../lib/order-cancellation";
import type { PendingOrderFilters } from "../types/order-cancellation.types";

export function usePendingOrders(kind: CancellationKind, filters: PendingOrderFilters, enabled: boolean) {
  return useQuery({
    queryKey: orderCancellationKeys.pending(kind, filters),
    queryFn: () => getPendingOrdersRequest(kind, filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Cancelling releases picked stock and changes the orders, so their lists and stock refresh too. */
export function useCancelLines(kind: CancellationKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineIds, remark }: { lineIds: string[]; remark: string }) => cancelLinesRequest(kind, lineIds, remark),
    onSuccess: ({ units, documents }) => {
      for (const key of [orderCancellationKeys.all, partSaleKeys.all, indentKeys.all, inventoryKeys.all, notificationKeys.all]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      const document = CANCELLATION_KINDS[kind].document;
      toast.success(`${units} unit(s) cancelled on ${documents.length} ${document}(s): ${documents.map((d) => d.number).join(", ")}`);
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to cancel the lines")),
  });
}
