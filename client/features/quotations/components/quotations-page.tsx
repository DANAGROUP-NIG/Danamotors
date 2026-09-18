"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  SearchX,
  Download,
  FileSpreadsheet,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
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
import { useBranchStore } from "@/store/branch.store";
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

function formatMoney(q: Quotation) {
  const symbol = q.currency === "NGN" ? "₦" : q.currency === "USD" ? "$" : q.currency ? `${q.currency} ` : "";
  return `${symbol}${q.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatQuotationText(q: Quotation) {
  const vehicle =
    [q.jobCard.vehicle.make, q.jobCard.vehicle.model].filter(Boolean).join(" ") ||
    q.jobCard.vehicle.vin;
  return [
    `*Quotation ${q.jobCard.jobNumber}*`,
    `Customer: ${q.jobCard.customer.firstName} ${q.jobCard.customer.lastName}`,
    `Vehicle: ${vehicle}`,
    `Description: ${q.description}`,
    `Amount: ${formatMoney(q)}`,
    `Status: ${q.status}`,
    `Issued: ${new Date(q.createdAt).toLocaleDateString()}`,
  ].join("\n");
}

function exportColumns() {
  return [
    { key: "jobNumber", label: "Job #" },
    { key: "customer", label: "Customer" },
    { key: "vehicle", label: "Vehicle" },
    { key: "description", label: "Description" },
    { key: "amount", label: "Amount" },
    { key: "currency", label: "Currency" },
    { key: "status", label: "Status" },
    { key: "issued", label: "Issued" },
  ];
}

function quotationToExportable(
  q: Quotation,
): Record<string, string | number | null | undefined> {
  return {
    jobNumber: q.jobCard.jobNumber,
    customer: `${q.jobCard.customer.firstName} ${q.jobCard.customer.lastName}`,
    vehicle:
      [q.jobCard.vehicle.make, q.jobCard.vehicle.model].filter(Boolean).join(" ") ||
      q.jobCard.vehicle.vin,
    description: q.description,
    amount: q.amount,
    currency: q.currency,
    status: q.status,
    issued: new Date(q.createdAt).toLocaleDateString("en-NG"),
  };
}

function filename() {
  return `dana-motors-quotations-${new Date().toISOString().split("T")[0]}`;
}

function ExportQuotationsButton() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useQuotations({ page: 1, limit: 1000 });
  const all = data?.estimates ?? [];
  const quotations = activeBranch
    ? all.filter((q) => q.jobCard.branchId === activeBranch.id)
    : all;
  const disabled = quotations.length === 0;

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() =>
          downloadCsv(filename(), quotations.map(quotationToExportable), exportColumns())
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(filename(), quotations.map(quotationToExportable), exportColumns())
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function QuotationsPage() {
  const router = useRouter();
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

  const quotations = useMemo(() => data?.estimates ?? [], [data?.estimates]);

  const selection = useDataTableSelection<Quotation>({
    data: quotations,
    rowKey: (q) => q.id,
  });

  function exportSelected(items: Quotation[]) {
    downloadCsv(filename(), items.map(quotationToExportable), exportColumns());
  }

  function exportSelectedExcel(items: Quotation[]) {
    downloadExcel(filename(), items.map(quotationToExportable), exportColumns());
  }

  function shareSelected(items: Quotation[]) {
    const text = items.map(formatQuotationText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Quotation${items.length === 1 ? "" : "s"}`,
      text,
    });
  }

  function emailSelected(items: Quotation[]) {
    const body = items.map(formatQuotationText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Quotation${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Quotation[]) {
    const message = items.map(formatQuotationText).join("\n\n---\n\n");
    openWhatsApp({ message });
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
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (q) => (
        <DataTableRowActions
          item={q}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => router.push(`/job-cards/${q.jobCardId}`),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([q]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `Quotation ${q.jobCard.jobNumber}`,
                  text: formatQuotationText(q),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Quotation ${q.jobCard.jobNumber} from Dana Motors`,
                  body: formatQuotationText(q),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatQuotationText(q) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/job-cards/${q.jobCardId}`,
                  "Quotation link copied",
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
        actions={<ExportQuotationsButton />}
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
        selection={selection}
        onRowClick={(q) => router.push(`/job-cards/${q.jobCardId}`)}
      >
        <div className="flex flex-col gap-4">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            onSearch={commitSearch}
            onClearSearch={clearSearch}
            placeholder="Search by job #, customer, or description…"
            filters={<DataTableFilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />}
          />

          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={data?.meta?.total ?? 0}
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
