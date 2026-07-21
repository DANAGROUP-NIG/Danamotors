"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wrench,
  Car,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { FINANCE_ROLES, WORKSHOP_ROLES, MANAGE_ROLES } from "@/features/auth/roles";
import { useDashboardStats } from "@/features/dashboard/hooks/useDashboardStats";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n}`;
}

function fmtFull(n: number) {
  return `₦${n.toLocaleString()}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#sg-${color.replace("#", "")})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DeltaBadge({ delta, up }: { delta: number; up: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold",
        up ? "text-emerald-600" : "text-red-500",
      )}
    >
      {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {Math.abs(delta)}% vs yesterday
    </span>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  delta: number;
  up: boolean;
  warn?: boolean;
  warnLink?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  sparkData: { v: number }[];
  sparkColor: string;
}

function KpiCard({
  label, value, delta, up, warn, warnLink,
  icon: Icon, iconBg, iconColor,
  sparkData, sparkColor,
}: KpiCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
        </div>
        <span className={cn("inline-grid size-10 place-items-center rounded-xl", iconBg)}>
          <Icon className={cn("size-5", iconColor)} />
        </span>
      </div>

      <Sparkline data={sparkData} color={sparkColor} />

      <div className="flex items-center justify-between">
        <DeltaBadge delta={delta} up={up} />
        {warn && warnLink && (
          <a href={warnLink} className="text-xs font-semibold text-amber-600 hover:underline">
            View low stock items
          </a>
        )}
      </div>
    </div>
  );
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-200" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-xl border border-[#e8edf3] bg-white p-5">
            <div className="space-y-3">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="h-7 w-24 rounded bg-slate-200" />
              <div className="h-10 w-full rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-72 rounded-xl border border-[#e8edf3] bg-white p-5">
          <div className="h-4 w-32 rounded bg-slate-200 mb-4" />
          <div className="h-48 rounded bg-slate-100" />
        </div>
        <div className="h-72 rounded-xl border border-[#e8edf3] bg-white p-5">
          <div className="h-4 w-32 rounded bg-slate-200 mb-4" />
          <div className="h-48 rounded bg-slate-100" />
        </div>
        <div className="h-72 rounded-xl border border-[#e8edf3] bg-white p-5">
          <div className="h-4 w-32 rounded bg-slate-200 mb-4" />
          <div className="h-48 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, hasAccess } = useAuth();
  const { data, isLoading, isError } = useDashboardStats();

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

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

  // Build sparkline data from revenue chart
  const revenueSparkline = data.revenueChart.map((r) => ({ v: r.value / 1_000_000 }));
  const jobsSparkline = data.jobsByStatus.length > 0
    ? [{ v: totalJobs }, { v: totalJobs }, { v: totalJobs }, { v: totalJobs }, { v: totalJobs }, { v: totalJobs }, { v: totalJobs }]
    : [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back, {user?.firstName} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground capitalize">
            {user?.role} · {today}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted">
            <Calendar className="size-4 text-muted-foreground" />
            {today}
          </button>
          {canCreateJob && (
            <button className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition hover:bg-primary/90">
              <Plus className="size-4" />
              New Job Card
            </button>
          )}
        </div>
      </div>

      {/* ── Inventory alert — admin / manager / superadmin only ── */}
      {canSeeInventory && (
        <div className={cn(
          "flex items-center gap-3 rounded-xl border px-4 py-3",
          data.inventoryAlerts > 0
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50",
        )}>
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
          <a href="/inventory" className={cn(
            "shrink-0 text-xs font-bold hover:underline",
            data.inventoryAlerts > 0 ? "text-amber-700" : "text-emerald-700",
          )}>
            {data.inventoryAlerts > 0 ? "View low stock items →" : "View inventory →"}
          </a>
        </div>
      )}

      {/* ── KPI row ─────────────────────────────────────────────── */}
      {kpiCount > 0 && (
        <div
          className={cn(
            "grid gap-4 lg:gap-5",
            kpiCount === 4 && "grid-cols-2 lg:grid-cols-4",
            kpiCount === 3 && "grid-cols-2 lg:grid-cols-3",
            kpiCount === 2 && "grid-cols-2",
            kpiCount === 1 && "grid-cols-1 max-w-xs",
          )}
        >
          {canSeeFinance && (
            <KpiCard
              label="Today's Revenue"
              value={fmtFull(data.todayRevenue)}
              delta={data.revenueDelta}
              up={data.revenueDelta >= 0}
              icon={TrendingUp}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              sparkData={revenueSparkline.length > 0 ? revenueSparkline : [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }]}
              sparkColor="#10b981"
            />
          )}
          {canSeeWorkshop && (
            <KpiCard
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
            <KpiCard
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
            <KpiCard
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

      {/* ── Charts + technicians row ─────────────────────────────── */}
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
              : "lg:grid-cols-1",
          )}
        >
          {/* Revenue area chart */}
          {canSeeFinance && (
            <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Revenue Overview</p>
                  <p className="mt-0.5 text-2xl font-extrabold text-foreground">
                    {fmtFull(data.todayRevenue)}
                  </p>
                </div>
              </div>
              {data.revenueChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={data.revenueChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#revGrad)"
                      dot={{ r: 3, fill: "#2563eb", strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: "#2563eb" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[190px] items-center justify-center text-xs text-muted-foreground">
                  No revenue data available
                </div>
              )}
            </div>
          )}

          {/* Jobs by status donut */}
          {canSeeWorkshop && (
            <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Jobs by Status</p>
              </div>
              {data.jobsByStatus.length > 0 ? (
                <>
                  <div className="relative flex items-center justify-center">
                    <PieChart width={180} height={180}>
                      <Pie
                        data={data.jobsByStatus}
                        cx={87}
                        cy={87}
                        innerRadius={58}
                        outerRadius={82}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {data.jobsByStatus.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-extrabold text-foreground">{totalJobs}</span>
                      <span className="text-[10px] font-medium text-muted-foreground">Total Jobs</span>
                    </div>
                  </div>
                  <ul className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5">
                    {data.jobsByStatus.map((s) => (
                      <li key={s.name} className="flex items-center gap-1.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="truncate text-[11px] text-muted-foreground">{s.name}</span>
                        <span className="ml-auto text-[11px] font-semibold text-foreground">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
                  No job data available
                </div>
              )}
            </div>
          )}

          {/* Top technicians */}
          {canManage && (
            <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Top Technicians</p>
              </div>
              {data.topTechnicians.length > 0 ? (
                <>
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
                        <span className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                          t.rate >= 90 ? "bg-emerald-50 text-emerald-700" :
                          t.rate >= 80 ? "bg-blue-50 text-blue-700" :
                                         "bg-amber-50 text-amber-700",
                        )}>
                          {t.rate}%
                        </span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href="/technicians"
                    className="mt-4 block w-full text-center text-xs font-semibold text-primary hover:underline"
                  >
                    View all technicians →
                  </a>
                </>
              ) : (
                <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
                  No technician data available
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Fallback for viewers / unknown roles ─────────────────── */}
      {!canSeeFinance && !canSeeWorkshop && !canManage && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e8edf3] bg-white py-16 text-center shadow-sm">
          <span className="inline-grid size-14 place-items-center rounded-full bg-slate-100">
            <Wrench className="size-6 text-slate-400" />
          </span>
          <p className="text-sm font-semibold text-foreground">
            Your dashboard is being set up
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Contact your administrator if you believe you should have access to more information.
          </p>
        </div>
      )}

    </div>
  );
}
