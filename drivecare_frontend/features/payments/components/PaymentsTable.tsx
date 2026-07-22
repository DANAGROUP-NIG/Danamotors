"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { usePayments } from "../hooks/use-payments";
import type { Payment } from "../types/payment.types";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PaymentsTable() {
  const [page, setPage] = useState(1);

  const activeBranch = useBranchStore((s) => s.activeBranch);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = usePayments({
    branchId: activeBranch?.id,
  });

  const allPayments = data?.payments ?? [];
  const PAGE_SIZE = 10;
  const total = allPayments.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginatedPayments = allPayments.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-red-500">
            Failed to load payments. Check the API connection and try again.
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Method</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : !paginatedPayments.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No payments yet.
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} />
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
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  const customerName = payment.invoice?.customer?.user
    ? `${payment.invoice.customer.user.firstName} ${payment.invoice.customer.user.lastName}`
    : "—";

  return (
    <tr className="border-t border-border transition-colors hover:bg-muted/30">
      <td className="px-4 py-3 font-medium">
        {payment.reference ?? <span className="text-border">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{customerName}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {payment.invoice?.invoiceNumber ?? "—"}
      </td>
      <td className="px-4 py-3 font-medium">{formatCurrency(payment.amount)}</td>
      <td className="px-4 py-3 text-muted-foreground">{payment.method}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatDate(payment.paymentDate)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {payment.recordedBy
          ? `${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`
          : "—"}
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          <td className="px-4 py-3">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </td>
        </tr>
      ))}
    </>
  );
}
