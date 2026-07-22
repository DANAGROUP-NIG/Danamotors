"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useInvoices } from "../hooks/use-invoices";
import type { Invoice } from "../types/invoice.types";

const PAGE_SIZE = 10;

const STATUS_STYLES: Record<string, string> = {
  Paid: "bg-green-100 text-green-700",
  Unpaid: "bg-amber-100 text-amber-700",
  "Partially Paid": "bg-blue-100 text-blue-700",
  Overdue: "bg-red-100 text-red-600",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

export function InvoicesTable() {
  const [page, setPage] = useState(1);
  const activeBranch = useBranchStore((s) => s.activeBranch);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useInvoices({
    branchId: activeBranch?.id,
  });

  const allInvoices = data?.invoices ?? [];
  const total = allInvoices.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const invoices = allInvoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load invoices. Check the API connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-xl border border-[#e8edf3] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e8edf3] bg-[#f8fafc]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Job Card</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !invoices.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No invoices yet.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <div
            className={cn(
              "flex items-center justify-between border-t border-[#e8edf3] px-4 py-3",
              isFetching && "opacity-60",
            )}
          >
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const customerName = `${invoice.customer.firstName} ${invoice.customer.lastName}`;
  const statusClass = STATUS_STYLES[invoice.status] ?? "bg-gray-100 text-gray-600";

  return (
    <tr className="border-t border-border transition-colors hover:bg-muted/30">
      <td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td>
      <td className="px-4 py-3 text-muted-foreground">{customerName}</td>
      <td className="px-4 py-3 text-muted-foreground">{invoice.jobCard?.jobNumber ?? "—"}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatCurrency(invoice.total)}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatDate(invoice.dueDate)}</td>
      <td className="px-4 py-3">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClass)}>
          {invoice.status}
        </span>
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
