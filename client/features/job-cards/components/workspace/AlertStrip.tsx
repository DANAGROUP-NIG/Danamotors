"use client";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertView, JobFileTab } from "../../lib/job-frame.logic";

/** Up to 3 blocking or important alerts from the server, each with an optional next step. */
export function AlertStrip({ alerts, onOpenTab }: { alerts: AlertView[]; onOpenTab: (tab: JobFileTab) => void }) {
  if (!alerts.length) return null;
  return (
    <section aria-label="Alerts" className="space-y-2">
      {alerts.map((alert) => {
        const danger = alert.tone === "danger";
        const Icon = danger ? CircleAlert : TriangleAlert;
        return (
          <div
            key={alert.code}
            role={danger ? "alert" : "status"}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm",
              danger ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1">{alert.message}</p>
            {alert.link &&
              ("anchor" in alert.link ? (
                <a
                  href={`#${alert.link.anchor}`}
                  className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {alert.link.label}
                </a>
              ) : (
                <button
                  type="button"
                  className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => alert.link && "tab" in alert.link && onOpenTab(alert.link.tab)}
                >
                  {alert.link.label}
                </button>
              ))}
          </div>
        );
      })}
    </section>
  );
}
