export const repairKeys = {
  all: ["repairs"] as const,
  lists: () => [...repairKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) => [...repairKeys.lists(), params] as const,
};
