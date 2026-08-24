"use client";

import { useEffect, useState } from "react";
import { FileText, SearchX } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { PageHeader } from "@/components/headers/page-header";
import { useQuotations } from "../hooks/use-quotations";
import type { Quotation } from "../types/quotation.types";

const PAGE_SIZE = 10;

const STATUS_FILTERS = ["", "Pending", "Approved", "Rejected", "Expired"] as const;
const STATUS_LABELS: Record<string, string> = {
  "": "All",
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
  Expired: "Expired",
};
const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((s) => ({ label: STATUS_LABELS[s], value: s }));

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-red-50 text-red-600",
  Expired: "bg-gray-50 text-gray-500",
};

export function QuotationsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  const { data, isLoading, isError } = useQuotations({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
  });

  const quotations = data?.estimates ?? [];

  function formatMoney(q: Quotation) {
    const symbol = q.currency === "NGN" ? "₦" : q.currency === "USD" ? "$" : q.currency ? `${q.currency} ` : "";
    return `${symbol}${q.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }

  const columns: Column<Quotation>[] = [
    {
      header: "Quote",
      render: (q) => (
        <Link
          href={`/job-cards/${q.jobCardId}`}
          className="flex items-center gap-2 text-blue-600 hover:underline"
        >
          <FileText className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs font-medium">{q.jobCard.jobNumber}</span>
        </Link>
      ),
    },
    {
      header: "Customer",
      render: (q) => (
        <span className="text-muted-foreground">
          {q.jobCard.customer.firstName} {q.jobCard.customer.lastName}
        </span>
      ),
    },
    {
      header: "Vehicle",
      render: (q) => (
        <span className="text-muted-foreground">
          {[q.jobCard.vehicle.make, q.jobCard.vehicle.model].filter(Boolean).join(" ") || q.jobCard.vehicle.vin}
        </span>
      ),
    },
    {
      header: "Description",
      render: (q) => (
        <span className="line-clamp-1 max-w-[240px] text-muted-foreground">{q.description}</span>
      ),
    },
    {
      header: "Amount",
      render: (q) => <span className="font-medium">{formatMoney(q)}</span>,
    },
    {
      header: "Status",
      render: (q) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[q.status] || ""}`}>
          {q.status}
        </span>
      ),
    },
    {
      header: "Issued",
      render: (q) => <span className="text-muted-foreground">{new Date(q.createdAt).toLocaleDateString()}</span>,
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Quotations" description="Service cost estimates awaiting customer approval." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-red-500">Failed to load quotations.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Quotations"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "quotation" : "quotations"} on record`
            : "Service cost estimates awaiting customer approval."
        }
      />

      <DataTable
        columns={columns}
        data={quotations}
        isLoading={isLoading}
        emptyMessage={
          statusFilter || debouncedSearch
            ? "No quotations match the current filters."
            : "No quotations yet."
        }
        rowKey={(q) => q.id}
        skeletonRowCount={5}
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.meta?.total ?? 0}
        totalPages={data?.meta?.totalPages ?? 1}
        onPageChange={setPage}
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by job #, customer, or description…"
          filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
        />
      </DataTable>
    </div>
  );
}
