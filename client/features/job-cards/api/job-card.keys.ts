export const jobCardKeys = {
  all: ["jobCards"] as const,
  lists: () => [...jobCardKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) =>
    [...jobCardKeys.lists(), params] as const,
  details: () => [...jobCardKeys.all, "detail"] as const,
  detail: (id: string) => [...jobCardKeys.details(), id] as const,
  workspace: (id: string) => [...jobCardKeys.detail(id), "workspace"] as const,
  board: (query: string) => [...jobCardKeys.all, "board", query] as const,
};
