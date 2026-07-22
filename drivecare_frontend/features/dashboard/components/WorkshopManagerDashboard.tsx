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
  AlertTriangle,
  Car,
  TrendingUp,
  ClipboardList,
  Package,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDashboardStats } from "../hooks/useDashboardStats";

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
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 rounded-xl border border-[#e8edf3] bg-white p-5" />
        <div className="h-64 rounded-xl border border-[#e8edf3] bg-white p-5" />
      </div>
    </div>
  );
}

export default function WorkshopManagerDashboard() {
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

  const totalJobs = data.jobsByStatus.reduce((s, d) => s + d.value, 0);
  const jobsByStatus = data.jobsByStatus.length > 0
    ? data.jobsByStatus
    : [{ name: "No Jobs", value: 1, color: "#e2e8f0" }];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back, {user?.firstName} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Workshop overview — job cards, technicians & inventory
          </p>
        </div>
        <button
          onClick={() => router.push("/job-cards")}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition hover:bg-primary/90"
        >
          <ClipboardList className="size-4" />
          View Job Cards
        </button>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/job-cards"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <ClipboardList className="size-4 text-muted-foreground" />
          Job Cards
        </a>
        <a
          href="/inventory"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Package className="size-4 text-muted-foreground" />
          Inventory
        </a>
        <a
          href="/customers"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Users className="size-4 text-muted-foreground" />
          Customers
        </a>
      </div>

      {/* Inventory alert */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border px-4 py-3",
          data.inventoryAlerts > 0
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50",
        )}
      >
        {data.inventoryAlerts > 0 ? (
          <AlertTriangle className="size-5 shrink-0 text-amber-500" />
        ) : (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
        )}
        <div className="flex-1">
          {data.inventoryAlerts > 0 ? (
            <>
              <p className="text-sm font-semibold text-amber-900">
                {data.inventoryAlerts} inventory alert{data.inventoryAlerts !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-amber-700">
                Items at or below reorder level — review before next service day.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-emerald-900">
                Inventory is fully stocked
              </p>
              <p className="text-xs text-emerald-700">
                All items are above minimum stock levels.
              </p>
            </>
          )}
        </div>
        <a
          href="/inventory"
          className={cn(
            "shrink-0 text-xs font-bold hover:underline",
            data.inventoryAlerts > 0 ? "text-amber-700" : "text-emerald-700",
          )}
        >
          {data.inventoryAlerts > 0 ? "View low stock items →" : "View inventory →"}
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total Jobs */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Total Jobs</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-blue-50">
              <Wrench className="size-4 text-blue-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.totalJobs}</p>
        </div>

        {/* In Progress */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">In Progress</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-orange-50">
              <Clock className="size-4 text-orange-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.inProgressJobs}</p>
        </div>

        {/* Completed */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Completed</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-green-50">
              <CheckCircle2 className="size-4 text-green-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.completedJobs}</p>
        </div>

        {/* Inventory Alerts */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Low Stock Alerts</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-amber-50">
              <Package className="size-4 text-amber-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.inventoryAlerts}</p>
        </div>
      </div>

      {/* Charts + Top Technicians */}
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Jobs by Status donut */}
        <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-foreground">Jobs by Status</p>
          {totalJobs > 0 ? (
            <>
              <div className="flex items-center gap-6">
                <div className="relative flex items-center justify-center">
                  <PieChart width={180} height={180}>
                    <Pie
                      data={jobsByStatus}
                      cx={87}
                      cy={87}
                      innerRadius={58}
                      outerRadius={82}
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {jobsByStatus.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold text-foreground">{totalJobs}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">Total Jobs</span>
                  </div>
                </div>
                <ul className="flex flex-col gap-2">
                  {jobsByStatus.map((s) => (
                    <li key={s.name} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="text-sm text-muted-foreground">{s.name}</span>
                      <span className="ml-auto text-sm font-semibold text-foreground">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
              No job data available
            </div>
          )}
        </div>

        {/* Top Technicians */}
        <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Top Technicians</p>
          </div>
          {data.topTechnicians.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {data.topTechnicians.map((t) => (
                <li key={t.name} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-center text-xs font-bold text-muted-foreground">
                    {t.rank}
                  </span>
                  <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t.jobs} Jobs</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      t.rate >= 90
                        ? "bg-emerald-50 text-emerald-700"
                        : t.rate >= 80
                          ? "bg-blue-50 text-blue-700"
                          : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {t.rate}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
              No technician data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
