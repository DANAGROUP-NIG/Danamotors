import { useQuery } from "@tanstack/react-query";
import { notificationKeys } from "../api/notification.keys";
import { getUnreadCountRequest } from "../api/notification.api";

export function useUnreadCount(branchId?: string) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(branchId),
    queryFn: () => getUnreadCountRequest({ branchId }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
