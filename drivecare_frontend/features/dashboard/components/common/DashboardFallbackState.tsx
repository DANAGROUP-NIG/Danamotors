"use client";

import { Wrench } from "lucide-react";

export function DashboardFallbackState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e8edf3] bg-white py-16 text-center shadow-sm">
      <span className="inline-grid size-14 place-items-center rounded-full bg-slate-100">
        <Wrench className="size-6 text-slate-400" />
      </span>
      <p className="text-sm font-semibold text-foreground">
        Your dashboard is being set up
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Contact your administrator if you believe you should have access to more information.
      </p>
    </div>
  );
}
