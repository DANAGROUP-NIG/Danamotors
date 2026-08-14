"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/headers/page-header";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTablePagination } from "@/components/ui/table-components/DataTablePagination";
import { cn } from "@/lib/utils";
import { useNotifications } from "../hooks/use-notifications";
import { useUnreadCount } from "../hooks/use-unread-count";
import { useMarkNotificationRead } from "../hooks/use-mark-read";
import { useMarkAllNotificationsRead } from "../hooks/use-mark-all-read";
import { useBranchStore } from "@/store/branch.store";
import {
  getNotificationTypeStyle,
  formatRelativeTime,
} from "../lib/notification-style";
import type { AppNotification } from "../types/notification.types";

const PAGE_SIZE = 10;

const FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Unread", value: "unread" },
];

export function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const activeBranch = useBranchStore((s) => s.activeBranch);

  const unreadOnly = filter === "unread";
  const { data, isLoading, isError, isFetching } = useNotifications({
    page,
    limit: PAGE_SIZE,
    unreadOnly: unreadOnly || undefined,
    branchId: activeBranch?.id,
  });
  const { data: unreadData } = useUnreadCount(activeBranch?.id);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = unreadData?.count ?? 0;
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleFilterChange(value: string) {
    setFilter(value);
    setPage(1);
  }

  function handleItemClick(notification: AppNotification) {
    if (!notification.readAt && !markRead.isPending) {
      markRead.mutate(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  const notifications = data?.notifications ?? [];

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Notifications"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "notification" : "notifications"}${unreadOnly ? " (unread)" : ""}`
            : unreadCount > 0
              ? `${unreadCount} unread`
              : undefined
        }
        actions={
          unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          )
        }
      />

      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <DataTableFilterChips
            options={FILTER_OPTIONS}
            selected={filter}
            onChange={handleFilterChange}
          />
          {isFetching && (
            <span className="text-xs text-muted-foreground">Refreshing…</span>
          )}
        </div>

        {isError ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-red-500">
              Failed to load notifications. Check the API connection and try again.
            </p>
          </div>
        ) : isLoading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-4">
                <div className="size-8 animate-pulse rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Bell className="mx-auto size-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              {unreadOnly ? "No unread notifications" : "You're all caught up"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {unreadOnly
                ? "Unread notifications will appear here."
                : "New notifications will appear here."}
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
                      "flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-slate-50",
                      unread && "bg-blue-50/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-grid size-9 shrink-0 place-items-center rounded-full",
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
                      <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500">
                        {notification.message}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {formatRelativeTime(notification.createdAt)} ·{" "}
                        {new Date(notification.createdAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <DataTablePagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          totalPages={totalPages}
          isFetching={isFetching}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}
