"use client";

import { useState, useRef, useEffect } from "react";
import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Car,
  CheckCircle2,
  UserPlus,
  ClipboardList,
  ChevronDown,
  CalendarCheck,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { Button } from "@/components/ui/button";

const PERIODS = ["Today", "Yesterday", "Last Week", "Last Month"] as const;
type Period = (typeof PERIODS)[number];

const APT_FILTERS = ["Today", "Tomorrow", "This Week"] as const;
type AptFilter = (typeof APT_FILTERS)[number];

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

export default function ReceptionistDashboard() {
  const { user } = useAuth();
  const { data, isLoading, isFetching, isError } = useDashboardStats();
  const [activePeriod, setActivePeriod] = useState<Period>("Today");
  const [aptFilter, setAptFilter] = useState<AptFilter>("Today");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isFetching) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6 animate-pulse">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl border border-[#e8edf3] bg-white p-5"
            >
              <div className="space-y-3">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="h-7 w-16 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="h-64 rounded-xl border border-[#e8edf3] bg-white p-5" />
          <div className="h-64 rounded-xl border border-[#e8edf3] bg-white p-5" />
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

  const periodStats: Record<
    Period,
    { value: number; delta: number; deltaLabel: string }
  > = {
    Today: {
      value: data.myTodayBookings,
      delta:
        data.myYesterdayBookings > 0
          ? Math.round(
              ((data.myTodayBookings - data.myYesterdayBookings) /
                Math.max(data.myYesterdayBookings, 1)) *
                100 *
                10,
            ) / 10
          : data.myTodayBookings > 0
            ? 100
            : 0,
      deltaLabel: "vs yesterday",
    },
    Yesterday: {
      value: data.myYesterdayBookings,
      delta:
        data.yesterdayBookings > 0
          ? Math.round(
              ((data.myYesterdayBookings - data.myTodayBookings) /
                Math.max(data.myTodayBookings, 1)) *
                100 *
                10,
            ) / 10
          : data.myYesterdayBookings > 0
            ? 100
            : 0,
      deltaLabel: "vs today",
    },
    "Last Week": {
      value: data.myWeekBookings,
      delta: data.weekBookingsDelta,
      deltaLabel: "vs prev week",
    },
    "Last Month": {
      value: data.myLastMonthBookings,
      delta: data.monthBookingsDelta,
      deltaLabel: "vs prev month",
    },
  };

  const current = periodStats[activePeriod];

  const periodLabel: Record<Period, string> = {
    Today: "Today's Bookings",
    Yesterday: "Yesterday's Bookings",
    "Last Week": "This Week",
    "Last Month": "This Month",
  };

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const endOfWeek = new Date(now);
  const dow = endOfWeek.getDay();
  endOfWeek.setDate(endOfWeek.getDate() + (7 - (dow === 0 ? 7 : dow)));
  endOfWeek.setHours(23, 59, 59, 999);

  const filteredAppointments = data.upcomingAppointments.filter((apt) => {
    const aptDate = new Date(apt.scheduledAt).toISOString().slice(0, 10);
    if (aptFilter === "Today") return aptDate === todayStr;
    if (aptFilter === "Tomorrow") return aptDate === tomorrowStr;
    if (aptFilter === "This Week") return new Date(apt.scheduledAt) <= endOfWeek;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Here&apos;s your booking overview
        </p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Overall Performance with dropdown */}
        <div className="relative flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {periodLabel[activePeriod]}
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-primary/10">
              <ClipboardList className="size-4 text-primary" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {current.value}
          </p>
          {activePeriod === "Yesterday" ? (
            <span className="text-xs text-muted-foreground">&nbsp;</span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-semibold",
                current.delta >= 0 ? "text-emerald-600" : "text-red-500",
              )}
            >
              {current.delta >= 0 ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {current.delta >= 0 ? "+" : ""}
              {current.delta}% {current.deltaLabel}
            </span>
          )}

          {/* Dropdown */}
          <div ref={dropdownRef} className="mt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between gap-2 rounded-lg border-[#e8edf3] bg-slate-50 px-3 text-xs font-semibold text-foreground hover:bg-slate-100"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              {activePeriod}
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  dropdownOpen && "rotate-180",
                )}
              />
            </Button>
            {dropdownOpen && (
              <div className="absolute left-5 right-5 z-10 mt-1 overflow-hidden rounded-lg border border-[#e8edf3] bg-white shadow-lg">
                {PERIODS.map((p) => (
                  <Button
                    key={p}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-full justify-start rounded-none px-3 text-xs font-medium",
                      activePeriod === p
                        ? "bg-primary/10 text-primary"
                        : "text-foreground",
                    )}
                    onClick={() => {
                      setActivePeriod(p);
                      setDropdownOpen(false);
                    }}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Today's Available Appointments */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Available Today
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-amber-50">
              <CalendarCheck className="size-4 text-amber-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {data.todayAvailableAppointments.filter(
              (a) => a.status === "Pending" && new Date(a.scheduledAt).toISOString().slice(0, 10) === todayStr,
            ).length}
          </p>
          <p className="text-xs text-muted-foreground">
            Appointments scheduled for today
          </p>
        </div>

        {/* Total My Appointments */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Total Appointments
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-green-50">
              <CheckCircle2 className="size-4 text-green-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {data.myTotalBookings}
          </p>
          <p className="text-xs text-muted-foreground">
            All your booked appointments
          </p>
        </div>
      </div>

      {/* Bottom grid: Upcoming (wider) + Quick Links */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Upcoming Appointments */}
        <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              Upcoming Appointments
            </p>
            <a href="/appointments">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                View all →
              </Button>
            </a>
          </div>

          {/* Filter chips */}
          <div className="mb-3 flex gap-1.5">
            {APT_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setAptFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  aptFilter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {filteredAppointments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e8edf3] text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Vehicle</th>
                    <th className="pb-2 font-medium">Branch</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {filteredAppointments.map(
                    (apt: {
                      id: string;
                      scheduledAt: string;
                      customerName: string;
                      vehicle: string;
                      branch: string;
                      status: string;
                    }) => (
                      <tr key={apt.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/appointments/${apt.id}`)}>
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
                        <td className="py-2.5 text-muted-foreground">
                          {apt.branch}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              apt.status === "Confirmed"
                                ? "bg-green-50 text-green-700"
                                : apt.status === "Pending"
                                  ? "bg-amber-50 text-amber-700"
                                  : apt.status === "Cancelled"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-blue-50 text-blue-700",
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

        {/* Quick Links */}
        <div className="flex flex-col gap-4 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-grid size-8 place-items-center rounded-lg bg-primary/10">
              <Zap className="size-4 text-primary" />
            </span>
            <p className="text-sm font-semibold text-foreground">Quick Links</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 rounded-lg border-[#e8edf3] px-4 py-3 text-left"
              onClick={() => router.push("/appointments")}
            >
              <span className="inline-grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10">
                <CalendarDays className="size-4.5 text-primary" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  New Appointment
                </p>
                <p className="text-xs text-muted-foreground">
                  Schedule a service
                </p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto justify-start gap-3 rounded-lg border-[#e8edf3] px-4 py-3 text-left"
              onClick={() => router.push("/customers")}
            >
              <span className="inline-grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50">
                <UserPlus className="size-4.5 text-emerald-600" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Register Customer
                </p>
                <p className="text-xs text-muted-foreground">
                  Add a new customer
                </p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto justify-start gap-3 rounded-lg border-[#e8edf3] px-4 py-3 text-left"
              onClick={() => router.push("/vehicles")}
            >
              <span className="inline-grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50">
                <Car className="size-4.5 text-blue-600" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Register Vehicle
                </p>
                <p className="text-xs text-muted-foreground">Add a vehicle</p>
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
