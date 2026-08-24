"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

import { DataTable } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { useBranchStore } from "@/store/branch.store";
import { usePayments } from "../hooks/use-payments";

const PAGE_SIZE = 10;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function PaymentsTable() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const activeBranch = useBranchStore((s) => s.activeBranch);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = usePayments({
    branchId: activeBranch?.id,
  });

  const allPayments = data?.payments ?? [];
  const filtered = debouncedSearch
    ? allPayments.filter((p) =>
        [p.reference, p.invoice?.invoiceNumber, p.invoice?.customer?.firstName, p.invoice?.customer?.lastName]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(debouncedSearch.toLowerCase())),
      )
    : allPayments;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginatedPayments = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

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
    <DataTable
      columns={[
        {
          header: "Reference",
          render: (p) =>
            p.reference ?? <span className="text-border">—</span>,
          className: "font-medium",
        },
        {
          header: "Customer",
          render: (p) => {
            const name = p.invoice?.customer
              ? `${p.invoice.customer.firstName} ${p.invoice.customer.lastName}`
              : "—";
            return name;
          },
          className: "text-muted-foreground",
        },
        {
          header: "Invoice",
          render: (p) => p.invoice?.invoiceNumber ?? "—",
          className: "text-muted-foreground",
        },
        {
          header: "Amount",
          render: (p) => formatCurrency(p.amount),
          className: "font-medium",
        },
        {
          header: "Method",
          render: (p) => p.method,
          className: "text-muted-foreground",
        },
        {
          header: "Date",
          render: (p) => formatDate(p.paymentDate),
          className: "text-muted-foreground",
        },
        {
          header: "Recorded By",
          render: (p) =>
            p.recordedBy
              ? `${p.recordedBy.firstName} ${p.recordedBy.lastName}`
              : "—",
          className: "text-muted-foreground",
        },
      ]}
      data={paginatedPayments}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyMessage="No payments yet."
      searchQuery={debouncedSearch}
      rowKey={(p) => p.id}
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
        placeholder="Search by reference, invoice, or customer…"
        isLoading={isLoading}
        isFetching={isFetching}
      />
    </DataTable>
  );
}
