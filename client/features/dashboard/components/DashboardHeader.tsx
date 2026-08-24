export interface IAppProps {}

import { Bell } from 'lucide-react';
import { useUnreadNotificationCount } from '@/features/notification/hooks/use-unread-count';
import Link from 'next/link';

function NotificationBell() {
  const { data } = useUnreadNotificationCount();
  const count = data?.count ?? 0;

  return (
    <Link
      href="/notifications"
      id="notification-bell"
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
      className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

export function DashboardHeader() {
  return (
    <div>
      <NotificationBell />
    </div>
  );
  
}
