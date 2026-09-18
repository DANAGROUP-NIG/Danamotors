"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Ban,
  CheckCircle,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Link2,
  Mail,
  MessageCircle,
  PackageCheck,
  Send,
  Share2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
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
import { useTransfers } from "../hooks/use-transfers";
import { useApproveTransfer, useDispatchTransfer, useReceiveTransfer, useRejectTransfer, useCancelTransfer } from "../hooks/use-transfer-mutations";
import type { Transfer } from "../types/transfer.types";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";

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

const TRANSFER_EXPORT_COLUMNS = [
  { key: "transferNumber", label: "Transfer #" },
  { key: "sourceBranch", label: "From" },
  { key: "requestingBranch", label: "To" },
  { key: "itemCount", label: "Items" },
  { key: "totalQuantity", label: "Total Quantity" },
  { key: "requestedBy", label: "Requested By" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Date" },
];

function transferExportRows(transfers: Transfer[]) {
  return transfers.map((transfer) => ({
    transferNumber: transfer.transferNumber,
    sourceBranch: transfer.sourceBranch.name,
    requestingBranch: transfer.requestingBranch.name,
    itemCount: transfer.items.length,
    totalQuantity: transfer.items.reduce((sum, item) => sum + item.requestedQuantity, 0),
    requestedBy: `${transfer.requestedBy.firstName} ${transfer.requestedBy.lastName}`,
    status: transfer.status,
    createdAt: new Date(transfer.createdAt).toLocaleDateString(),
  }));
}

function formatTransferText(transfer: Transfer) {
  const quantity = transfer.items.reduce((sum, item) => sum + item.requestedQuantity, 0);
  return `*Transfer ${transfer.transferNumber}*\nFrom: ${transfer.sourceBranch.name}\nTo: ${transfer.requestingBranch.name}\nItems: ${transfer.items.length} (${quantity} total)\nStatus: ${transfer.status}\nRequested by: ${transfer.requestedBy.firstName} ${transfer.requestedBy.lastName}\nDate: ${new Date(transfer.createdAt).toLocaleDateString()}`;
}

export function TransfersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { hasPermission } = useAuth();
  const canApprove = hasPermission(INVENTORY_PERMISSIONS.TRANSFER_APPROVE);
  const canReject = hasPermission(INVENTORY_PERMISSIONS.TRANSFER_REJECT);
  const canCancel = hasPermission(INVENTORY_PERMISSIONS.TRANSFER_CANCEL);
  const canDispatch = hasPermission(INVENTORY_PERMISSIONS.TRANSFER_DISPATCH);
  const canReceive = hasPermission(INVENTORY_PERMISSIONS.TRANSFER_RECEIVE);
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
  const { data: exportData } = useTransfers();

  const allTransfers = useMemo(() => data?.transfers ?? [], [data?.transfers]);
  const searched = useMemo(
    () =>
      debouncedSearch
        ? allTransfers.filter((transfer) =>
            [
              transfer.transferNumber,
              transfer.requestingBranch.name,
              transfer.sourceBranch.name,
            ].some((field) =>
              field.toLowerCase().includes(debouncedSearch.toLowerCase()),
            ),
          )
        : allTransfers,
    [allTransfers, debouncedSearch],
  );
  const total = searched.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginated = useMemo(
    () => searched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, searched],
  );
  const selection = useDataTableSelection<Transfer>({
    data: paginated,
    rowKey: (transfer) => transfer.id,
  });

  function exportTransfers(transfers: Transfer[], format: "csv" | "excel") {
    const filename = `transfers-${new Date().toISOString().split("T")[0]}`;
    const rows = transferExportRows(transfers);
    if (format === "csv") {
      downloadCsv(filename, rows, TRANSFER_EXPORT_COLUMNS);
    } else {
      downloadExcel(filename, rows, TRANSFER_EXPORT_COLUMNS);
    }
  }

  function shareTransfers(transfers: Transfer[]) {
    void shareItems({
      title: `${transfers.length} Dana Motors Transfer${transfers.length === 1 ? "" : "s"}`,
      text: transfers.map(formatTransferText).join("\n\n---\n\n"),
    });
  }

  function emailTransfers(transfers: Transfer[]) {
    openMailto({
      subject: `${transfers.length} Stock Transfer${transfers.length === 1 ? "" : "s"}`,
      body: transfers.map(formatTransferText).join("\n\n---\n\n"),
    });
  }

  function whatsappTransfers(transfers: Transfer[]) {
    openWhatsApp({ message: transfers.map(formatTransferText).join("\n\n---\n\n") });
  }

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
      render: (t) => {
        const mutationPending = approve.isPending || dispatch.isPending || receive.isPending;
        return (
          <DataTableRowActions
            item={t}
            quickActions={[
              t.status === "Pending" && canApprove && {
                id: "approve",
                label: "Approve",
                icon: <CheckCircle className="size-4" />,
                disabled: mutationPending,
                onClick: () => approve.mutate(t.id),
              },
              t.status === "Approved" && canDispatch && {
                id: "dispatch",
                label: "Dispatch",
                icon: <Send className="size-4" />,
                disabled: mutationPending,
                onClick: () => dispatch.mutate({ id: t.id }),
              },
              t.status === "Dispatched" && canReceive && {
                id: "receive",
                label: "Receive",
                icon: <PackageCheck className="size-4" />,
                disabled: mutationPending,
                onClick: () => receive.mutate({ id: t.id }),
              },
            ]}
            actions={[
              {
                id: "download",
                label: "Download CSV",
                icon: <Download className="size-4" />,
                onClick: () => exportTransfers([t], "csv"),
              },
              {
                id: "share",
                label: "Share",
                icon: <Share2 className="size-4" />,
                onClick: () => shareTransfers([t]),
              },
              {
                id: "email",
                label: "Email",
                icon: <Mail className="size-4" />,
                onClick: () => emailTransfers([t]),
              },
              {
                id: "whatsapp",
                label: "WhatsApp",
                icon: <MessageCircle className="size-4" />,
                onClick: () => whatsappTransfers([t]),
              },
              {
                id: "copy-link",
                label: "Copy link",
                icon: <Link2 className="size-4" />,
                shortcut: "⌘C",
                onClick: () =>
                  copyToClipboard(
                    `${window.location.origin}/transfers?transfer=${t.id}`,
                    "Transfer link copied",
                  ),
              },
              t.status === "Pending" && canReject && {
                id: "reject",
                label: "Reject",
                icon: <XCircle className="size-4" />,
                destructive: true,
                disabled: mutationPending,
                onClick: () => reject.mutate({ id: t.id }),
              },
              t.status === "Pending" && canCancel && {
                id: "cancel",
                label: "Cancel",
                icon: <Ban className="size-4" />,
                destructive: true,
                disabled: mutationPending,
                onClick: () => cancel.mutate(t.id),
              },
            ]}
          />
        );
      },
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
        actions={
          <ActionMenu
            align="end"
            trigger={
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="size-4" />
                Export
                <ChevronDown className="size-3.5" />
              </Button>
            }
          >
            <ActionMenuItem
              icon={<Download />}
              onClick={() => exportTransfers(exportData?.transfers ?? [], "csv")}
            >
              Export CSV
            </ActionMenuItem>
            <ActionMenuItem
              icon={<FileSpreadsheet />}
              onClick={() => exportTransfers(exportData?.transfers ?? [], "excel")}
            >
              Export Excel
            </ActionMenuItem>
          </ActionMenu>
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
        selection={selection}
      >
        <div className="flex flex-col gap-4">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={commitSearch}
            onClearSearch={clearSearch}
            placeholder="Search by transfer # or branch…"
            filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
          />
          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={total}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              {
                id: "export",
                label: "CSV",
                icon: <Download />,
                onClick: (items) => exportTransfers(items, "csv"),
              },
              {
                id: "excel",
                label: "Excel",
                icon: <FileSpreadsheet />,
                onClick: (items) => exportTransfers(items, "excel"),
              },
              {
                id: "share",
                label: "Share",
                icon: <Share2 />,
                onClick: shareTransfers,
              },
              {
                id: "email",
                label: "Email",
                icon: <Mail />,
                onClick: emailTransfers,
              },
              {
                id: "whatsapp",
                label: "WhatsApp",
                icon: <MessageCircle />,
                onClick: whatsappTransfers,
              },
            ]}
          />
        </div>
      </DataTable>
    </div>
  );
}
