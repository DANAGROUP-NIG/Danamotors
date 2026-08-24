"use client";

import { ElementType } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SparklineChart } from "./SparklineChart";

export interface DashboardKpiCardProps {
  label: string;
  value: string;
  delta: string | number;
  up: boolean;
  warn?: boolean;
  warnLink?: string;
  icon: ElementType;
  iconBg: string;
  iconColor: string;
  sparkData: { v: number }[];
  sparkColor: string;
}

export function DashboardKpiCard({
  label,
  value,
  delta,
  up,
  warn,
  warnLink,
  icon: Icon,
  iconBg,
  iconColor,
  sparkData,
  sparkColor,
}: DashboardKpiCardProps) {
  const deltaText = typeof delta === "number" ? `${Math.abs(delta)}%` : delta;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "inline-grid size-10 place-items-center rounded-xl",
            iconBg
          )}
        >
          <Icon className={cn("size-5", iconColor)} />
        </span>
      </div>

      <SparklineChart data={sparkData} color={sparkColor} />

      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold",
            up ? "text-emerald-600" : "text-red-500"
          )}
        >
          {up ? (
            <TrendingUp className="size-3.5" />
          ) : (
            <TrendingDown className="size-3.5" />
          )}
          {deltaText} vs yesterday
        </span>
        {warn && warnLink && (
          <a
            href={warnLink}
            className="text-xs font-semibold text-amber-600 hover:underline"
          >
            View low stock items
          </a>
        )}
      </div>
    </div>
  );
}
