import { useQuery } from "@tanstack/react-query";
import { notificationKeys } from "../api/notification.keys";
import { getNotificationsRequest } from "../api/notification.api";

type UseNotificationsParams = {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  branchId?: string;
};

export function useNotifications(params?: UseNotificationsParams) {
  return useQuery({
    queryKey: notificationKeys.list(params as Record<string, unknown>),
    queryFn: () => getNotificationsRequest(params),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
