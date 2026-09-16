import { useQuery } from "@tanstack/react-query";
import { notificationKeys } from "../api/notification.keys";
import { getUnreadCountRequest } from "../api/notification.api";
import { apiGet } from '@/lib/api/apiClient';
import { API_ROUTES } from '@/lib/constants/apiRoutes';

export function useUnreadCount(branchId?: string) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(branchId),
    queryFn: () => getUnreadCountRequest({ branchId }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}


export function useUnreadNotificationCount() {
  return useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn:  () => apiGet<{ count: number }>(API_ROUTES.notifications.unreadCount),
    refetchInterval: 30_000,  // poll every 30 seconds
    staleTime: 15_000,
  });
}
