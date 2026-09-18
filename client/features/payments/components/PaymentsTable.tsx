"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Share2,
  Mail,
  MessageCircle,
  Link2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import {
  DataTable,
  type Column,
} from "@/components/ui/table-components/DataTable";
import { DataTableToolbar } from "@/components/ui/table-components/DataTableToolbar";
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
import { usePayments } from "../hooks/use-payments";
import type { Payment } from "../types/payment.types";

const PAGE_SIZE = 10;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function customerName(p: Payment) {
  return p.invoice?.customer
    ? `${p.invoice.customer.firstName} ${p.invoice.customer.lastName}`
    : "";
}

function recordedByName(p: Payment) {
  return p.recordedBy
    ? `${p.recordedBy.firstName} ${p.recordedBy.lastName}`
    : "";
}

function formatPaymentText(p: Payment) {
  return `*Payment ${p.reference ?? p.id}*\nCustomer: ${customerName(p) || "—"}\nInvoice: ${p.invoice?.invoiceNumber ?? "—"}\nAmount: ${formatCurrency(p.amount)}\nMethod: ${p.method}\nDate: ${formatDate(p.paymentDate)}\nRecorded By: ${recordedByName(p) || "—"}`;
}

export function paymentExportColumns() {
  return [
    { key: "reference", label: "Reference" },
    { key: "customer", label: "Customer" },
    { key: "invoice", label: "Invoice" },
    { key: "amount", label: "Amount" },
    { key: "method", label: "Method" },
    { key: "paymentDate", label: "Date" },
    { key: "recordedBy", label: "Recorded By" },
  ];
}

export function toPaymentExportRow(p: Payment) {
  return {
    reference: p.reference ?? "",
    customer: customerName(p),
    invoice: p.invoice?.invoiceNumber ?? "",
    amount: p.amount,
    method: p.method,
    paymentDate: formatDate(p.paymentDate),
    recordedBy: recordedByName(p),
  };
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
          .filter((f): f is string => Boolean(f))
          .some((f) => f.toLowerCase().includes(debouncedSearch.toLowerCase())),
      )
    : allPayments;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginatedPayments = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selection = useDataTableSelection<Payment>({
    data: paginatedPayments,
    rowKey: (p) => p.id,
  });

  const today = new Date().toISOString().split("T")[0];
  const filename = `payments-${today}`;

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch() { setSearch(""); setDebouncedSearch(""); setPage(1); }

  function exportSelected(items: Payment[]) {
    downloadCsv(filename, items.map(toPaymentExportRow), paymentExportColumns());
  }

  function exportSelectedExcel(items: Payment[]) {
    downloadExcel(filename, items.map(toPaymentExportRow), paymentExportColumns());
  }

  function shareSelected(items: Payment[]) {
    const text = items.map(formatPaymentText).join("\n\n---\n\n");
    shareItems({
      title: `${items.length} Dana Motors Payment${items.length === 1 ? "" : "s"}`,
      text,
    });
  }

  function emailSelected(items: Payment[]) {
    const body = items.map(formatPaymentText).join("\n\n---\n\n");
    openMailto({
      subject: `${items.length} Payment${items.length === 1 ? "" : "s"} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Payment[]) {
    const message = items.map(formatPaymentText).join("\n\n---\n\n");
    openWhatsApp({ message });
  }

  const columns: Column<Payment>[] = [
    {
      header: "Reference",
      render: (p) =>
        p.reference ?? <span className="text-border">—</span>,
      className: "font-medium",
    },
    {
      header: "Customer",
      render: (p) => customerName(p) || "—",
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
      render: (p) => recordedByName(p) || "—",
      className: "text-muted-foreground",
    },
    {
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      render: (p) => (
        <DataTableRowActions
          item={p}
          actions={[
            {
              id: "download",
              label: "Download CSV",
              icon: <Download className="size-4" />,
              onClick: () => exportSelected([p]),
            },
            {
              id: "share",
              label: "Share",
              icon: <Share2 className="size-4" />,
              onClick: () =>
                shareItems({
                  title: `Payment ${p.reference ?? p.id}`,
                  text: formatPaymentText(p),
                }),
            },
            {
              id: "email",
              label: "Email",
              icon: <Mail className="size-4" />,
              onClick: () =>
                openMailto({
                  subject: `Payment: ${p.reference ?? p.id}`,
                  body: formatPaymentText(p),
                }),
            },
            {
              id: "whatsapp",
              label: "WhatsApp",
              icon: <MessageCircle className="size-4" />,
              onClick: () => openWhatsApp({ message: formatPaymentText(p) }),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: <Link2 className="size-4" />,
              shortcut: "⌘C",
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/payments/${p.id}`,
                  "Payment link copied",
                ),
            },
          ]}
        />
      ),
    },
  ];

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
      columns={columns}
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
      selection={selection}
    >
      <div className="flex flex-col gap-4">
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by reference, invoice, or customer…"
          isLoading={isLoading}
          isFetching={isFetching}
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
  );
}
