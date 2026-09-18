"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Download,
  FileSpreadsheet,
  Link2,
  Mail,
  MessageCircle,
  Package,
  Share2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { PageHeader } from "@/components/headers/page-header";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  copyToClipboard,
  downloadCsv,
  downloadExcel,
  openMailto,
  openWhatsApp,
  shareItems,
} from "@/lib/table-actions";
import { usePurchaseRequests } from "../hooks/use-purchase-requests";
import { useUpdatePurchaseRequestStatus } from "../hooks/use-update-purchase-request-status";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import type { PurchaseRequest } from "../types/purchase-request.types";

const PAGE_SIZE = 10;

type PurchaseRequestExportRow = Record<
  string,
  string | number | boolean | null | undefined
>;

const STATUS_FILTERS = ["", "Pending", "Approved", "Rejected"] as const;
const STATUS_LABELS: Record<string, string> = {
  "": "All",
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
};
const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((s) => ({ label: STATUS_LABELS[s], value: s }));

function exportColumns() {
  return [
    { key: "partName", label: "Part" },
    { key: "partNumber", label: "Part Number" },
    { key: "quantity", label: "Quantity" },
    { key: "requestedBy", label: "Requested By" },
    { key: "requestDate", label: "Request Date" },
    { key: "status", label: "Status" },
    { key: "approvalNotes", label: "Approval Notes" },
  ];
}

function toExportRow(pr: PurchaseRequest): PurchaseRequestExportRow {
  return {
    partName: pr.sparePart.name,
    partNumber: pr.sparePart.partNumber,
    quantity: pr.quantity,
    requestedBy: `${pr.requestedBy.firstName} ${pr.requestedBy.lastName}`,
    requestDate: new Date(pr.requestDate).toLocaleDateString(),
    status: pr.status,
    approvalNotes: pr.approvalNotes,
  };
}

function formatPurchaseRequestText(pr: PurchaseRequest) {
  return `*${pr.sparePart.name}*\nPart #: ${pr.sparePart.partNumber}\nQuantity: ${pr.quantity}\nRequested by: ${pr.requestedBy.firstName} ${pr.requestedBy.lastName}\nDate: ${new Date(pr.requestDate).toLocaleDateString()}\nStatus: ${pr.status}${pr.approvalNotes ? `\nNotes: ${pr.approvalNotes}` : ""}`;
}

function filename() {
  return `dana-motors-purchase-requests-${new Date().toISOString().split("T")[0]}`;
}

export function PurchaseRequestsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const update = useUpdatePurchaseRequestStatus();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(INVENTORY_PERMISSIONS.PURCHASEREQUEST_UPDATE);

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
  const { data: exportData } = usePurchaseRequests({ page: 1, limit: 1000 });

  const purchaseRequests = useMemo(() => data?.purchaseRequests ?? [], [data?.purchaseRequests]);
  const allPurchaseRequests = exportData?.purchaseRequests ?? [];
  const filtered = useMemo(
    () => debouncedSearch
      ? purchaseRequests.filter((pr) =>
          [pr.sparePart.name, pr.sparePart.partNumber]
            .filter((value): value is string => typeof value === "string")
            .some((value) => value.toLowerCase().includes(debouncedSearch.toLowerCase())),
        )
      : purchaseRequests,
    [debouncedSearch, purchaseRequests],
  );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selection = useDataTableSelection<PurchaseRequest>({
    data: filtered,
    rowKey: (purchaseRequest) => purchaseRequest.id,
  });

  function exportCsv(items: PurchaseRequest[]) {
    downloadCsv(filename(), items.map(toExportRow), exportColumns());
  }

  function exportExcel(items: PurchaseRequest[]) {
    downloadExcel(filename(), items.map(toExportRow), exportColumns());
  }

  function shareSelected(items: PurchaseRequest[]) {
    void shareItems({
      title: `${items.length} Dana Motors Purchase Request${items.length === 1 ? "" : "s"}`,
      text: items.map(formatPurchaseRequestText).join("\n\n---\n\n"),
    });
  }

  function emailSelected(items: PurchaseRequest[]) {
    openMailto({
      subject: `${items.length} Purchase Request${items.length === 1 ? "" : "s"} from Dana Motors`,
      body: items.map(formatPurchaseRequestText).join("\n\n---\n\n"),
    });
  }

  function whatsappSelected(items: PurchaseRequest[]) {
    openWhatsApp({ message: items.map(formatPurchaseRequestText).join("\n\n---\n\n") });
  }

  function handleApprove(pr: PurchaseRequest) {
    if (!confirm(`Approve purchase request for ${pr.sparePart.name} (qty: ${pr.quantity})?`)) return;
    update.mutate({ id: pr.id, status: "Approved" });
  }

  function handleReject(pr: PurchaseRequest) {
    const notes = prompt("Rejection reason (optional):");
    if (notes === null) return;
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
      render: (pr) => (
        <DataTableRowActions
          item={pr}
          quickActions={[
            canManage && pr.status === "Pending" && {
              id: "approve",
              label: "Approve",
              icon: <CheckCircle className="size-4" />,
              disabled: update.isPending,
              onClick: handleApprove,
            },
          ]}
          actions={[
            canManage && pr.status === "Pending" && {
              id: "reject",
              label: "Reject",
              icon: <XCircle className="size-4" />,
              destructive: true,
              disabled: update.isPending,
              onClick: handleReject,
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: (item) => exportCsv([item]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: (item) => shareSelected([item]),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: (item) => emailSelected([item]),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: (item) => whatsappSelected([item]),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: (item) => copyToClipboard(
                `${window.location.origin}/purchase-requests/${item.id}`,
                "Purchase request link copied",
              ),
            },
          ]}
        />
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
        actions={
          <ActionMenu
            align="end"
            trigger={
              <Button variant="outline" size="sm" disabled={allPurchaseRequests.length === 0} className="h-9 gap-1.5">
                <Download className="size-4" />
                Export
              </Button>
            }
          >
            <ActionMenuItem icon={<Download className="size-4" />} onClick={() => exportCsv(allPurchaseRequests)}>
              Export as CSV
            </ActionMenuItem>
            <ActionMenuItem icon={<FileSpreadsheet className="size-4" />} onClick={() => exportExcel(allPurchaseRequests)}>
              Export as Excel
            </ActionMenuItem>
          </ActionMenu>
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
        selection={selection}
      >
        <div className="flex flex-col gap-4">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={commitSearch}
            onClearSearch={clearSearch}
            placeholder="Search by part name or number…"
            filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
          />
          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={total}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              { id: "export", label: "CSV", icon: <Download className="size-3.5" />, onClick: exportCsv },
              { id: "excel", label: "Excel", icon: <FileSpreadsheet className="size-3.5" />, onClick: exportExcel },
              { id: "share", label: "Share", icon: <Share2 className="size-3.5" />, onClick: shareSelected },
              { id: "email", label: "Email", icon: <Mail className="size-3.5" />, onClick: emailSelected },
              { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="size-3.5" />, onClick: whatsappSelected },
            ]}
          />
        </div>
      </DataTable>
    </div>
  );
}
