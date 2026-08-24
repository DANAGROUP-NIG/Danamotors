export const purchasingKeys = {
  all: ["purchasing"] as const,
  lists: () => [...purchasingKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) => [...purchasingKeys.lists(), params] as const,
};
