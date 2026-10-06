export const indentKeys = {
  all: ["indents"] as const,
  lists: () => [...indentKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) => [...indentKeys.lists(), params] as const,
  details: () => [...indentKeys.all, "detail"] as const,
  detail: (id: string) => [...indentKeys.details(), id] as const,
  partSearch: (params: Record<string, unknown>) => [...indentKeys.all, "part-search", params] as const,
  partLookup: (params: Record<string, unknown>) => [...indentKeys.all, "part-lookup", params] as const,
};
