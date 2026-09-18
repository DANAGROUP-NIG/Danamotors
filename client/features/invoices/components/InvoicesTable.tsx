"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Pencil,
  ReceiptText,
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  Eye,
  Filter,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
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
import { DateInput } from "@/components/forms/DateInput";
import { useBranchStore } from "@/store/branch.store";
import { useInvoices } from "../hooks/use-invoices";
import type { Invoice } from "../types/invoice.types";
import { EditInvoiceModal } from "./EditInvoiceModal";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { useAuth } from "@/features/auth/hooks/use-auth";

const PAGE_SIZE = 10;

const STATUS_STYLES: Record<string, string> = {
  Paid: "bg-green-100 text-green-700",
  Unpaid: "bg-amber-100 text-amber-700",
  "Partially Paid": "bg-blue-100 text-blue-700",
  Overdue: "bg-red-100 text-red-600",
};

const STATUS_OPTIONS = ["Paid", "Unpaid", "Partially Paid", "Overdue"] as const;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function exportColumns() {
  return [
    { key: "invoiceNumber", label: "Invoice #" },
    { key: "customerName", label: "Customer" },
    { key: "jobCardNumber", label: "Job Card" },
    { key: "issuedDate", label: "Issued Date" },
    { key: "dueDate", label: "Due Date" },
    { key: "subtotal", label: "Subtotal" },
    { key: "tax", label: "Tax" },
    { key: "total", label: "Total" },
    { key: "status", label: "Status" },
  ];
}

function invoiceToExportable(
  inv: Invoice,
): Record<string, string | number | null | undefined> {
  return {
    invoiceNumber: inv.invoiceNumber,
    customerName: `${inv.customer.firstName} ${inv.customer.lastName}`,
    jobCardNumber: inv.jobCard?.jobNumber ?? "",
    issuedDate: inv.issuedDate ? formatDate(inv.issuedDate) : "",
    dueDate: inv.dueDate ? formatDate(inv.dueDate) : "",
    subtotal: inv.subtotal,
    tax: inv.tax,
    total: inv.total,
    status: inv.status,
  };
}

function formatInvoiceText(inv: Invoice) {
  const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = inv.total - paid;
  return [
    `*Invoice ${inv.invoiceNumber}*`,
    `Customer: ${inv.customer.firstName} ${inv.customer.lastName}`,
    `Job card: ${inv.jobCard?.jobNumber ?? "—"}`,
    `Amount: ${formatCurrency(inv.total)}`,
    `Status: ${inv.status}`,
    `Outstanding: ${formatCurrency(outstanding)}`,
  ].join("\n");
}

function filename() {
  return `dana-motors-invoices-${new Date().toISOString().split("T")[0]}`;
}

