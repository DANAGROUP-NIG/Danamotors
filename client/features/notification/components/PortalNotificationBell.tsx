"use client";
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePortalNotifications } from '../hooks/use-portal-notifications';
export function PortalNotificationBell() {
  const { query, read } = usePortalNotifications();
  return <details className="relative ml-auto">
    <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md p-2" aria-label={`Notifications, ${query.data?.unread ?? 0} unread`}><Bell className="size-5" />{(query.data?.unread ?? 0) > 0 && <span className="rounded-full bg-primary px-2 text-sm text-primary-foreground">{query.data?.unread}</span>}</summary>
    <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-xl">
      <h2 className="mb-3 font-semibold">Notifications</h2>
      {query.isLoading && <p className="text-sm text-muted-foreground">Loading notifications?</p>}
      {query.isError && <p role="alert" className="text-sm text-destructive">Could not load notifications. <Button variant="outline" onClick={() => query.refetch()}>Retry</Button></p>}
      {!query.isLoading && !query.isError && !query.data?.notifications.length && <p className="text-sm text-muted-foreground">No notifications yet.</p>}
      {query.data?.notifications.map(notification => <div key={notification.id} className="space-y-1 border-b border-border py-3 text-sm"><p className="font-medium">{notification.title}</p><p>{notification.message}</p><p className="text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</p>{notification.link && <Link className="underline" href={notification.link} onClick={() => read.mutate(notification.id)}>View job card</Link>}{!notification.readAt && <Button variant="outline" size="sm" disabled={read.isPending} onClick={() => read.mutate(notification.id)}>Mark read</Button>}</div>)}
      {read.isError && <p role="alert" className="text-sm text-destructive">Could not mark notification read. Please retry.</p>}
    </div>
  </details>;
}
