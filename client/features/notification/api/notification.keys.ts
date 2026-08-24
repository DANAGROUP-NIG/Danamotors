export const notificationKeys = {
  all: ["notifications"] as const,
  lists: () => [...notificationKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) =>
    [...notificationKeys.lists(), params] as const,
  unreadCount: (branchId?: string) =>
    [...notificationKeys.all, "unread-count", branchId ?? "all"] as const,
  unreadCountAll: () => [...notificationKeys.all, "unread-count"] as const,
};
