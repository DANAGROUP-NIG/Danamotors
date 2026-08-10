"use client";

import { useEffect, useState } from "react";
import { Package, SearchX, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { PageHeader } from "@/components/headers/page-header";
import { usePurchasing } from "../hooks/use-purchasing";
import type { PurchaseRequest } from "@/features/purchase-requests";

const PAGE_SIZE = 10;

const STATUS_FILTERS = ["", "Pending", "Approved", "Rejected"] as const;
const STATUS_LABELS: Record<string, string> = {
  "": "All",
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
};
const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((s) => ({ label: STATUS_LABELS[s], value: s }));

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-red-50 text-red-600",
};

export function PurchasingPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  const { data, isLoading, isError } = usePurchasing({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
  });

  const purchaseRequests = data?.purchaseRequests ?? [];
  const filtered = debouncedSearch
    ? purchaseRequests.filter((pr) =>
        [pr.sparePart.name, pr.sparePart.partNumber]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(debouncedSearch.toLowerCase())),
      )
    : purchaseRequests;

  const columns: Column<PurchaseRequest>[] = [
    {
      header: "Item",
      render: (pr) => (
        <div className="flex items-center gap-2">
          <Package className="size-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">{pr.sparePart.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{pr.sparePart.partNumber}</div>
          </div>
        </div>
      ),
    },
    {
      header: "Requested By",
      render: (pr) => (
        <span className="text-muted-foreground">
          {pr.requestedBy.firstName} {pr.requestedBy.lastName}
        </span>
      ),
    },
    {
      header: "Quantity",
      render: (pr) => <span className="font-medium">{pr.quantity}</span>,
    },
    {
      header: "Est. Cost",
      render: (pr) => (
        <span className="text-muted-foreground">
          {(pr.sparePart.unitPrice * pr.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      header: "Requested",
      render: (pr) => <span className="text-muted-foreground">{new Date(pr.requestDate ?? pr.createdAt).toLocaleDateString()}</span>,
    },
    {
      header: "Status",
      render: (pr) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[pr.status] || ""}`}>
          {pr.status}
        </span>
      ),
    },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (pr) => (
        <Link
          href="/purchase-requests"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          <ShoppingCart className="size-3.5" />
          Manage
        </Link>
      ),
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Purchasing" description="Purchase orders and supplier transactions." />
        <Card>
          <CardContent className="py-12 text-center">
            <SearchX className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-red-500">Failed to load purchasing records.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Purchasing"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "purchase request" : "purchase requests"} on record`
            : "Purchase orders and supplier transactions."
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        emptyMessage={
          statusFilter || debouncedSearch
            ? "No purchase requests match the current filters."
            : "No purchase requests yet."
        }
        rowKey={(pr) => pr.id}
        skeletonRowCount={5}
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
        onPageChange={setPage}
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by part name or number…"
          filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
        />
      </DataTable>
    </div>
  );
}
