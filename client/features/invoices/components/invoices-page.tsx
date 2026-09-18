"use client";

import Link from "next/link";
import { Plus, Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useInvoices } from "../hooks/use-invoices";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import type { Invoice } from "../types/invoice.types";
import { InvoicesTable } from "./InvoicesTable";

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
    issuedDate: inv.issuedDate
      ? new Date(inv.issuedDate).toLocaleDateString("en-NG")
      : "",
    dueDate: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-NG") : "",
    subtotal: inv.subtotal,
    tax: inv.tax,
    total: inv.total,
    status: inv.status,
  };
}

function filename() {
  return `dana-motors-invoices-${new Date().toISOString().split("T")[0]}`;
}

function ExportInvoicesButton() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data } = useInvoices({ branchId: activeBranch?.id });
  const invoices = data?.invoices ?? [];
  const disabled = invoices.length === 0;

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
          downloadCsv(
            filename(),
            invoices.map(invoiceToExportable),
            exportColumns(),
          )
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(
            filename(),
            invoices.map(invoiceToExportable),
            exportColumns(),
          )
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

export function InvoicesPage() {
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("invoice:create");
  const { data } = useInvoices({ branchId: activeBranch?.id });

  const total = data?.invoices?.length ?? 0;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Invoices"
        description={
          total > 0
            ? `${total} ${total === 1 ? "invoice" : "invoices"} on record`
            : "Customer invoices for completed services."
        }
        actions={
          <div className="flex items-center gap-2">
            <ExportInvoicesButton />
            {canCreate && (
              <Link href="/invoices/new">
                <Button size="sm">
                  <Plus className="size-4" />
                  New invoice
                </Button>
              </Link>
            )}
          </div>
        }
      />
      <InvoicesTable />
    </div>
  );
}
