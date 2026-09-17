"use client";

import { Activity, FileClock, MousePointerClick, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuditStats } from "../hooks/use-audit-stats";

export function AuditStatsCards() {
  const { data, isLoading, isError } = useAuditStats();
  const cards = [
    { label: "Total Entries", value: data?.totalLogs ?? 0, icon: FileClock },
    { label: "Today's Activity", value: data?.todayCount ?? 0, icon: Activity },
    { label: "Top Action", value: data?.topActions?.[0]?.action?.replaceAll("_", " ") ?? "—", icon: MousePointerClick },
    { label: "Most Active User", value: data?.topUsers?.[0]?.name ?? "—", icon: UserRound },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => (
        <Card key={label} className="rounded-xl border-[#e8edf3] bg-white">
          <CardContent className="flex items-start justify-between p-5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              {isLoading ? <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" /> : (
                <p className="mt-1 truncate text-xl font-bold" title={String(value)}>{isError ? "Unavailable" : value}</p>
              )}
            </div>
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-4" /></span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
