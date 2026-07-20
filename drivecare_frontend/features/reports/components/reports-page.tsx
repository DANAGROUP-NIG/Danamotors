"use client";

import { PageHeader } from "@/components/page-header";

const REPORT_CARDS = [
  { title: "Revenue Report",      description: "Daily, weekly, and monthly revenue breakdown." },
  { title: "Job Completion Rate", description: "On-time job completion and technician performance." },
  { title: "Parts Usage",         description: "Most-used parts and inventory turnover analysis." },
  { title: "Customer Retention",  description: "Returning customer rate and visit frequency." },
  { title: "Technician Workload", description: "Active jobs per technician and capacity utilisation." },
  { title: "Inspection Outcomes", description: "Fault categories, approval rates, and repair conversion." },
];

export function ReportsPage() {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Reports"
        description="Workshop analytics and performance insights."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_CARDS.map(({ title, description }) => (
          <div
            key={title}
            className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <button
              type="button"
              className="mt-4 text-xs font-semibold text-primary hover:underline"
            >
              View report →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
