"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Wrench, Car, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import ModalFame from "@/components/modals/ModalFame";
import { JobCardCreateForm } from "@/features/job-cards";
import ReceptionistDashboard from "@/features/dashboard/components/ReceptionistDashboard";
import ReceptionManagerDashboard from "@/features/dashboard/components/ReceptionManagerDashboard";
import StoreManagerDashboard from "@/features/dashboard/components/StoreManagerDashboard";

import { DashboardWelcomeHeader } from "@/features/dashboard/components/common/DashboardWelcomeHeader";
import { InventoryAlertBanner } from "@/features/dashboard/components/common/InventoryAlertBanner";
import { DashboardKpiCard } from "@/features/dashboard/components/common/DashboardKpiCard";
import { RevenueChartCard } from "@/features/dashboard/components/common/RevenueChartCard";
import { JobsByStatusCard } from "@/features/dashboard/components/common/JobsByStatusCard";
import { TopTechniciansCard } from "@/features/dashboard/components/common/TopTechniciansCard";
import EnquiryTriageWidget from "@/features/enquiry/components/EnquiryTriageWidget";
import { DashboardFallbackState } from "@/features/dashboard/components/common/DashboardFallbackState";
import { DashboardSkeleton } from "@/features/dashboard/components/common/DashboardSkeleton";
import { useDashboardStats } from "@/features/dashboard/hooks/useDashboardStats";

import {
  FINANCE_ROLES,
  WORKSHOP_ROLES,
  MANAGE_ROLES,
  INVENTORY_MANAGER_ROLES,
  SERVICE_CREATE_ROLES,
} from "@/features/auth/roles";

import { SPARKLINES } from "@/constant";

function formatNaira(n: number) {
  return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function DashboardPage() {
  const { user, hasAccess, isReceptionist, isReceptionManager, isStoreManager } = useAuth();
  const [showNewJobCard, setShowNewJobCard] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }));
  }, []);

  const { data: stats, isLoading, isError } = useDashboardStats();

  const canSeeFinance = hasAccess(FINANCE_ROLES);
  const canSeeWorkshop = hasAccess(WORKSHOP_ROLES);
  const canManage = hasAccess(MANAGE_ROLES);
  const canSeeInventory = hasAccess(INVENTORY_MANAGER_ROLES);
  const canCreateJob = hasAccess(SERVICE_CREATE_ROLES);

  const kpiCount = [
    canSeeFinance,
    canSeeWorkshop,
    canSeeWorkshop,
    canSeeWorkshop,
  ].filter(Boolean).length;

  // Reception managers get their own dedicated dashboard
  if (isReceptionManager) {
    return <ReceptionManagerDashboard />;
  }

  // Receptionists get their own dedicated dashboard
  if (isReceptionist) {
    return <ReceptionistDashboard />;
  }

  // Store managers get their own inventory-focused dashboard
  if (isStoreManager) {
    return <StoreManagerDashboard />;
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError || !stats) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <DashboardWelcomeHeader user={user} today={today} />
        <DashboardFallbackState />
      </div>
    );
  }

  const revenueChartTotal = stats.revenueChart.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        {/* Page Header */}
        <DashboardWelcomeHeader
          user={user}
          today={today}
          canCreateJob={canCreateJob}
          onNewJobCard={() => setShowNewJobCard(true)}
        />

        {/* Inventory Alert Banner */}
        {canSeeInventory && <InventoryAlertBanner alertsCount={stats.inventoryAlerts} />}

        {/* KPI Grid */}
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
                value={formatNaira(stats.todayRevenue)}
                delta={stats.revenueDelta}
                up={stats.revenueDelta >= 0}
                icon={TrendingUp}
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                sparkData={SPARKLINES.revenue}
                sparkColor="#10b981"
              />
            )}
            {canSeeWorkshop && (
              <DashboardKpiCard
                label="Total Jobs"
                value={String(stats.totalJobs)}
                delta={stats.jobsDelta}
                up={stats.jobsDelta >= 0}
                icon={Wrench}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                sparkData={SPARKLINES.jobs}
                sparkColor="#2563eb"
              />
            )}
            {canSeeWorkshop && (
              <DashboardKpiCard
                label="Vehicles In Progress"
                value={String(stats.inProgressJobs)}
                delta={stats.inProgressDelta}
                up={stats.inProgressDelta >= 0}
                icon={Car}
                iconBg="bg-orange-50"
                iconColor="text-orange-500"
                sparkData={SPARKLINES.inProgress}
                sparkColor="#f97316"
              />
            )}
            {canSeeWorkshop && (
              <DashboardKpiCard
                label="Completed Jobs"
                value={String(stats.completedJobs)}
                delta={stats.completedDelta}
                up={stats.completedDelta >= 0}
                icon={CheckCircle2}
                iconBg="bg-green-50"
                iconColor="text-green-600"
                sparkData={SPARKLINES.completed}
                sparkColor="#22c55e"
              />
            )}
          </div>
        )}

        {/* Charts & Technicians Section */}
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
                data={stats.revenueChart}
                totalFormatted={formatNaira(revenueChartTotal)}
              />
            )}

            {canSeeWorkshop && (
              <JobsByStatusCard
                data={stats.jobsByStatus}
                totalJobs={stats.totalJobs}
              />
            )}

            {canManage && (
              <TopTechniciansCard technicians={stats.topTechnicians} />
            )}
          </div>
        )}

        {/* Triage widget */}
        <div>
          <EnquiryTriageWidget />
        </div>

        {/* Fallback for unauthorized/viewers */}
        {!canSeeFinance && !canSeeWorkshop && !canManage && (
          <DashboardFallbackState />
        )}
      </div>

      <ModalFame
        isOpen={showNewJobCard}
        onClose={() => setShowNewJobCard(false)}
        title="Create Job Card"
      >
        <JobCardCreateForm onSuccess={() => setShowNewJobCard(false)} />
      </ModalFame>
    </>
  );
}
