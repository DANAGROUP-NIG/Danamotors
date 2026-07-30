"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, CheckCircle, XCircle, Send, PackageCheck, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { PageHeader } from "@/components/headers/page-header";
import { useTransfers } from "../hooks/use-transfers";
import { useApproveTransfer, useDispatchTransfer, useReceiveTransfer, useRejectTransfer, useCancelTransfer } from "../hooks/use-transfer-mutations";
import type { Transfer } from "../types/transfer.types";

const STATUS_FILTERS = ["", "Pending", "Approved", "Dispatched", "Received", "Rejected", "Cancelled"] as const;
const STATUS_LABELS: Record<string, string> = {
  "": "All",
  Pending: "Pending",
  Approved: "Approved",
  Dispatched: "Dispatched",
  Received: "Received",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
};

const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((s) => ({ label: STATUS_LABELS[s], value: s }));

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-blue-50 text-blue-700",
  Dispatched: "bg-purple-50 text-purple-700",
  Received: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-red-50 text-red-600",
  Cancelled: "bg-gray-50 text-gray-500",
};

const PAGE_SIZE = 10;

export function TransfersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const approve = useApproveTransfer();
  const dispatch = useDispatchTransfer();
  const receive = useReceiveTransfer();
  const reject = useRejectTransfer();
  const cancel = useCancelTransfer();

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  const { data, isLoading, isError } = useTransfers({
    status: statusFilter || undefined,
  });

  const allTransfers = data?.transfers ?? [];
  const searched = debouncedSearch
    ? allTransfers.filter((t) =>
        [t.transferNumber, t.requestingBranch?.name, t.sourceBranch?.name]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(debouncedSearch.toLowerCase())),
      )
    : allTransfers;
  const total = searched.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginated = searched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<Transfer>[] = [
    {
      header: "Transfer #",
      render: (t) => (
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs font-medium">{t.transferNumber}</span>
        </div>
      ),
    },
    {
      header: "From → To",
      render: (t) => (
        <span className="text-muted-foreground">
          {t.sourceBranch.name} → {t.requestingBranch.name}
        </span>
      ),
    },
    {
      header: "Items",
      render: (t) => {
        const itemSummary = `${t.items.length} ${t.items.length === 1 ? "item" : "items"} (${t.items.reduce((s, i) => s + i.requestedQuantity, 0)} total)`;
        return <span className="text-muted-foreground">{itemSummary}</span>;
      },
    },
    {
      header: "Requested By",
      render: (t) => (
        <span className="text-muted-foreground">
          {t.requestedBy.firstName} {t.requestedBy.lastName}
        </span>
      ),
    },
    {
      header: "Date",
      render: (t) => <span className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>,
    },
    {
      header: "Status",
      render: (t) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[t.status] || ""}`}>
          {t.status}
        </span>
      ),
    },
    {
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (t) => (
        <div className="flex justify-end gap-1">
          {t.status === "Pending" && (
            <>
              <Button size="sm" variant="ghost" onClick={() => approve.mutate(t.id)} disabled={approve.isPending || dispatch.isPending || receive.isPending} className="text-blue-600 hover:bg-blue-50 hover:text-blue-700">
                <CheckCircle className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => reject.mutate({ id: t.id })} disabled={approve.isPending || dispatch.isPending || receive.isPending} className="text-red-500 hover:bg-red-50 hover:text-red-700">
                <XCircle className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => cancel.mutate(t.id)} disabled={approve.isPending || dispatch.isPending || receive.isPending} className="text-gray-400 hover:bg-gray-50 hover:text-gray-600">
                <Ban className="size-4" />
              </Button>
            </>
          )}
          {t.status === "Approved" && (
            <Button size="sm" variant="outline" onClick={() => dispatch.mutate({ id: t.id })} disabled={approve.isPending || dispatch.isPending || receive.isPending}>
              <Send className="mr-1 size-3" /> Dispatch
            </Button>
          )}
          {t.status === "Dispatched" && (
            <Button size="sm" variant="outline" onClick={() => receive.mutate({ id: t.id })} disabled={approve.isPending || dispatch.isPending || receive.isPending}>
              <PackageCheck className="mr-1 size-3" /> Receive
            </Button>
          )}
          {["Received", "Rejected", "Cancelled"].includes(t.status) && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
  ];

  if (isError) {
    return (
      <div className="flex flex-col gap-5 p-4 lg:p-6">
        <PageHeader title="Stock Transfers" description="Inter-branch inventory transfers" />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-red-500">Failed to load transfers.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Stock Transfers"
        description={
          data?.transfers?.length != null
            ? `${data.transfers.length} ${data.transfers.length === 1 ? "transfer" : "transfers"} on record`
            : "Inter-branch inventory transfers"
        }
      />

      <DataTable
        columns={columns}
        data={paginated}
        isLoading={isLoading}
        emptyMessage={
          statusFilter && !debouncedSearch
            ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} transfers`
            : "No transfers yet."
        }
        rowKey={(t) => t.id}
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
          placeholder="Search by transfer # or branch…"
          filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
        />
      </DataTable>
    </div>
  );
}
