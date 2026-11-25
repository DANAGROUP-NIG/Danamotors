import { CheckCircle2, CircleSlash, Frown, Lock, PhoneMissed, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { PSF_STATUS, type StatusTone } from "../lib/psf.logic";
import type { PsfStatus } from "../types/psf.types";

export const TONE: Record<StatusTone, { badge: string; tile: string; tileOn: string; key: string; dot: string; text: string }> = {
  emerald: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", tile: "hover:border-emerald-300", tileOn: "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200", key: "bg-emerald-600 text-white", dot: "bg-emerald-500", text: "text-emerald-700" },
  red: { badge: "bg-red-50 text-red-700 ring-red-200", tile: "hover:border-red-300", tileOn: "border-red-500 bg-red-50 ring-2 ring-red-200", key: "bg-red-600 text-white", dot: "bg-red-500", text: "text-red-700" },
  slate: { badge: "bg-slate-100 text-slate-700 ring-slate-300", tile: "hover:border-slate-400", tileOn: "border-slate-500 bg-slate-100 ring-2 ring-slate-200", key: "bg-slate-600 text-white", dot: "bg-slate-500", text: "text-slate-700" },
  amber: { badge: "bg-amber-50 text-amber-800 ring-amber-200", tile: "hover:border-amber-300", tileOn: "border-amber-500 bg-amber-50 ring-2 ring-amber-200", key: "bg-amber-500 text-white", dot: "bg-amber-500", text: "text-amber-800" },
  purple: { badge: "bg-purple-50 text-purple-700 ring-purple-200", tile: "hover:border-purple-300", tileOn: "border-purple-500 bg-purple-50 ring-2 ring-purple-200", key: "bg-purple-600 text-white", dot: "bg-purple-500", text: "text-purple-700" },
};

export const STATUS_ICON: Record<PsfStatus, typeof CheckCircle2> = {
  SATISFIED: CheckCircle2,
  DISSATISFIED: Frown,
  NO_PHONE: PhoneOff,
  NOT_AVAILABLE: PhoneMissed,
  CLOSED: Lock,
};

/** Follow-up status as a pill; null = not followed up yet. */
export function PsfStatusBadge({ status, short, className }: { status: PsfStatus | null | undefined; short?: boolean; className?: string }) {
  if (!status)
    return (
      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 border border-dashed border-slate-300 print:border-0", className)}>
        <CircleSlash className="size-3.5 print:hidden" aria-hidden />
        Not followed up
      </span>
    );
  const meta = PSF_STATUS[status];
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset print:ring-0", TONE[meta.tone].badge, className)}>
      <Icon className="size-3.5 print:hidden" aria-hidden />
      {short ? meta.short : meta.label}
    </span>
  );
}
