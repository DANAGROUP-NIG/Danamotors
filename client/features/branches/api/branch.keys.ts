export const branchKeys = {
  all: ["branches"] as const,
  lists: () => [...branchKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) =>
    [...branchKeys.lists(), params] as const,
  details: () => [...branchKeys.all, "detail"] as const,
  detail: (id: string) => [...branchKeys.details(), id] as const,
};
