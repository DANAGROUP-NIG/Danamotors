"use client";

import { PageHeader } from "@/components/page-header";

export function QuotationsPage() {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Quotations"
        description="Service cost estimates awaiting customer approval."
      />
      <PlaceholderTable columns={["Quote #", "Customer", "Vehicle", "Amount", "Status", "Issued"]}
        message="No quotations yet. They will appear here once the finance module is wired." />
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
