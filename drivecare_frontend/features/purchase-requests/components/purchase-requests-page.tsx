"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { PageHeader } from "@/components/headers/page-header";
import { usePurchaseRequests } from "../hooks/use-purchase-requests";
import { useUpdatePurchaseRequestStatus } from "../hooks/use-update-purchase-request-status";
import type { PurchaseRequest } from "../types/purchase-request.types";

const PAGE_SIZE = 10;

const STATUS_FILTERS = ["", "Pending", "Approved", "Rejected"] as const;
const STATUS_LABELS: Record<string, string> = {
  "": "All",
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
};
const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((s) => ({ label: STATUS_LABELS[s], value: s }));

export function PurchaseRequestsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const update = useUpdatePurchaseRequestStatus();

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  const { data, isLoading, isError, isFetching } = usePurchaseRequests({
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
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleApprove(pr: PurchaseRequest) {
    if (!confirm(`Approve purchase request for ${pr.sparePart.name} (qty: ${pr.quantity})?`)) return;
    update.mutate({ id: pr.id, status: "Approved" });
  }

  function handleReject(pr: PurchaseRequest) {
    const notes = prompt("Rejection reason (optional):");
    update.mutate({ id: pr.id, status: "Rejected", approvalNotes: notes || undefined });
  }

  const columns: Column<PurchaseRequest>[] = [
    {
      header: "Part",
      render: (pr) => (
        <div className="flex items-center gap-2">
          <Package className="size-4 text-muted-foreground" />
          <span className="font-medium">{pr.sparePart.name}</span>
        </div>
      ),
    },
    {
      header: "Part #",
      render: (pr) => <span className="text-muted-foreground">{pr.sparePart.partNumber}</span>,
    },
    {
      header: "Qty",
      className: "text-right font-medium",
      headerClassName: "text-right",
      render: (pr) => pr.quantity,
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
      header: "Date",
      render: (pr) => <span className="text-muted-foreground">{new Date(pr.createdAt).toLocaleDateString()}</span>,
    },
    {
      header: "Status",
      render: (pr) => {
        const statusColor =
          pr.status === "Approved"
            ? "bg-emerald-50 text-emerald-700"
            : pr.status === "Rejected"
              ? "bg-red-50 text-red-600"
              : "bg-amber-50 text-amber-700";
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor}`}>
            {pr.status}
          </span>
        );
      },
    },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (pr) =>
        pr.status === "Pending" ? (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleApprove(pr)}
              disabled={update.isPending}
              className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <CheckCircle className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleReject(pr)}
              disabled={update.isPending}
              className="text-red-500 hover:bg-red-50 hover:text-red-700"
            >
              <XCircle className="size-4" />
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Purchase Requests" description="Parts requested across all branches" />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-red-500">Failed to load purchase requests.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Purchase Requests"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "request" : "requests"} on record`
            : "Parts requested across all branches"
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          statusFilter && !debouncedSearch
            ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} purchase requests`
            : undefined
        }
        rowKey={(pr) => pr.id}
        skeletonRowCount={5}
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
          placeholder="Search by part name or number…"
          filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
        />
      </DataTable>
    </div>
  );
}

