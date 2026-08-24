"use client";

import { cn } from "@/lib/utils";

export interface TechnicianItem {
  rank: number;
  name: string;
  jobs: number;
  rate: number;
  avatar?: string;
}

interface TopTechniciansCardProps {
  technicians: TechnicianItem[];
}

export function TopTechniciansCard({ technicians }: TopTechniciansCardProps) {
  return (
    <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Top Technicians</p>
        <select className="rounded-lg border border-[#e8edf3] bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none">
          <option>This Week</option>
        </select>
      </div>

      {technicians.length > 0 ? (
        <>
          <ul className="flex flex-col gap-3">
            {technicians.map((t) => {
              const initials =
                t.avatar ||
                t.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("");

              return (
                <li key={t.name} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-center text-xs font-bold text-muted-foreground">
                    {t.rank}
                  </span>
                  <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {t.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.jobs} Jobs
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      t.rate >= 90
                        ? "bg-emerald-50 text-emerald-700"
                        : t.rate >= 80
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                    )}
                  >
                    {t.rate}%
                  </span>
                </li>
              );
            })}
          </ul>
          <a
            href="/technicians"
            className="mt-4 block w-full text-center text-xs font-semibold text-primary hover:underline"
          >
            View all technicians →
          </a>
        </>
      ) : (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          No technician data available
        </div>
      )}
    </div>
  );
}
