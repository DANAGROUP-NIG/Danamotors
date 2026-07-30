export const purchaseRequestKeys = {
  all: ["purchase-requests"] as const,
  lists: () => [...purchaseRequestKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) => [...purchaseRequestKeys.lists(), params] as const,
  details: () => [...purchaseRequestKeys.all, "detail"] as const,
  detail: (id: string) => [...purchaseRequestKeys.details(), id] as const,
};
