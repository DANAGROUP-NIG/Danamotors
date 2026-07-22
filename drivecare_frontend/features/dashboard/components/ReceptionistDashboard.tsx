"use client";

import {
  CalendarDays,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Plus,
  Car,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDashboardStats } from "../hooks/useDashboardStats";

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
  const { data, isLoading, isError } = useDashboardStats();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6 animate-pulse">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back, {user?.firstName} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here&apos;s today&apos;s booking overview
          </p>
        </div>
        <button
          onClick={() => router.push("/appointments")}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition hover:bg-primary/90"
        >
          <Plus className="size-4" />
          New Appointment
        </button>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/appointments"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          All Appointments
        </a>
        <a
          href="/customers"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Users className="size-4 text-muted-foreground" />
          Customers
        </a>
        <a
          href="/job-cards"
          className="flex items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Car className="size-4 text-muted-foreground" />
          Job Cards
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {/* Today's Bookings */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Today&apos;s Bookings
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-blue-50">
              <CalendarDays className="size-4 text-blue-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {data.todayBookings}
          </p>
        </div>

        {/* Pending Appointments */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Pending Approval
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-amber-50">
              <Clock className="size-4 text-amber-500" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {data.pendingAppointments}
          </p>
        </div>

        {/* Total Customers (from core stats) */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Active Jobs
            </p>
            <span className="inline-grid size-8 place-items-center rounded-lg bg-green-50">
              <CheckCircle2 className="size-4 text-green-600" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {data.inProgressJobs}
          </p>
        </div>
      </div>

      {/* Upcoming Appointments */}
      <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            Upcoming Appointments
          </p>
          <a
            href="/appointments"
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all →
          </a>
        </div>
        {data.upcomingAppointments.length > 0 ? (
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
                {data.upcomingAppointments.map(
                  (apt: {
                    id: string;
                    scheduledAt: string;
                    customerName: string;
                    vehicle: string;
                    branch: string;
                    status: string;
                  }) => (
                    <tr key={apt.id} className="hover:bg-slate-50">
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
                              : "bg-amber-50 text-amber-700",
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
    </div>
  );
}
