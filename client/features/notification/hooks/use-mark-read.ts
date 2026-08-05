import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationKeys } from "../api/notification.keys";
import { markNotificationReadRequest } from "../api/notification.api";

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markNotificationReadRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}
