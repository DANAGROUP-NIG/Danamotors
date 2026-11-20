"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, CalendarClock, CalendarX2, ListChecks, PhoneCall, Settings2, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import { CASE_STATUS, CSC_PERMISSIONS, STAGE_META } from "../lib/csc.logic";
import type { CscCaseStatus, CscServiceType } from "../types/csc.types";

export const inputCls =
  "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
export const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500";

export function CaseStatusBadge({ status }: { status: CscCaseStatus }) {
  return <StatusBadge status={CASE_STATUS[status].label} tone={CASE_STATUS[status].tone} className="whitespace-nowrap normal-case" />;
}

/** Service code chip (1F, 2F, 3F, RG…) with the description as a tooltip. */
export function ServiceChip({ service, className }: { service: Pick<CscServiceType, "code" | "description">; className?: string }) {
  return (
    <span title={service.description} className={cn("inline-flex h-6 min-w-9 items-center justify-center rounded-md bg-primary/10 px-1.5 font-mono text-xs font-semibold text-primary", className)}>
      {service.code}
    </span>
  );
}

const NAV = [
  { href: STAGE_META.FIRST.href, label: STAGE_META.FIRST.title, icon: PhoneCall, permission: CSC_PERMISSIONS.CASE_READ },
  { href: STAGE_META.SECOND.href, label: STAGE_META.SECOND.title, icon: BellRing, permission: CSC_PERMISSIONS.CASE_READ },
  { href: STAGE_META.NOT_VISITED.href, label: "Not visited", icon: CalendarX2, permission: CSC_PERMISSIONS.CASE_READ },
  { href: "/csc/generate", label: "Generate cases", icon: Sparkles, permission: CSC_PERMISSIONS.CASE_GENERATE },
  { href: "/csc/schedule", label: "CSC master", icon: CalendarClock, permission: CSC_PERMISSIONS.MASTER_READ },
  { href: "/csc/close-reasons", label: "Closure reasons", icon: ListChecks, permission: CSC_PERMISSIONS.MASTER_READ },
] as const;

/** Tabs between the CSC screens, limited to what the user may open. */
export function CscNav() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  return (
    <nav aria-label="CSC screens" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 print:hidden">
      {NAV.filter((item) => hasPermission(item.permission)).map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "border-primary text-primary" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Compact metric tile for the CSC summary strip. */
export function MetricTile({ label, value, sub, tone = "slate", icon, href }: { label: string; value: ReactNode; sub?: string; tone?: "slate" | "blue" | "amber" | "red" | "emerald"; icon: ReactNode; href?: string }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    emerald: "bg-emerald-50 text-emerald-600",
  } as const;
  const body = (
    <div className={cn("flex h-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow", href && "hover:shadow-md")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5", tones[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-xl font-bold tabular-nums text-slate-900">{value}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyPanel({ icon = <Settings2 />, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-14 text-center">
      <span className="text-slate-400 [&_svg]:size-8">{icon}</span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {children && <div className="max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

/** Labelled toggle switch (checkbox semantics). */
export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}
