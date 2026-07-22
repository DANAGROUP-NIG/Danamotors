"use client";

import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Clock,
  ClipboardList,
  Car,
  ArrowDown,
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
    </div>
  );
}

export default function StoreManagerDashboard() {
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
            Inventory overview — stock levels & parts management
          </p>
        </div>
        <button
          onClick={() => router.push("/inventory")}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition hover:bg-primary/90"
        >
          <Package className="size-4" />
          View Inventory
        </button>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/inventory"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Package className="size-4 text-muted-foreground" />
          Spare Parts
        </a>
        <a
          href="/job-cards"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <ClipboardList className="size-4 text-muted-foreground" />
          Job Cards
        </a>
        <a
          href="/vehicles"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Car className="size-4 text-muted-foreground" />
          Vehicles
        </a>
      </div>

      {/* Inventory alert banner */}
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
                {data.inventoryAlerts} item{data.inventoryAlerts !== 1 ? "s" : ""} below
                reorder level
              </p>
              <p className="text-xs text-amber-700">
                Restock needed — review and create purchase requests before the next service
                day.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-emerald-900">
                All stock levels are healthy
              </p>
              <p className="text-xs text-emerald-700">
                Every part is above its minimum stock threshold.
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
          {data.inventoryAlerts > 0 ? "Review low stock →" : "View inventory →"}
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Low Stock Alerts */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Low Stock Alerts</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-amber-50">
              <AlertTriangle className="size-4 text-amber-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.inventoryAlerts}</p>
        </div>

        {/* Active Jobs (parts demand indicator) */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Active Jobs</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-orange-50">
              <Wrench className="size-4 text-orange-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.inProgressJobs}</p>
        </div>

        {/* Total Jobs */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Total Jobs</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-blue-50">
              <ClipboardList className="size-4 text-blue-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.totalJobs}</p>
        </div>

        {/* Completed Jobs */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Completed</p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-green-50">
              <CheckCircle2 className="size-4 text-green-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{data.completedJobs}</p>
        </div>
      </div>

      {/* Parts demand context */}
      <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-foreground">
          Parts Demand Context
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Active jobs may require spare parts. Keep an eye on stock levels to avoid service
          delays.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-[#e8edf3] p-3">
            <span className="inline-grid size-9 shrink-0 place-items-center rounded-lg bg-orange-50">
              <Clock className="size-4 text-orange-500" />
            </span>
            <div>
              <p className="text-lg font-extrabold text-foreground">{data.inProgressJobs}</p>
              <p className="text-[11px] text-muted-foreground">In-progress (may need parts)</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[#e8edf3] p-3">
            <span className="inline-grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50">
              <ArrowDown className="size-4 text-amber-500" />
            </span>
            <div>
              <p className="text-lg font-extrabold text-foreground">{data.inventoryAlerts}</p>
              <p className="text-[11px] text-muted-foreground">Parts below reorder level</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[#e8edf3] p-3">
            <span className="inline-grid size-9 shrink-0 place-items-center rounded-lg bg-green-50">
              <CheckCircle2 className="size-4 text-green-600" />
            </span>
            <div>
              <p className="text-lg font-extrabold text-foreground">{data.completedJobs}</p>
              <p className="text-[11px] text-muted-foreground">Jobs completed (parts used)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
