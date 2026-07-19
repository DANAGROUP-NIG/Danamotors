"use client";

import { useMemo } from "react";
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
import type { AppRole } from "@/features/auth/hooks/use-auth";

// ─── Mock data (replace with real API hooks when ready) ───────────────────────

const REVENUE_DATA = [
  { day: "Mon", value: 1_800_000 },
  { day: "Tue", value: 2_200_000 },
  { day: "Wed", value: 1_950_000 },
  { day: "Thu", value: 3_100_000 },
  { day: "Fri", value: 2_750_000 },
  { day: "Sat", value: 3_456_789 },
  { day: "Sun", value: 2_400_000 },
];

const JOBS_BY_STATUS = [
  { name: "Checked In", value: 18, color: "#2563eb" },
  { name: "Inspection", value: 14, color: "#7c3aed" },
  { name: "Diagnosis",  value: 16, color: "#0ea5e9" },
  { name: "Quotation",  value: 20, color: "#f59e0b" },
  { name: "Repair",     value: 24, color: "#f97316" },
  { name: "QC",         value: 10, color: "#10b981" },
  { name: "Ready",      value: 10, color: "#22c55e" },
];

const TOP_TECHNICIANS = [
  { rank: 1, name: "James Kim",     jobs: 34, rate: 92, avatar: "JK" },
  { rank: 2, name: "Michael Brown", jobs: 18, rate: 88, avatar: "MB" },
  { rank: 3, name: "David Wilson",  jobs: 16, rate: 85, avatar: "DW" },
  { rank: 4, name: "Robert Fox",    jobs: 14, rate: 82, avatar: "RF" },
  { rank: 5, name: "John Carter",   jobs: 12, rate: 76, avatar: "JC" },
];

const SPARKLINES: Record<string, { v: number }[]> = {
  revenue:    [{ v: 1.8 }, { v: 2.2 }, { v: 1.9 }, { v: 3.1 }, { v: 2.7 }, { v: 3.4 }, { v: 3.4 }],
  jobs:       [{ v: 95  }, { v: 100 }, { v: 107 }, { v: 98  }, { v: 110 }, { v: 108 }, { v: 112 }],
  inProgress: [{ v: 20  }, { v: 17  }, { v: 22  }, { v: 19  }, { v: 21  }, { v: 18  }, { v: 18  }],
  completed:  [{ v: 60  }, { v: 65  }, { v: 68  }, { v: 64  }, { v: 70  }, { v: 69  }, { v: 72  }],
};

// ─── Role-access matrix ───────────────────────────────────────────────────────

const FINANCE_ROLES: AppRole[]  = ["admin", "manager", "accountant"];
const WORKSHOP_ROLES: AppRole[] = ["admin", "manager", "technician", "receptionist"];
const MANAGE_ROLES: AppRole[]   = ["admin", "manager"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0}    />
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

interface KpiCardProps {
  label: string;
  value: string;
  delta: string;
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
        <span className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold",
          up ? "text-emerald-600" : "text-red-500",
        )}>
          {up
            ? <TrendingUp  className="size-3.5" />
            : <TrendingDown className="size-3.5" />}
          {delta} vs yesterday
        </span>
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
      <p className="text-sm font-bold text-foreground">{fmt(payload[0].value)}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, hasAccess, isSuperAdmin, isManagerOrAbove } = useAuth();
  const totalJobs = useMemo(
    () => JOBS_BY_STATUS.reduce((s, d) => s + d.value, 0),
    [],
  );

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  // Derived access flags (superadmin always passes via hasAccess)
  const canSeeFinance   = hasAccess(FINANCE_ROLES);
  const canSeeWorkshop  = hasAccess(WORKSHOP_ROLES);
  const canManage       = hasAccess(MANAGE_ROLES);
  const canSeeInventory = hasAccess(["admin", "manager"]);
  const canCreateJob    = hasAccess(["admin", "manager", "technician", "receptionist"]);

  // How many KPI columns are visible (drives the grid cols)
  const kpiCount = [
    canSeeFinance,   // Revenue
    canSeeWorkshop,  // Total Jobs
    canSeeWorkshop,  // In Progress
    canSeeWorkshop,  // Completed
  ].filter(Boolean).length;

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
          {/* New Job Card — admin / manager / technician / receptionist */}
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
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="size-5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">7 inventory alerts</p>
            <p className="text-xs text-amber-700">
              Items at or below reorder level — review before next service day.
            </p>
          </div>
          <a href="/inventory" className="shrink-0 text-xs font-bold text-amber-700 hover:underline">
            View low stock items →
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
          {/* Revenue — finance roles only */}
          {canSeeFinance && (
            <KpiCard
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

          {/* Workshop KPIs */}
          {canSeeWorkshop && (
            <KpiCard
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
            <KpiCard
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
            <KpiCard
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

      {/* ── Charts + technicians row ─────────────────────────────── */}
      {(canSeeFinance || canSeeWorkshop || canManage) && (
        <div
          className={cn(
            "grid gap-5",
            // All three columns: finance + workshop jobs + technicians
            canSeeFinance && canSeeWorkshop && canManage
              ? "lg:grid-cols-[1.4fr_0.9fr_0.9fr]"
              // Two columns: finance + jobs (accountant)
              : canSeeFinance && canSeeWorkshop
              ? "lg:grid-cols-2"
              // Two columns: jobs + technicians (manager, no accountant access)
              : canSeeWorkshop && canManage
              ? "lg:grid-cols-[1.4fr_0.9fr]"
              // Single column fallback
              : "lg:grid-cols-1",
          )}
        >
          {/* Revenue area chart — finance roles */}
          {canSeeFinance && (
            <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Revenue Overview</p>
                  <p className="mt-0.5 text-2xl font-extrabold text-foreground">₦27,589,000</p>
                </div>
                <select className="rounded-lg border border-[#e8edf3] bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none">
                  <option>This Week</option>
                  <option>Last Week</option>
                  <option>This Month</option>
                </select>
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={REVENUE_DATA} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}    />
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
            </div>
          )}

          {/* Jobs by status donut — workshop roles */}
          {canSeeWorkshop && (
            <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Jobs by Status</p>
                <select className="rounded-lg border border-[#e8edf3] bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none">
                  <option>This Week</option>
                </select>
              </div>
              <div className="relative flex items-center justify-center">
                <PieChart width={180} height={180}>
                  <Pie
                    data={JOBS_BY_STATUS}
                    cx={87}
                    cy={87}
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {JOBS_BY_STATUS.map((entry) => (
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
                {JOBS_BY_STATUS.map((s) => (
                  <li key={s.name} className="flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="truncate text-[11px] text-muted-foreground">{s.name}</span>
                    <span className="ml-auto text-[11px] font-semibold text-foreground">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top technicians — manager / admin / superadmin only */}
          {canManage && (
            <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Top Technicians</p>
                <select className="rounded-lg border border-[#e8edf3] bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none">
                  <option>This Week</option>
                </select>
              </div>
              <ul className="flex flex-col gap-3">
                {TOP_TECHNICIANS.map((t) => (
                  <li key={t.name} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-center text-xs font-bold text-muted-foreground">
                      {t.rank}
                    </span>
                    <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {t.avatar}
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
