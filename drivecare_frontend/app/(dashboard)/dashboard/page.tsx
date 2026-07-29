"use client";

import { useMemo, useState, useEffect } from "react";
import { TrendingUp, Wrench, Car, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AppRole } from "@/features/auth/hooks/use-auth";
import ModalFame from "@/components/modals/ModalFame";
import { JobCardCreateForm } from "@/features/job-cards";
import ReceptionistDashboard from "@/features/dashboard/components/ReceptionistDashboard";
import ReceptionManagerDashboard from "@/features/dashboard/components/ReceptionManagerDashboard";

import { DashboardWelcomeHeader } from "@/features/dashboard/components/common/DashboardWelcomeHeader";
import { InventoryAlertBanner } from "@/features/dashboard/components/common/InventoryAlertBanner";
import { DashboardKpiCard } from "@/features/dashboard/components/common/DashboardKpiCard";
import { RevenueChartCard } from "@/features/dashboard/components/common/RevenueChartCard";
import { JobsByStatusCard } from "@/features/dashboard/components/common/JobsByStatusCard";
import { TopTechniciansCard } from "@/features/dashboard/components/common/TopTechniciansCard";
import { DashboardFallbackState } from "@/features/dashboard/components/common/DashboardFallbackState";

import {
  REVENUE_DATA,
  JOBS_BY_STATUS,
  TOP_TECHNICIANS,
  SPARKLINES,
} from "@/constant";

const FINANCE_ROLES: AppRole[] = ["admin", "accountant"];
const WORKSHOP_ROLES: AppRole[] = ["admin", "technician", "receptionist"];
const MANAGE_ROLES: AppRole[] = ["admin"];

export default function DashboardPage() {
  const { user, hasAccess, isReceptionist, isReceptionManager } = useAuth();
  const [showNewJobCard, setShowNewJobCard] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }));
  }, []);

  const totalJobs = useMemo(
    () => JOBS_BY_STATUS.reduce((s, d) => s + d.value, 0),
    []
  );

  const canSeeFinance = hasAccess(FINANCE_ROLES);
  const canSeeWorkshop = hasAccess(WORKSHOP_ROLES);
  const canManage = hasAccess(MANAGE_ROLES);
  const canSeeInventory = hasAccess(["superadmin", "admin", "storemanager"]);
  const canCreateJob = hasAccess([
    "superadmin",
    "admin",
    "workshopmanager",
    "serviceadviser",
  ]);

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
        {canSeeInventory && <InventoryAlertBanner alertsCount={7} />}

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
                value="₦3,456,789"
                delta="+12.5%"
                up={true}
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
                value="112"
                delta="+8.3%"
                up={true}
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
                value="18"
                delta="-4.2%"
                up={false}
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
                value="72"
                delta="+10.1%"
                up={true}
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
                data={REVENUE_DATA}
                totalFormatted="₦27,589,000"
              />
            )}

            {canSeeWorkshop && (
              <JobsByStatusCard
                data={JOBS_BY_STATUS}
                totalJobs={totalJobs}
              />
            )}

            {canManage && (
              <TopTechniciansCard technicians={TOP_TECHNICIANS} />
            )}
          </div>
        )}

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
