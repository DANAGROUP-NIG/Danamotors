"use client";

import { PieChart, Pie, Cell } from "recharts";

export interface JobStatusItem {
  name: string;
  value: number;
  color: string;
}

interface JobsByStatusCardProps {
  data: JobStatusItem[];
  totalJobs?: number;
}

export function JobsByStatusCard({ data, totalJobs }: JobsByStatusCardProps) {
  const total = totalJobs ?? data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Jobs by Status</p>
        <select className="rounded-lg border border-[#e8edf3] bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none">
          <option>This Week</option>
        </select>
      </div>

      {data.length > 0 ? (
        <>
          <div className="relative flex items-center justify-center">
            <PieChart width={180} height={180}>
              <Pie
                data={data}
                cx={87}
                cy={87}
                innerRadius={58}
                outerRadius={82}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-foreground">
                {total}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">
                Total Jobs
              </span>
            </div>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5">
            {data.map((s) => (
              <li key={s.name} className="flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="truncate text-[11px] text-muted-foreground">
                  {s.name}
                </span>
                <span className="ml-auto text-[11px] font-semibold text-foreground">
                  {s.value}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          No job data available
        </div>
      )}
    </div>
  );
}
