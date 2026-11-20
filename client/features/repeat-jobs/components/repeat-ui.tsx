"use client";
import type { ReactNode } from "react";
import { Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/features/warranty/components/ui";
import { REPEAT_SOURCE, REPEAT_STATUS } from "../lib/repeat-job.logic";
import type { RepeatReason, RepeatSource, RepeatStatus } from "../types/repeat-job.types";

/** Review status of a repeat; `compact` reads "Repeat · pending" for job card lists and headers. */
export function RepeatStatusBadge({ status, compact, className }: { status: RepeatStatus; compact?: boolean; className?: string }) {
  const meta = REPEAT_STATUS[status];
  return <Pill status={compact ? meta.short : meta.label} tone={meta.tone} className={cn("gap-1 text-xs", className)} />;
}

/** Small "Repeat" tag with the review status, for job card rows and the vehicle history. */
export function RepeatTag({ status, className }: { status: RepeatStatus; className?: string }) {
  const meta = REPEAT_STATUS[status];
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        status === "PENDING_REVIEW" && "border-amber-200 bg-amber-50 text-amber-800",
        status === "CONFIRMED" && "border-red-200 bg-red-50 text-red-700",
        status === "NOT_REPEAT" && "border-slate-200 bg-slate-50 text-slate-500",
        className,
      )}
    >
      <Repeat2 className="size-3" aria-hidden="true" />
      {status === "PENDING_REVIEW" ? "Repeat · pending" : status === "CONFIRMED" ? "Repeat" : "Not a repeat"}
    </span>
  );
}

export function SourceTag({ source }: { source: RepeatSource }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
      {REPEAT_SOURCE[source]}
    </span>
  );
}

/** Reason codes as chips: code in a square, description beside it. */
export function ReasonChips({ reasons, empty = "Not reviewed yet", dense }: { reasons: RepeatReason[]; empty?: ReactNode; dense?: boolean }) {
  if (!reasons.length) return <span className="text-sm text-muted-foreground">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <li
          key={reason.id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-medium",
            reason.isNotRepeat ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700",
          )}
        >
          <span className={cn("grid size-5 place-items-center rounded-full text-[11px] font-bold", reason.isNotRepeat ? "bg-emerald-600 text-white" : "bg-slate-800 text-white")}>
            {reason.code}
          </span>
          {dense ? <span className="max-w-40 truncate">{reason.description}</span> : reason.description}
        </li>
      ))}
    </ul>
  );
}

/** One difference (days or km) against its window limit; highlighted when it triggered the flag. */
export function DifferenceTile({ label, value, limit, triggered, hint }: { label: string; value: ReactNode; limit: ReactNode; triggered: boolean; hint?: ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-4", triggered ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", triggered ? "text-amber-900" : "text-slate-900")}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Window {limit}
        {triggered && <span className="ml-1.5 rounded-full bg-amber-200/70 px-1.5 py-0.5 font-semibold text-amber-900">within</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
