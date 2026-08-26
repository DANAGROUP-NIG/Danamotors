"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useNotifications } from "../hooks/use-notifications";
import type { AppNotification } from "../types/notification.types";

export function NotificationListener() {
  const router = useRouter();
  const previousNotificationsRef = useRef<AppNotification[]>([]);

  // Fetch notifications every 30 seconds (configured in useNotifications)
  const { data } = useNotifications({
    limit: 10,
    unreadOnly: true,
  });

  const notifications = data?.notifications ?? [];

  useEffect(() => {
    const previous = previousNotificationsRef.current;
    
    // Check for new notifications
    if (notifications.length > previous.length) {
      // Find new notifications (those not in previous)
      const newNotifications = notifications.filter(
        (n) => !previous.some((p) => p.id === n.id)
      );

      // Show toast for each new APPOINTMENT_* notification
      newNotifications.forEach((notification) => {
        if (notification.type?.startsWith("APPOINTMENT_")) {
          toast(notification.title, {
            description: notification.message,
            duration: 5000,
            action: {
              label: "View",
              onClick: () => {
                if (notification.link) {
                  router.push(notification.link);
                }
              },
            },
          });
        }
      });
    }

    // Update ref
    previousNotificationsRef.current = notifications;
  }, [notifications, router]);

  return null;
}