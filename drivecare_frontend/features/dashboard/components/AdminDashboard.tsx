"use client";

import { TrendingUp, Wrench, Car, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { FINANCE_ROLES, WORKSHOP_ROLES, MANAGE_ROLES } from "@/features/auth/roles";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useEffect, useState } from "react";

import { DashboardWelcomeHeader } from "./common/DashboardWelcomeHeader";
import { InventoryAlertBanner } from "./common/InventoryAlertBanner";
import { DashboardKpiCard } from "./common/DashboardKpiCard";
import { RevenueChartCard } from "./common/RevenueChartCard";
import { JobsByStatusCard } from "./common/JobsByStatusCard";
import { TopTechniciansCard } from "./common/TopTechniciansCard";
import { DashboardSkeleton } from "./common/DashboardSkeleton";

function fmtFull(n: number) {
  return `₦${n.toLocaleString()}`;
}

export default function AdminDashboard() {
  const { user, hasAccess } = useAuth();
  const { data, isLoading, isError } = useDashboardStats();
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }));
  }, []);

  const canSeeFinance = hasAccess(FINANCE_ROLES);
  const canSeeWorkshop = hasAccess(WORKSHOP_ROLES);
  const canManage = hasAccess(MANAGE_ROLES);
  const canSeeInventory = hasAccess(MANAGE_ROLES);
  const canCreateJob = hasAccess(WORKSHOP_ROLES);

  const kpiCount = [
    canSeeFinance,
    canSeeWorkshop,
    canSeeWorkshop,
    canSeeWorkshop,
  ].filter(Boolean).length;

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e8edf3] bg-white py-16 text-center shadow-sm m-4 lg:m-6">
        <span className="inline-grid size-14 place-items-center rounded-full bg-red-50">
          <AlertTriangle className="size-6 text-red-400" />
        </span>
        <p className="text-sm font-semibold text-foreground">
          Failed to load dashboard data
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Please check your connection and try again.
        </p>
      </div>
    );
  }

  const totalJobs = data.jobsByStatus.reduce((s, d) => s + d.value, 0);

  const revenueSparkline = data.revenueChart.map((r) => ({
    v: r.value / 1_000_000,
  }));
  const jobsSparkline =
    data.jobsByStatus.length > 0
      ? [
          { v: totalJobs },
          { v: totalJobs },
          { v: totalJobs },
          { v: totalJobs },
          { v: totalJobs },
          { v: totalJobs },
          { v: totalJobs },
        ]
      : [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <DashboardWelcomeHeader
        user={user}
        today={today}
        canCreateJob={canCreateJob}
      />

      {/* Inventory alert */}
      {canSeeInventory && (
        <InventoryAlertBanner alertsCount={data.inventoryAlerts} />
      )}

      {/* KPI row */}
      {kpiCount > 0 && (
        <div
          className={cn(
            "grid gap-4 lg:gap-5",
            kpiCount === 4 && "grid-cols-2 lg:grid-cols-4",
            kpiCount === 3 && "grid-cols-2 lg:grid-cols-3",
            kpiCount === 2 && "grid-cols-2",
            kpiCount === 1 && "grid-cols-1 max-w-xs"
          )}
        >
          {canSeeFinance && (
            <DashboardKpiCard
              label="Today's Revenue"
              value={fmtFull(data.todayRevenue)}
              delta={data.revenueDelta}
              up={data.revenueDelta >= 0}
              icon={TrendingUp}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              sparkData={
                revenueSparkline.length > 0
                  ? revenueSparkline
                  : [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }]
              }
              sparkColor="#10b981"
            />
          )}
          {canSeeWorkshop && (
            <DashboardKpiCard
              label="Total Jobs"
              value={String(data.totalJobs)}
              delta={data.jobsDelta}
              up={data.jobsDelta >= 0}
              icon={Wrench}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              sparkData={jobsSparkline}
              sparkColor="#2563eb"
            />
          )}
          {canSeeWorkshop && (
            <DashboardKpiCard
              label="Vehicles In Progress"
              value={String(data.inProgressJobs)}
              delta={data.inProgressDelta}
              up={data.inProgressDelta >= 0}
              icon={Car}
              iconBg="bg-orange-50"
              iconColor="text-orange-500"
              sparkData={jobsSparkline}
              sparkColor="#f97316"
            />
          )}
          {canSeeWorkshop && (
            <DashboardKpiCard
              label="Completed Jobs"
              value={String(data.completedJobs)}
              delta={data.completedDelta}
              up={data.completedDelta >= 0}
              icon={CheckCircle2}
              iconBg="bg-green-50"
              iconColor="text-green-600"
              sparkData={jobsSparkline}
              sparkColor="#22c55e"
            />
          )}
        </div>
      )}

      {/* Charts + Technicians row */}
      {(canSeeFinance || canSeeWorkshop || canManage) && (
        <div
          className={cn(
            "grid gap-5",
            canSeeFinance && canSeeWorkshop && canManage
              ? "lg:grid-cols-[1.4fr_0.9fr_0.9fr]"
              : canSeeFinance && canSeeWorkshop
              ? "lg:grid-cols-2"
              : canSeeWorkshop && canManage
              ? "lg:grid-cols-[1.4fr_0.9fr]"
              : "lg:grid-cols-1"
          )}
        >
          {canSeeFinance && (
            <RevenueChartCard
              data={data.revenueChart}
              totalFormatted={fmtFull(data.todayRevenue)}
              timeRangeOptions={[]}
            />
          )}

          {canSeeWorkshop && (
            <JobsByStatusCard
              data={data.jobsByStatus}
              totalJobs={totalJobs}
            />
          )}

          {canManage && (
            <TopTechniciansCard technicians={data.topTechnicians} />
          )}
        </div>
      )}
    </div>
  );
}
