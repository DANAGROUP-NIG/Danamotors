"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Wrench,
  Car,
  CheckCircle2,
  CalendarDays,
  Users,
  Package,
  ClipboardList,
  UserPlus,
  FileText,
  ArrowRight,
  Shield,
} from "lucide-react";
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

import { SPARKLINES } from "@/constant";

function formatNaira(n: number) {
  return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ─── Quick links shown on the minimal/limited dashboard ────────────────────────
const QUICK_LINKS = [
  { label: "Customers", href: "/customers", icon: Users, color: "bg-emerald-50", iconColor: "text-emerald-600", permission: "customer:read" },
  { label: "Vehicles", href: "/vehicles", icon: Car, color: "bg-blue-50", iconColor: "text-blue-600", permission: "vehicle:read" },
  { label: "Appointments", href: "/appointments", icon: CalendarDays, color: "bg-violet-50", iconColor: "text-violet-600", permission: "appointment:read" },
  { label: "Job Cards", href: "/job-cards", icon: ClipboardList, color: "bg-orange-50", iconColor: "text-orange-600", permission: "jobcard:read" },
  { label: "Inventory", href: "/inventory", icon: Package, color: "bg-amber-50", iconColor: "text-amber-600", permission: "sparepart:read" },
  { label: "Finance", href: "/finance", icon: FileText, color: "bg-rose-50", iconColor: "text-rose-600", permission: "invoice:read" },
  { label: "Users", href: "/users", icon: Shield, color: "bg-slate-100", iconColor: "text-slate-600", permission: "user:read" },
];

export default function DashboardPage() {
  const {
    user,
    hasPermission,
    hasAnyPermission,
    isReceptionist,
    isReceptionManager,
    isStoreManager,
  } = useAuth();
  const [showNewJobCard, setShowNewJobCard] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );
  }, []);

  const { data: stats, isLoading, isError } = useDashboardStats();

  const canSeeFinance = hasPermission("invoice:read");
  const canSeeWorkshop = hasPermission("jobcard:read");
  const canManage = hasPermission("user:read");
  const canSeeInventory = hasPermission("sparepart:read");
  const canCreateJob = hasPermission("jobcard:create");

  // Permission checks for specialized dashboards
  const canSeeAppointments = hasPermission("appointment:read");
  const canSeeCustomers = hasPermission("customer:read");

  // Role-based routing — only redirect if the user has the matching permissions
  if (isReceptionManager && canSeeAppointments) {
    return <ReceptionManagerDashboard />;
  }
  if (isReceptionist && canSeeAppointments) {
    return <ReceptionistDashboard />;
  }
  if (isStoreManager && (canSeeInventory || canSeeWorkshop)) {
    return <StoreManagerDashboard />;
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // ── API error state ────────────────────────────────────────────────────────
  if (isError || !stats) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <DashboardWelcomeHeader user={user} today={today} />
        <DashboardFallbackState user={user} />
      </div>
    );
  }

  // ── Limited dashboard for users with minimal permissions ────────────────────
  // Shows when user can see at most one major section
  const hasAnyMajorPermission = canSeeFinance || canSeeWorkshop || canManage;

  if (!hasAnyMajorPermission) {
    const visibleLinks = QUICK_LINKS.filter((link) =>
      hasPermission(link.permission),
    );

    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <DashboardWelcomeHeader user={user} today={today} />

        {/* Identity card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="inline-grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-bold text-primary">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground">
                {user?.firstName} {user?.lastName}
              </h2>
              <p className="text-sm capitalize text-muted-foreground">{user?.role}</p>
              {user?.email && (
                <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick links — only show pages the user can access */}
        {visibleLinks.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Quick Access
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md"
                >
                  <span
                    className={cn(
                      "inline-grid size-10 shrink-0 place-items-center rounded-lg",
                      link.color,
                    )}
                  >
                    <link.icon className={cn("size-5", link.iconColor)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {link.label}
                    </p>
                    <ArrowRight className="mt-0.5 size-3.5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Enquiry triage (always visible) */}
        <EnquiryTriageWidget />

        {/* Message when user has no permissions at all */}
        {visibleLinks.length === 0 && <DashboardFallbackState user={user} />}
      </div>
    );
  }

  // ── Full dashboard (admin / workshop manager / etc.) ───────────────────────
  const kpiCount = [
    canSeeFinance,
    canSeeWorkshop,
    canSeeWorkshop,
    canSeeWorkshop,
  ].filter(Boolean).length;

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
