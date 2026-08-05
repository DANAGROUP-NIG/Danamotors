import { useQuery } from "@tanstack/react-query";
import { notificationKeys } from "../api/notification.keys";
import { getUnreadCountRequest } from "../api/notification.api";

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCountRequest,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
