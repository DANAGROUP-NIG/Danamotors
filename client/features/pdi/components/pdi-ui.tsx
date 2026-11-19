"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Pill } from "@/features/warranty/components/ui";
import { chargeLabel, chargeTone, formatMoney, PDI_STATUS } from "../lib/pdi.logic";
import type { ChargeType, Money, PdiStatus } from "../types/pdi.types";

export { AlertBanner, DetailField, FilterPills, KpiCard, PageState, SectionCard, Stepper, tdCls, thCls } from "@/features/warranty/components/ui";

export const pdiInput = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
export const pdiNumberInput = `${pdiInput} text-right tabular-nums`;

export function PdiStatusPill({ status }: { status: PdiStatus }) {
  const meta = PDI_STATUS[status] ?? { label: status, tone: "gray" as const };
  return <Pill status={meta.label} tone={meta.tone} />;
}

export function ChargePill({ type }: { type: ChargeType | string }) {
  return <Pill status={chargeLabel(type)} tone={chargeTone(type)} className="text-xs" />;
}

export function MoneyText({ value, className, muted }: { value: Money | null | undefined; className?: string; muted?: boolean }) {
  return <span className={cn("tabular-nums", muted && "text-muted-foreground", className)}>{formatMoney(value)}</span>;
}

/** Labelled control for PDI forms (label above, optional hint and error below). */
export function PdiField({ label, required, hint, error, children, className }: { label: string; required?: boolean; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("grid min-w-0 gap-1.5", className)}>
      <span className="text-sm font-semibold text-foreground">
        {label}
        {required && <span className="text-destructive" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </label>
  );
}

/** Footer totals of a document grid (legacy: number of items, net quantity, total amount, …). */
export function TotalsStrip({ items, className }: { items: { label: string; value: ReactNode; strong?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-3 rounded-lg border border-border bg-muted/50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map(item => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</dt>
          <dd className={cn("mt-0.5 tabular-nums text-foreground", item.strong && "text-base font-bold")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Segmented choice (requisition type, bill type). */
export function Segmented<T extends string>({ value, options, onChange, disabled, label }: {
  value: T;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background hover:bg-muted",
            )}
          >
            <span className="block text-sm font-semibold text-foreground">{option.label}</span>
            {option.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
