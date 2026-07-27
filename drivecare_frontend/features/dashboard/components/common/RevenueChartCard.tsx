"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface RevenueDataPoint {
  day: string;
  value: number;
}

interface RevenueChartCardProps {
  data: RevenueDataPoint[];
  totalFormatted?: string;
  timeRangeOptions?: string[];
  onTimeRangeChange?: (range: string) => void;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n}`;
}

function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#e8edf3] bg-white px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">
        ₦{payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

export function RevenueChartCard({
  data,
  totalFormatted = "₦27,589,000",
  timeRangeOptions = ["This Week", "Last Week", "This Month"],
  onTimeRangeChange,
}: RevenueChartCardProps) {
  return (
    <div className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Revenue Overview</p>
          <p className="mt-0.5 text-2xl font-extrabold text-foreground">
            {totalFormatted}
          </p>
        </div>
        {timeRangeOptions.length > 0 && (
          <select
            onChange={(e) => onTimeRangeChange?.(e.target.value)}
            className="rounded-lg border border-[#e8edf3] bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none"
          >
            {timeRangeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => fmt(v)}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<RevenueTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2.5}
              fill="url(#revGrad)"
              dot={{ r: 3, fill: "#2563eb", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#2563eb" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[190px] items-center justify-center text-xs text-muted-foreground">
          No revenue data available
        </div>
      )}
    </div>
  );
}
