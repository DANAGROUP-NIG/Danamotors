import type { ElementType } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Car, ClipboardCheck, FileText, Package } from "lucide-react";
import { revenueData, statusData } from "../../data";

const stats = [
  { title: "Vehicles in service", value: "48", delta: "+9 today", icon: Car },
  { title: "Pending inspections", value: "13", delta: "5 priority", icon: ClipboardCheck },
  { title: "Awaiting approval", value: "18", delta: "owners notified", icon: FileText },
  { title: "Parts requested", value: "7", delta: "Dana sourcing", icon: Package },
];

export default function DashboardShowcase() {
  return (
    <section className="bg-[#071225] py-24 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <Badge tone="blue">Dana managed operations</Badge>
            <h2 className="mt-4 text-3xl font-black sm:text-5xl">Your service is handled by Dana Group from the inside.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
              Customers get a simple tracking experience, while Dana&apos;s internal team manages bookings,
              inspections, technician assignments, parts, approvals, quality checks, and pickup readiness.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "Clear customer updates",
                "Dana technician coordination",
                "Approval before major repairs",
                "Quality checks before pickup",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
                  <ShieldCheck className="size-5 text-emerald-400" />
                  <span className="text-sm font-semibold">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {stats.map((stat) => (
              <MetricTile key={stat.title} title={stat.title} value={stat.value} delta={stat.delta} icon={stat.icon} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricTile({
  title,
  value,
  delta,
  icon: Icon,
}: {
  title: string;
  value: string;
  delta: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-300">{title}</p>
        <Icon className="size-5 text-blue-300" />
      </div>
      <p className="mt-8 text-4xl font-black">{value}</p>
      <p className="mt-2 text-sm font-semibold text-emerald-300">{delta}</p>
    </div>
  );
}
