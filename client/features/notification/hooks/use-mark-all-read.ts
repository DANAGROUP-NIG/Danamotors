import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notificationKeys } from "../api/notification.keys";
import { markAllNotificationsReadRequest } from "../api/notification.api";

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsReadRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
      toast.success("All notifications marked as read");
    },
    onError: () => {
      toast.error("Failed to mark notifications as read");
    },
  });
}
