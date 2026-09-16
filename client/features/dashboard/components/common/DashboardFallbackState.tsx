"use client";

import Link from "next/link";
import {
  ShieldCheck,
  ArrowRight,
  CalendarDays,
  Users,
  Car,
  ClipboardList,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardFallbackStateProps {
  user?: {
    firstName?: string;
    lastName?: string;
    role?: string;
    email?: string;
  } | null;
}

const SUGGESTED_LINKS = [
  { label: "Appointments", href: "/appointments", icon: CalendarDays, permission: "appointment:read" },
  { label: "Customers", href: "/customers", icon: Users, permission: "customer:read" },
  { label: "Vehicles", href: "/vehicles", icon: Car, permission: "vehicle:read" },
  { label: "Job Cards", href: "/job-cards", icon: ClipboardList, permission: "jobcard:read" },
  { label: "Inventory", href: "/inventory", icon: Package, permission: "sparepart:read" },
];

export function DashboardFallbackState({ user }: DashboardFallbackStateProps) {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header area */}
      <div className="flex flex-col items-center gap-4 px-6 pt-10 pb-6 text-center">
        <span className="inline-grid size-16 place-items-center rounded-2xl bg-primary/10">
          <ShieldCheck className="size-8 text-primary" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {fullName ? `Welcome, ${fullName}` : "Welcome"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.role ? (
              <>
                You are logged in as{" "}
                <span className="font-medium capitalize text-foreground">
                  {user.role}
                </span>
                .
              </>
            ) : (
              "You are logged in."
            )}
          </p>
        </div>
      </div>

      {/* Info message */}
      <div className="mx-6 mb-6 rounded-lg bg-slate-50 px-4 py-3">
        <p className="text-center text-sm text-muted-foreground">
          Your dashboard access is managed by your administrator. If you believe you
          should have access to more data, please contact your admin to update your
          role permissions.
        </p>
      </div>

      {/* Suggested quick links */}
      <div className="border-t border-slate-100 px-6 py-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Navigate to
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {SUGGESTED_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-foreground transition hover:border-primary/30 hover:bg-primary/5"
            >
              <link.icon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              <span className="flex-1 truncate">{link.label}</span>
              <ArrowRight className="size-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
