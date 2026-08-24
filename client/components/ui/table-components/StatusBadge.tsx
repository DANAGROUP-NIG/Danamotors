"use client";

import { cn } from "@/lib/utils";

export type StatusTone = "emerald" | "blue" | "amber" | "red" | "orange" | "purple" | "gray";

interface StatusBadgeProps {
  status: string;
  tone?: StatusTone;
  className?: string;
}

const toneStyles: Record<StatusTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  gray: "bg-gray-50 text-gray-700 border-gray-200",
};

export function StatusBadge({ status, tone = "gray", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize transition-colors",
        toneStyles[tone],
        className
      )}
    >
      {status}
    </span>
  );
}
