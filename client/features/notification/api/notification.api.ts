import { apiGet, apiPatch } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type { NotificationListResponse } from "../types/notification.types";

export async function getNotificationsRequest(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.unreadOnly) query.set("unreadOnly", "true");
  const qs = query.toString();
  return apiGet<NotificationListResponse>(
    `${API_ROUTES.notifications.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getUnreadCountRequest(): Promise<{ count: number }> {
  return apiGet<{ count: number }>(API_ROUTES.notifications.unreadCount);
}

export async function markNotificationReadRequest(id: string): Promise<null> {
  return apiPatch<null>(API_ROUTES.notifications.markRead(id));
}

export async function markAllNotificationsReadRequest(): Promise<null> {
  return apiPatch<null>(API_ROUTES.notifications.markAllRead);
}
