"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  Wrench,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDashboardStats } from "../hooks/useDashboardStats";

function fmtPct(n: number) {
  return `${n}%`;
}

export default function TechnicianDashboard() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6 animate-pulse">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl border border-[#e8edf3] bg-white p-5">
              <div className="space-y-3">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="h-7 w-16 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e8edf3] bg-white py-16 text-center shadow-sm m-4 lg:m-6">
        <AlertTriangle className="size-6 text-red-400" />
        <p className="text-sm font-semibold">Failed to load dashboard data</p>
      </div>
    );
  }

  const myJobsByStatus = data.myJobsByStatus.length > 0
    ? data.myJobsByStatus
    : [{ name: "No Jobs", value: 1, color: "#e2e8f0" }];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Here&apos;s your work overview for today
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {/* My Assigned Jobs */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">My Assigned Jobs</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-blue-50">
              <Wrench className="size-4 text-blue-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.myAssignedJobs}</p>
        </div>

        {/* Completed */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Completed</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-green-50">
              <CheckCircle2 className="size-4 text-green-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.myCompletedJobs}</p>
        </div>

        {/* Completion Rate */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Completion Rate</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-emerald-50">
              <TrendingUp className="size-4 text-emerald-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{fmtPct(data.myCompletionRate)}</p>
        </div>
      </div>

      {/* My Jobs by Status */}
      <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-foreground">My Jobs by Status</p>
        {data.myJobsByStatus.length > 0 && data.myJobsByStatus[0].name !== "No Jobs" ? (
          <div className="flex items-center gap-6">
            <div className="relative flex items-center justify-center">
              <PieChart width={160} height={160}>
                <Pie
                  data={data.myJobsByStatus}
                  cx={75}
                  cy={75}
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {data.myJobsByStatus.map((entry: { name: string; color: string }) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-foreground">{data.myAssignedJobs}</span>
                <span className="text-[10px] text-muted-foreground">Total</span>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {data.myJobsByStatus.map((s: { name: string; color: string; value: number }) => (
                <li key={s.name} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-sm text-muted-foreground">{s.name}</span>
                  <span className="ml-auto text-sm font-semibold text-foreground">{s.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No jobs assigned yet</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-foreground">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/job-cards"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            <Wrench className="size-4" />
            View Job Cards
          </a>
          <a
            href="/inventory"
            className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            <Clock className="size-4 text-muted-foreground" />
            Check Inventory
          </a>
        </div>
      </div>
    </div>
  );
}
