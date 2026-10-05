"use client";

import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusTone } from "@/components/ui/table-components/StatusBadge";
import { fmtDateTime, personName } from "../lib/warranty-format";
import type { ProgressStep } from "../types/warranty.types";

/** White bordered card with an icon + title header, as on the job card and indent detail pages. */
export function SectionCard({
  icon,
  title,
  note,
  action,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-5 sm:p-6 print:border print:shadow-none", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="text-slate-500 [&_svg]:size-4">{icon}</span>}
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {note && <span className="text-xs text-slate-400">{note}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailField({ label, value, mono, className }: { label: string; value?: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className={cn("mt-0.5 break-words text-sm text-slate-700", mono && "font-mono")}>{value ?? "—"}</div>
    </div>
  );
}

const bannerTones = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 [&_.banner-icon]:text-emerald-600",
  amber: "border-amber-200 bg-amber-50 text-amber-900 [&_.banner-icon]:text-amber-600",
  red: "border-red-200 bg-red-50 text-red-900 [&_.banner-icon]:text-red-600",
  blue: "border-blue-200 bg-blue-50 text-blue-900 [&_.banner-icon]:text-blue-600",
  gray: "border-slate-200 bg-slate-50 text-slate-800 [&_.banner-icon]:text-slate-500",
} as const;

export type BannerTone = keyof typeof bannerTones;

/** Full-width tinted alert: icon, bold title, body and an optional action on the right. */
export function AlertBanner({
  tone,
  icon,
  title,
  children,
  action,
  className,
}: {
  tone: BannerTone;
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl border p-4", bannerTones[tone], className)}>
      <span className="banner-icon mt-0.5 shrink-0 [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  icon,
  dot,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  dot?: "emerald" | "red" | "amber";
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5">
      {icon && <span className="mt-1 text-slate-500 [&_svg]:size-6">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          {dot && (
            <span
              className={cn(
                "size-2 rounded-full",
                dot === "emerald" && "bg-emerald-500",
                dot === "red" && "bg-red-500",
                dot === "amber" && "bg-amber-400",
              )}
            />
          )}
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

/** Horizontal meter filled in the primary colour. */
export function Meter({ percent, className }: { percent: number; className?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-slate-200", className)} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p}%` }} />
    </div>
  );
}

/** Stacked bar: completed (emerald), scheduled (blue), contacted (amber), rest (slate). */
export function StackedProgress({
  completed,
  scheduled,
  contacted,
  total,
  className,
}: {
  completed: number;
  scheduled: number;
  contacted: number;
  total: number;
  className?: string;
}) {
  const w = (n: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");
  return (
    <div className={cn("flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200", className)}>
      <div className="h-full bg-emerald-500" style={{ width: w(completed) }} title={`Completed ${completed}`} />
      <div className="h-full bg-blue-500" style={{ width: w(scheduled) }} title={`Scheduled ${scheduled}`} />
      <div className="h-full bg-amber-400" style={{ width: w(contacted) }} title={`Contacted ${contacted}`} />
    </div>
  );
}

/** Pill filter chips; the active chip is filled with the primary colour. */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { label: string; value: T; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal stepper built from the case status history. */
export function Stepper({ steps }: { steps: ProgressStep[] }) {
  const current = steps.findIndex((s) => !s.completed && !s.skipped);
  return (
    <ol className="grid gap-4 sm:grid-cols-6">
      {steps.map((step, index) => {
        const isCurrent = index === current;
        return (
          <li key={step.key} className="relative flex gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-3.5 top-8 h-[calc(100%-1rem)] w-px sm:left-[calc(50%+1.25rem)] sm:top-3.5 sm:h-px sm:w-[calc(100%-2.5rem)]",
                  step.completed ? "bg-primary" : "bg-slate-200",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                step.completed && "border-primary bg-primary text-primary-foreground",
                isCurrent && "border-primary bg-white text-primary",
                step.skipped && "border-slate-200 bg-slate-50 text-slate-300",
                !step.completed && !isCurrent && !step.skipped && "border-slate-200 bg-white text-slate-400",
              )}
            >
              {step.completed ? <Check className="size-3.5" /> : step.skipped ? <Minus className="size-3.5" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className={cn("text-xs font-semibold", step.completed || isCurrent ? "text-slate-800" : "text-slate-400")}>{step.label}</p>
              {step.completed && step.at && (
                <p className="text-[11px] leading-tight text-slate-400">
                  {fmtDateTime(step.at).split(" ")[0]} · {step.by ? personName(step.by) : "System"}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Loading / error states shared by detail pages. */
export function PageState({ loading, message }: { loading?: boolean; message?: string }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="size-6 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" aria-label="Loading" />
      </div>
    );
  }
  return <p className="px-4 py-10 text-sm text-red-500 lg:px-6">{message}</p>;
}

export const thCls = "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
export const tdCls = "px-3 py-2.5 align-middle text-sm text-slate-700";

/** StatusBadge in sentence case ("Partially approved", not "Partially Approved"). */
export function Pill({ status, tone, className }: { status: string; tone?: StatusTone; className?: string }) {
  return <StatusBadge status={status} tone={tone} className={cn("whitespace-nowrap normal-case", className)} />;
}
