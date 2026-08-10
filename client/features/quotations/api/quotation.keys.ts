export const quotationKeys = {
  all: ["quotations"] as const,
  lists: () => [...quotationKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) => [...quotationKeys.lists(), params] as const,
};
