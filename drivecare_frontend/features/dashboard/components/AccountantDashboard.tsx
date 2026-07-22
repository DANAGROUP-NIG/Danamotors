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
  DollarSign,
  FileText,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
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

export default function AccountantDashboard() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6 animate-pulse">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl border border-[#e8edf3] bg-white p-5">
              <div className="space-y-3">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="h-7 w-24 rounded bg-slate-200" />
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

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Financial overview at a glance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Monthly Revenue */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Monthly Revenue</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-emerald-50">
              <TrendingUp className="size-4 text-emerald-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{fmtFull(data.monthlyRevenue)}</p>
        </div>

        {/* Total Outstanding */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-amber-50">
              <DollarSign className="size-4 text-amber-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{fmtFull(data.totalOutstanding)}</p>
        </div>

        {/* Open Invoices */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Open Invoices</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-blue-50">
              <FileText className="size-4 text-blue-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.openInvoices}</p>
        </div>

        {/* Overdue */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Overdue</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-red-50">
              <Clock className="size-4 text-red-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.overdueInvoices}</p>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-sm font-semibold text-foreground">Revenue Trend (7 Days)</p>
          <p className="mt-0.5 text-2xl font-extrabold text-foreground">
            {fmtFull(data.todayRevenue)} <span className="text-xs font-medium text-muted-foreground">today</span>
          </p>
        </div>
        {data.revenueChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.revenueChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="accRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#accRevGrad)"
                dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#10b981" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
            No revenue data available
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/finance"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <DollarSign className="size-4 text-muted-foreground" />
          Finance Overview
        </a>
        <a
          href="/reports"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <FileText className="size-4 text-muted-foreground" />
          Reports
        </a>
        <a
          href="/purchasing"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <CheckCircle2 className="size-4 text-muted-foreground" />
          Purchasing
        </a>
      </div>
    </div>
  );
}
