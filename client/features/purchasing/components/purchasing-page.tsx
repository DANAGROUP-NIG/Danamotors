"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  SearchX,
  ShoppingCart,
  Download,
  FileSpreadsheet,
  Share2,
  Mail,
  MessageCircle,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTableFilterChips } from "@/components/ui/table-components/DataTableFilterChips";
import { DataTableBulkToolbar } from "@/components/ui/table-components/DataTableBulkToolbar";
import { DataTableRowActions } from "@/components/ui/table-components/DataTableRowActions";
import { useDataTableSelection } from "@/hooks/use-data-table-selection";
import {
  downloadCsv,
  downloadExcel,
  shareItems,
  openMailto,
  openWhatsApp,
  copyToClipboard,
} from "@/lib/table-actions";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amount);
}

function formatRequestDate(pr: PurchaseRequest) {
  return new Date(pr.requestDate ?? pr.createdAt).toLocaleDateString();
}

function formatPurchaseRequestText(pr: PurchaseRequest) {
  return `*${pr.sparePart.name}*\nPart Number: ${pr.sparePart.partNumber}\nRequested By: ${pr.requestedBy.firstName} ${pr.requestedBy.lastName}\nQuantity: ${pr.quantity}\nEst. Cost: ${formatCurrency(pr.sparePart.unitPrice * pr.quantity)}\nStatus: ${pr.status}\nDate: ${formatRequestDate(pr)}`;
}

function exportColumns() {
  return [
    { key: "item", label: "Item" },
    { key: "partNumber", label: "Part Number" },
    { key: "requestedBy", label: "Requested By" },
    { key: "quantity", label: "Quantity" },
    { key: "unitPrice", label: "Unit Price" },
    { key: "totalCost", label: "Est. Cost" },
    { key: "status", label: "Status" },
    { key: "requestDate", label: "Requested" },
  ];
}

function toExportRow(pr: PurchaseRequest) {
  return {
    item: pr.sparePart.name,
    partNumber: pr.sparePart.partNumber,
    requestedBy: `${pr.requestedBy.firstName} ${pr.requestedBy.lastName}`,
    quantity: pr.quantity,
    unitPrice: pr.sparePart.unitPrice,
    totalCost: pr.sparePart.unitPrice * pr.quantity,
    status: pr.status,
    requestDate: formatRequestDate(pr),
  };
}

export function PurchasingPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  function commitSearch() {
    setDebouncedSearch(search);
    setPage(1);
  }
  function clearSearch() {
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }

  const { data, isLoading, isError } = usePurchasing({
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
  });

  const purchaseRequests = useMemo(
    () => data?.purchaseRequests ?? [],
    [data?.purchaseRequests],
  );
  const filtered = useMemo(() => {
    if (!debouncedSearch) return purchaseRequests;
    const query = debouncedSearch.toLowerCase();
    return purchaseRequests.filter((pr) =>
      [pr.sparePart.name, pr.sparePart.partNumber]
        .filter((value): value is string => Boolean(value))
        .some((field) => field.toLowerCase().includes(query)),
    );
  }, [purchaseRequests, debouncedSearch]);

  const selection = useDataTableSelection<PurchaseRequest>({
    data: filtered,
    rowKey: (pr) => pr.id,
  });

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const filename = `purchase-orders-${today}`;

  function exportSelected(items: PurchaseRequest[]) {
    downloadCsv(filename, items.map(toExportRow), exportColumns());
  }

  function exportSelectedExcel(items: PurchaseRequest[]) {
    downloadExcel(filename, items.map(toExportRow), exportColumns());
  }

  function shareSelected(items: PurchaseRequest[]) {
    const text = items.map(formatPurchaseRequestText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Purchase Order${items.length === 1 ? "" : "s"}`,
      text,
    });
  }

  function emailSelected(items: PurchaseRequest[]) {
    const body = items.map(formatPurchaseRequestText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Purchase Order${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: PurchaseRequest[]) {
    const message = items.map(formatPurchaseRequestText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  function exportAll() {
    downloadCsv(filename, filtered.map(toExportRow), exportColumns());
  }

  function exportAllExcel() {
    downloadExcel(filename, filtered.map(toExportRow), exportColumns());
  }

  function copyLink() {
    copyToClipboard(window.location.href, "Purchase orders link copied");
  }

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
          {formatCurrency(pr.sparePart.unitPrice * pr.quantity)}
        </span>
      ),
    },
    {
      header: "Requested",
      render: (pr) => <span className="text-muted-foreground">{formatRequestDate(pr)}</span>,
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
        <DataTableRowActions
          item={pr}
          quickActions={[
            {
              id: "manage",
              label: "Manage",
              icon: <ShoppingCart className="size-3.5" />,
              onClick: () => router.push("/purchase-requests"),
            },
          ]}
          actions={[
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([pr]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: pr.sparePart.name,
                  text: formatPurchaseRequestText(pr),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Purchase Order: ${pr.sparePart.name}`,
                  body: formatPurchaseRequestText(pr),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatPurchaseRequestText(pr) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              onClick: copyLink,
            },
          ]}
        />
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
        actions={
          <ActionMenu
            trigger={
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Download className="size-3.5" />
                Export
              </Button>
            }
          >
            <ActionMenuItem icon={<Download className="size-4" />} onClick={exportAll}>
              Export CSV
            </ActionMenuItem>
            <ActionMenuItem icon={<FileSpreadsheet className="size-4" />} onClick={exportAllExcel}>
              Export Excel
            </ActionMenuItem>
          </ActionMenu>
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
            totalCount={filtered.length}
            selectedItems={selection.selectedItems}
            onClear={selection.clear}
            actions={[
              {
                id: "export",
                label: "CSV",
                icon: <Download className="size-3.5" />,
                variant: "ghost",
                onClick: exportSelected,
              },
              {
                id: "excel",
                label: "Excel",
                icon: <FileSpreadsheet className="size-3.5" />,
                variant: "ghost",
                onClick: exportSelectedExcel,
              },
              {
                id: "share",
                label: "Share",
                icon: <Share2 className="size-3.5" />,
                variant: "ghost",
                onClick: shareSelected,
              },
              {
                id: "email",
                label: "Email",
                icon: <Mail className="size-3.5" />,
                variant: "ghost",
                onClick: emailSelected,
              },
              {
                id: "whatsapp",
                label: "WhatsApp",
                icon: <MessageCircle className="size-3.5" />,
                variant: "ghost",
                onClick: whatsappSelected,
              },
            ]}
          />
        </div>
      </DataTable>
    </div>
  );
}
