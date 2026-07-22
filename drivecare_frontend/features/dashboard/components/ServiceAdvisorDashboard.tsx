"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Car,
  Users,
  FileText,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDashboardStats } from "../hooks/useDashboardStats";

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n}`;
}

function fmtFull(n: number) {
  return `₦${n.toLocaleString()}`;
}

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

function RevenueTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#e8edf3] bg-white px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">{fmtFull(payload[0].value)}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 animate-pulse">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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

export default function ServiceAdvisorDashboard() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useDashboardStats();
  const router = useRouter();

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e8edf3] bg-white py-16 text-center shadow-sm m-4 lg:m-6">
        <AlertTriangle className="size-6 text-red-400" />
        <p className="text-sm font-semibold">Failed to load dashboard data</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back, {user?.firstName} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Service overview — appointments, jobs & estimates
          </p>
        </div>
        <button
          onClick={() => router.push("/appointments")}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition hover:bg-primary/90"
        >
          <Plus className="size-4" />
          New Appointment
        </button>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/appointments"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          All Appointments
        </a>
        <a
          href="/customers"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Users className="size-4 text-muted-foreground" />
          Customers
        </a>
        <a
          href="/job-cards"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Wrench className="size-4 text-muted-foreground" />
          Job Cards
        </a>
        <a
          href="/finance"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <FileText className="size-4 text-muted-foreground" />
          Finance
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Today's Bookings */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Today&apos;s Bookings</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-blue-50">
              <CalendarDays className="size-4 text-blue-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.todayBookings}</p>
        </div>

        {/* Pending Appointments */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Pending Approval</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-amber-50">
              <Clock className="size-4 text-amber-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.pendingAppointments}</p>
        </div>

        {/* Active Jobs */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Active Jobs</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-orange-50">
              <Wrench className="size-4 text-orange-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.inProgressJobs}</p>
        </div>

        {/* Open Invoices */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Open Invoices</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-emerald-50">
              <CheckCircle2 className="size-4 text-emerald-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.openInvoices}</p>
        </div>
      </div>

      {/* Upcoming Appointments + Revenue side by side */}
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Upcoming Appointments */}
        <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Upcoming Appointments</p>
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
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Car className="size-3.5" />
                            <span>{apt.vehicle}</span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              apt.status === "Confirmed"
                                ? "bg-green-50 text-green-700"
                                : "bg-amber-50 text-amber-700",
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

        {/* Revenue chart */}
        <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground">Revenue (7 Days)</p>
            <p className="mt-0.5 text-2xl font-extrabold text-foreground">
              {fmtFull(data.todayRevenue)}{" "}
              <span className="text-xs font-medium text-muted-foreground">today</span>
            </p>
          </div>
          {data.revenueChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.revenueChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="saRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => fmt(v)}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<RevenueTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#saRevGrad)"
                  dot={{ r: 3, fill: "#2563eb", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#2563eb" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
              No revenue data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
