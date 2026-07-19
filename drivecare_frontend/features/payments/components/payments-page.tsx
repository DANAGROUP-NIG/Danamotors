"use client";

import { PageHeader } from "@/components/ui/page-header";

export function PaymentsPage() {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Payments"
        description="Payment transactions and receipts."
      />
      <PlaceholderTable columns={["Ref #", "Customer", "Invoice", "Amount", "Method", "Date"]}
        message="No payments yet. They will appear here once the finance module is wired." />
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
