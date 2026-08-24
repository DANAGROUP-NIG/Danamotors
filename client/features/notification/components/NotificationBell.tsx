"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getNotificationTypeStyle,
  formatRelativeTime,
} from "../lib/notification-style";
import { useNotifications } from "../hooks/use-notifications";
import { useUnreadCount } from "../hooks/use-unread-count";
import { useMarkNotificationRead } from "../hooks/use-mark-read";
import { useMarkAllNotificationsRead } from "../hooks/use-mark-all-read";
import { useBranchStore } from "@/store/branch.store";
import type { AppNotification } from "../types/notification.types";

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeBranch = useBranchStore((s) => s.activeBranch);

  const { data: listData } = useNotifications({
    page: 1,
    limit: 8,
    branchId: activeBranch?.id,
  });
  const { data: unreadData } = useUnreadCount(activeBranch?.id);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = unreadData?.count ?? 0;
  const notifications = listData?.notifications ?? [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  function handleItemClick(notification: AppNotification) {
    if (!notification.readAt && !markRead.isPending) {
      markRead.mutate(notification.id);
    }
    setOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 inline-grid h-[17px] min-w-[17px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1 text-xs font-medium text-primary transition hover:underline disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto size-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">
                  You&apos;re all caught up
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((notification) => {
                  const style = getNotificationTypeStyle(notification.type);
                  const Icon = style.icon;
                  const unread = !notification.readAt;
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(notification)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50",
                          unread && "bg-blue-50/40",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 inline-grid size-8 shrink-0 place-items-center rounded-full",
                            style.classes,
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-sm",
                                unread
                                  ? "font-semibold text-slate-800"
                                  : "font-medium text-slate-600",
                              )}
                            >
                              {notification.title}
                            </span>
                            {unread && (
                              <span
                                className="size-2 shrink-0 rounded-full bg-blue-500"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">
                            {notification.message}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="flex w-full items-center justify-center gap-1 text-xs font-medium text-primary transition hover:underline"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
