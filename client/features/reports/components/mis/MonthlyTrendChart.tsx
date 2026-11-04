"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney } from "../../lib/report-format";

export interface TrendPoint {
  month: string;
  labour: number;
  spares: number;
  oil: number;
}

const SERIES = [
  { key: "labour", label: "Labour", fill: "var(--color-blue-500)" },
  { key: "spares", label: "Spares", fill: "var(--color-emerald-500)" },
  { key: "oil", label: "Oil", fill: "var(--color-amber-400)" },
] as const;

const compact = new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 });

/** Month-by-month labour, spares and oil (S1), as stacked bars. */
export default function MonthlyTrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <section className="rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5" aria-label="Revenue by month">
      <h2 className="text-sm font-semibold text-slate-800">Revenue by month</h2>
      <p className="text-xs text-muted-foreground">Total labour (net, with PDI), spares and oil of the jobs delivered in each month.</p>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(value: number) => compact.format(value)} />
            <Tooltip formatter={(value) => fmtMoney(Number(value))} cursor={{ fill: "var(--muted)" }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((series) => (
              <Bar key={series.key} dataKey={series.key} name={series.label} stackId="revenue" fill={series.fill} maxBarSize={48} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