function datePart(iso?: string): string | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function InvoicesTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { hasPermission } = useAuth();
  const canRecordPayment = hasPermission("payment:create");
  const canEdit = hasPermission("invoice:update");
  const activeBranch = useBranchStore((s) => s.activeBranch);

  useEffect(() => {
    setPage(1);
  }, [activeBranch?.id]);

  const { data, isLoading, isError, isFetching } = useInvoices({
    branchId: activeBranch?.id,
  });

  const allInvoices = useMemo(() => data?.invoices ?? [], [data?.invoices]);

  const filtered = useMemo(() => {
    const term = committedSearch.toLowerCase();
    return allInvoices.filter((inv) => {
      if (term) {
        const searchable = [inv.invoiceNumber, inv.customer?.firstName, inv.customer?.lastName].filter(
          (v): v is string => Boolean(v),
        );
        if (!searchable.some((v) => v.toLowerCase().includes(term))) return false;
      }
      if (statusFilter && inv.status !== statusFilter) return false;
      const issued = datePart(inv.issuedDate);
      if (startDate && (!issued || issued < startDate)) return false;
      if (endDate && (!issued || issued > endDate)) return false;
      return true;
    });
  }, [allInvoices, committedSearch, statusFilter, startDate, endDate]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const invoices = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selection = useDataTableSelection<Invoice>({
    data: invoices,
    rowKey: (inv) => inv.id,
  });

  function commitSearch() {
    setPage(1);
    setCommittedSearch(search);
  }

  function clearSearch() {
    setSearch("");
    setCommittedSearch("");
    setPage(1);
  }

  function clearFilters() {
    setStatusFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  }

  function exportSelected(items: Invoice[]) {
    downloadCsv(filename(), items.map(invoiceToExportable), exportColumns());
  }

  function exportSelectedExcel(items: Invoice[]) {
    downloadExcel(filename(), items.map(invoiceToExportable), exportColumns());
  }

  function shareSelected(items: Invoice[]) {
    const text = items.map(formatInvoiceText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Invoice${items.length === 1 ? "" : "s"}`,
      text,
    });
  }

  function emailSelected(items: Invoice[]) {
    const body = items.map(formatInvoiceText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Invoice${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Invoice[]) {
    const message = items.map(formatInvoiceText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  const columns: Column<Invoice>[] = [
    {
      header: "Invoice #",
      render: (inv) => <span className="font-medium">{inv.invoiceNumber}</span>,
    },
    {
      header: "Customer",
      render: (inv) => (
        <span className="text-muted-foreground">
          {inv.customer.firstName} {inv.customer.lastName}
        </span>
      ),
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
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              statusClass,
            )}
          >
            {inv.status}
          </span>
        );
      },
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (inv) => (
        <DataTableRowActions
          item={inv}
          quickActions={[
            canRecordPayment && {
              id: "record-payment",
              label: "Record payment",
              icon: <ReceiptText className="size-3.5" />,
              onClick: () => setPayingInvoice(inv),
            },
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-3.5" />,
              onClick: () => setEditingInvoice(inv),
            },
          ]}
          actions={[
            {
              id: "view",
              label: "View details",
              icon: <Eye className="size-4" />,
              onClick: () => router.push(`/invoices/${inv.id}`),
            },
            canEdit && {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="size-4" />,
              onClick: () => setEditingInvoice(inv),
            },
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([inv]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `Invoice ${inv.invoiceNumber}`,
                  text: formatInvoiceText(inv),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Invoice ${inv.invoiceNumber} from Dana Motors`,
                  body: formatInvoiceText(inv),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatInvoiceText(inv) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/invoices/${inv.id}`,
                  "Invoice link copied",
                ),
            },
          ]}
        />
      ),
    },
  ];

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value);
          setPage(1);
        }}
        className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <DateInput
        value={startDate}
        onChange={setStartDate}
        placeholder="From date"
        className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <DateInput
        value={endDate}
        onChange={setEndDate}
        placeholder="To date"
        className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {(statusFilter || startDate || endDate) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-9 text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 size-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );

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

  return (
    <>
      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          committedSearch || statusFilter || startDate || endDate
            ? "No invoices match your filters."
            : "No invoices yet."
        }
        rowKey={(inv) => inv.id}
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
            placeholder="Search by invoice # or customer…"
            isLoading={isLoading}
            isFetching={isFetching}
            filters={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "h-9 gap-1.5 transition-colors",
                  showFilters && "border-primary/30 bg-primary/5 text-primary",
                )}
              >
                <Filter className="size-3.5" />
                Filters
              </Button>
            }
          />

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {filters}
            </motion.div>
          )}

          <DataTableBulkToolbar
            selectedCount={selection.selectedIds.size}
            totalCount={total}
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

      <RecordPaymentModal
        isOpen={payingInvoice !== null}
        onClose={() => setPayingInvoice(null)}
        invoiceId={payingInvoice?.id}
      />
      {editingInvoice && (
        <EditInvoiceModal
          isOpen={true}
          onClose={() => setEditingInvoice(null)}
          invoice={editingInvoice}
        />
      )}
    </>
  );
}
