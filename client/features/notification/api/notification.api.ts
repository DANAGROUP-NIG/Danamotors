import { apiGet, apiPatch } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type { NotificationListResponse } from "../types/notification.types";

export async function getNotificationsRequest(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  branchId?: string;
}): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.unreadOnly) query.set("unreadOnly", "true");
  if (params?.branchId) query.set("branchId", params.branchId);
  const qs = query.toString();
  return apiGet<NotificationListResponse>(
    `${API_ROUTES.notifications.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getUnreadCountRequest(params?: {
  branchId?: string;
}): Promise<{ count: number }> {
  const query = new URLSearchParams();
  if (params?.branchId) query.set("branchId", params.branchId);
  const qs = query.toString();
  return apiGet<{ count: number }>(
    `${API_ROUTES.notifications.unreadCount}${qs ? `?${qs}` : ""}`,
  );
}

export async function markNotificationReadRequest(id: string): Promise<null> {
  return apiPatch<null>(API_ROUTES.notifications.markRead(id));
}

export async function markAllNotificationsReadRequest(): Promise<null> {
  return apiPatch<null>(API_ROUTES.notifications.markAllRead);
}
