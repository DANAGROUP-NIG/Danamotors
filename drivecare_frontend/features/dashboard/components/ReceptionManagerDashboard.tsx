"use client";

import { useState } from "react";
import {
  CalendarDays,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDashboardStats } from "../hooks/useDashboardStats";

const TABS = ["Day", "7 Days", "Week", "Month"] as const;
type Tab = (typeof TABS)[number];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function ReceptionManagerDashboard() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useDashboardStats();
  const [activeTab, setActiveTab] = useState<Tab>("Day");
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6 animate-pulse">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl border border-[#e8edf3] bg-white p-5"
            >
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

  const todayDelta =
    data.yesterdayBookings > 0
      ? Math.round(
          ((data.todayBookings - data.yesterdayBookings) /
            data.yesterdayBookings) *
            100 *
            10,
        ) / 10
      : data.todayBookings > 0
        ? 100
        : 0;

  const tabStats: Record<
    Tab,
    { value: number; delta: number; deltaLabel: string }
  > = {
    Day: {
      value: data.todayBookings,
      delta: todayDelta,
      deltaLabel: "vs yesterday",
    },
    "7 Days": {
      value: data.last7DaysBookings,
      delta: data.weekBookingsDelta,
      deltaLabel: "vs previous 7 days",
    },
    Week: {
      value: data.weekBookings,
      delta: data.weekBookingsDelta,
      deltaLabel: "vs last week",
    },
    Month: {
      value: data.monthBookings,
      delta: data.monthBookingsDelta,
      deltaLabel: "vs last month",
    },
  };

  const current = tabStats[activeTab];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back, {user?.firstName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Team Performance Overview
          </p>
        </div>
        <button
          onClick={() => router.push("/appointments")}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition hover:bg-primary/90"
        >
          <ClipboardList className="size-4" />
          View Appointments
        </button>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 rounded-lg border border-[#e8edf3] bg-white p-1 shadow-sm w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-semibold transition",
              activeTab === tab
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total Receptionists */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Total Receptionists
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-violet-50">
              <Users className="size-4 text-violet-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {data.totalReceptionists}
          </p>
        </div>

        {/* Active period bookings */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {activeTab === "Day"
                ? "Today's Bookings"
                : activeTab === "Week"
                  ? "This Week"
                  : activeTab === "7 Days"
                    ? "Last 7 Days"
                    : "This Month"}
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-blue-50">
              <CalendarDays className="size-4 text-blue-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {current.value}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold",
              current.delta >= 0 ? "text-emerald-600" : "text-red-500",
            )}
          >
            {current.delta >= 0 ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {current.delta >= 0 ? "+" : ""}
            {current.delta}% {current.deltaLabel}
          </span>
        </div>

        {/* Pending */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Pending
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-amber-50">
              <Clock className="size-4 text-amber-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {data.pendingAppointments}
          </p>
        </div>

        {/* Active Jobs */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Active Jobs
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-green-50">
              <CheckCircle2 className="size-4 text-green-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {data.inProgressJobs}
          </p>
        </div>
      </div>

      {/* Bookings by status + Receptionist performance */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        {/* Bookings by status */}
        <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-foreground">
            Bookings by Status
          </p>
          {data.bookingsByStatus.length > 0 ? (
            <div className="flex flex-col gap-3">
              {data.bookingsByStatus.map((s) => {
                const total = data.bookingsByStatus.reduce(
                  (sum, item) => sum + item.value,
                  0,
                );
                const pct =
                  total > 0 ? Math.round((s.value / total) * 100) : 0;
                return (
                  <div key={s.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: s.color }}
                        />
                        {s.name}
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        {s.value}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: s.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="size-8 text-slate-300" />
              <p className="text-sm text-muted-foreground">No bookings yet</p>
            </div>
          )}
        </div>

        {/* Receptionist Performance */}
        <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              Receptionist Performance
            </p>
            <span className="text-xs text-muted-foreground">
              {data.receptionistPerformance.length} team member
              {data.receptionistPerformance.length !== 1 ? "s" : ""}
            </span>
          </div>
          {data.receptionistPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e8edf3] text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Branch</th>
                    <th className="pb-2 font-medium text-right">Bookings</th>
                    <th className="pb-2 font-medium text-right">
                      Completion
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {data.receptionistPerformance.map((r) => (
                    <tr key={r.name} className="hover:bg-slate-50">
                      <td className="py-2.5 font-medium text-foreground">
                        {r.name}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {r.branch}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-foreground">
                        {r.appointmentsCreated}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            r.completionRate >= 80
                              ? "bg-green-50 text-green-700"
                              : r.completionRate >= 50
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700",
                          )}
                        >
                          {r.completionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users className="size-8 text-slate-300" />
              <p className="text-sm text-muted-foreground">
                No receptionist data yet
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Appointments */}
      <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            Upcoming Appointments
          </p>
          <a
            href="/appointments"
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all →
          </a>
        </div>
        {data.upcomingAppointments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8edf3] text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium">Vehicle</th>
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {data.upcomingAppointments.map(
                  (apt: {
                    id: string;
                    scheduledAt: string;
                    customerName: string;
                    vehicle: string;
                    branch: string;
                    status: string;
                  }) => (
                    <tr key={apt.id} className="hover:bg-slate-50">
                      <td className="py-2.5">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {fmtTime(apt.scheduledAt)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {fmtDate(apt.scheduledAt)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 font-medium text-foreground">
                        {apt.customerName}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {apt.vehicle}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {apt.branch}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            apt.status === "Confirmed"
                              ? "bg-green-50 text-green-700"
                              : apt.status === "Pending"
                                ? "bg-amber-50 text-amber-700"
                                : apt.status === "Cancelled"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-blue-50 text-blue-700",
                          )}
                        >
                          {apt.status}
                        </span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarDays className="size-8 text-slate-300" />
            <p className="text-sm text-muted-foreground">
              No upcoming appointments
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
