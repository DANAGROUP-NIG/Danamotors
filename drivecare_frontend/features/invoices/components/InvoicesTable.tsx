"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const activeBranch = useBranchStore((s) => s.activeBranch);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useInvoices({
    branchId: activeBranch?.id,
  });

  const allInvoices = data?.invoices ?? [];
  const filtered = debouncedSearch
    ? allInvoices.filter((inv) =>
        [inv.invoiceNumber, inv.customer?.firstName, inv.customer?.lastName]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(debouncedSearch.toLowerCase())),
      )
    : allInvoices;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const invoices = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

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

  const columns: Column<Invoice>[] = [
    {
      header: "Invoice #",
      render: (inv) => <span className="font-medium">{inv.invoiceNumber}</span>,
    },
    {
      header: "Customer",
      render: (inv) => <span className="text-muted-foreground">{inv.customer.firstName} {inv.customer.lastName}</span>,
    },
    {
      header: "Job Card",
      render: (inv) => <span className="text-muted-foreground">{inv.jobCard?.jobNumber ?? "—"}</span>,
    },
    {
      header: "Amount",
      render: (inv) => <span className="text-muted-foreground">{formatCurrency(inv.total)}</span>,
    },
    {
      header: "Due Date",
      render: (inv) => <span className="text-muted-foreground">{formatDate(inv.dueDate)}</span>,
    },
    {
      header: "Status",
      render: (inv) => {
        const statusClass = STATUS_STYLES[inv.status] ?? "bg-gray-100 text-gray-600";
        return (
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClass)}>
            {inv.status}
          </span>
        );
      },
    },
  ];

  return (
    <div className="grid gap-4">
      <DataTable<Invoice>
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage="No invoices yet."
        rowKey={(inv) => inv.id}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by invoice # or customer…"
          isLoading={isLoading}
          isFetching={isFetching}
        />
      </DataTable>
    </div>
  );
}
