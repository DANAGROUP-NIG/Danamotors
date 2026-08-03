"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InventoryAlertBannerProps {
  alertsCount?: number;
}

export function InventoryAlertBanner({ alertsCount = 7 }: InventoryAlertBannerProps) {
  const hasAlerts = alertsCount > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        hasAlerts ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
      )}
    >
      {hasAlerts ? (
        <AlertTriangle className="size-5 shrink-0 text-amber-500" />
      ) : (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
      )}
      <div className="flex-1">
        {hasAlerts ? (
          <>
            <p className="text-sm font-semibold text-amber-900">
              {alertsCount} inventory alert{alertsCount !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-amber-700">
              Items at or below minimum stock — review before next service day.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-emerald-900">
              Inventory is fully stocked
            </p>
            <p className="text-xs text-emerald-700">
              All items are above minimum stock levels.
            </p>
          </>
        )}
      </div>
      <a
        href="/inventory"
        className={cn(
          "shrink-0 text-xs font-bold hover:underline",
          hasAlerts ? "text-amber-700" : "text-emerald-700"
        )}
      >
        {hasAlerts ? "View low stock items →" : "View inventory →"}
      </a>
    </div>
  );
}
