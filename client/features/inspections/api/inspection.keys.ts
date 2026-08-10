export const inspectionKeys = {
  all: ["inspections"] as const,
  lists: () => [...inspectionKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) => [...inspectionKeys.lists(), params] as const,
};
