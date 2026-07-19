"use client";

import { PageHeader } from "@/components/ui/page-header";

export function InspectionsPage() {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Inspections"
        description="Vehicle inspection reports and findings."
      />
      <PlaceholderTable columns={["Report #", "Vehicle", "Technician", "Date", "Outcome"]}
        message="No inspection reports yet. They will appear here once the workshop module is wired." />
    </div>
  );
}

function PlaceholderTable({ columns, message }: { columns: string[]; message: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
          <tr>{columns.map((c) => <th key={c} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{c}</th>)}</tr>
        </thead>
        <tbody>
          <tr><td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-muted-foreground">{message}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
