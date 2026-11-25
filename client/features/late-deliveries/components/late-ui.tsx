import { CalendarClock, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LATE_KIND } from "../lib/late-delivery.logic";
import type { LateKind } from "../types/late-delivery.types";

export function LateKindBadge({ kind, className }: { kind: LateKind; className?: string }) {
  const Icon = kind === "DATE" ? CalendarClock : Clock3;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset print:ring-0",
        kind === "DATE" ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-800 ring-amber-200",
        className,
      )}
    >
      <Icon className="size-3.5 print:hidden" aria-hidden />
      {LATE_KIND[kind].label}
    </span>
  );
}

export interface ReasonChip {
  id: string;
  code: string;
  description: string;
}

/** Reasons as numbered chips, in entry order (the number is the legacy reason code). */
export function LateReasonChips({ reasons, empty, dense }: { reasons: ReasonChip[]; empty?: React.ReactNode; dense?: boolean }) {
  if (!reasons.length) return <>{empty ?? <span className="text-xs text-muted-foreground">No reason recorded</span>}</>;
  return (
    <ul className={cn("flex flex-wrap gap-1", dense && "max-w-64")}>
      {reasons.map((reason) => (
        <li key={reason.id} className="inline-flex items-center gap-1 rounded-md bg-muted py-0.5 pl-0.5 pr-1.5 text-xs text-foreground print:bg-transparent">
          {reason.code && reason.code.length <= 2 && <span className="grid size-4 place-items-center rounded bg-card font-mono text-[10px] font-semibold text-muted-foreground ring-1 ring-border">{reason.code}</span>}
          {reason.description}
        </li>
      ))}
    </ul>
  );
}
