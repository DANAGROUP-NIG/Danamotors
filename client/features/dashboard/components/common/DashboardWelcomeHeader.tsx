"use client";

import { Calendar, Plus } from "lucide-react";
interface DashboardWelcomeUser {
  firstName?: string;
  role?: string;
}

interface DashboardWelcomeHeaderProps {
  user: DashboardWelcomeUser | null;
  today: string;
  canCreateJob?: boolean;
  onNewJobCard?: () => void;
}

export function DashboardWelcomeHeader({
  user,
  today,
  canCreateJob = false,
  onNewJobCard,
}: DashboardWelcomeHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground capitalize">
          {user?.role} · {today}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted">
          <Calendar className="size-4 text-muted-foreground" />
          {today}
        </button>
        {canCreateJob && onNewJobCard && (
          <button
            onClick={onNewJobCard}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New Job Card
          </button>
        )}
      </div>
    </div>
  );
}
