export const technicianKeys = {
  all: ["technicians"] as const,
  lists: () => [...technicianKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) => [...technicianKeys.lists(), params] as const,
};
