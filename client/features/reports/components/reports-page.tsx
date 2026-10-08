"use client";

import { FinanceReportNav } from "./finance-report-nav";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { downloadExcel } from "@/lib/table-actions";
import { getReceiptRegisterRequest } from "@/features/invoices/api/invoice.api";
import { ReceiptManageModal } from "@/features/invoices/components/ReceiptManageModal";
import type { ReceiptRegisterRow } from "@/features/invoices/api/invoice.api";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";

const COLUMNS = [
  { key: "receiptNumber", label: "Receipt #" },
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "mode", label: "Mode" },
  { key: "bank", label: "Bank" },
  { key: "invoices", label: "Invoices" },
  { key: "advance", label: "Advance" },
  { key: "amount", label: "Total received (NGN)" },
];

const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function ReportsPage() {
  const branchId = useBranchStore((state) => state.activeBranch?.id);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState<"ALL" | "SERVICE_PARTS" | "SALES_ENQUIRY">("ALL");
  const [managedReceipt, setManagedReceipt] = useState<ReceiptRegisterRow | null>(null);
  const { hasPermission } = useAuth();
  const canReadReceipts = hasPermission("report:receipt-register") || hasPermission("financereport:read");
  const canManageReceipts = hasPermission("receipt:update") || hasPermission("receipt:cancel");
  const canEditReceipts = hasPermission("receipt:update");
  const canCancelReceipts = hasPermission("receipt:cancel");
  const report = useQuery({
    enabled: canReadReceipts,
    queryKey: ["receipt-register", branchId, from, to, category],
    queryFn: () => getReceiptRegisterRequest({ branchId, from: from || undefined, to: to || undefined, category }),
  });
  const receipts = report.data?.receipts ?? [];

  function exportRows() {
    downloadExcel(
      `dana-motors-receipt-register-${new Date().toISOString().slice(0, 10)}`,
      receipts.map((receipt) => ({
        receiptNumber: receipt.receiptNumber,
        date: new Date(receipt.issuedAt).toLocaleDateString("en-NG"),
        customer: receipt.customer.companyName || `${receipt.customer.firstName} ${receipt.customer.lastName}`,
        mode: receipt.mode,
        bank: receipt.bank?.name ?? "",
        invoices: receipt.allocations.map((allocation) => allocation.invoice?.invoiceNumber ?? allocation.debitNote?.number ?? "").join(", "),
        advance: receipt.advanceAmount,
        amount: receipt.amount,
      })),
      COLUMNS,
    );
  }

  if (!canReadReceipts) return <div className="flex flex-col gap-5 p-4 lg:p-6"><FinanceReportNav /><PageHeader title="Finance Reports" description="Choose a report to review party balances." /></div>;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <FinanceReportNav />
      <PageHeader
        title="Receipt Register"
        description="Receipts, allocations, and totals by payment mode."
        actions={
          <Button variant="outline" size="sm" onClick={exportRows} disabled={receipts.length === 0}>
            <FileSpreadsheet className="size-4" />
            <Download className="size-4" />
            Export Excel
          </Button>
        }
      />

      <section className="grid gap-4 border-y py-4 sm:grid-cols-3" aria-label="Receipt register filters">
        <Field label="From date">
          <input type="date" className={inputCls} value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To date">
          <input type="date" className={inputCls} value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Field label="Category">
          <select className={inputCls} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
            <option value="ALL">All</option>
            <option value="SERVICE_PARTS">Service and parts</option>
            <option value="SALES_ENQUIRY">Sales and enquiry</option>
          </select>
        </Field>
      </section>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" aria-live="polite">
        {Object.entries(report.data?.totalsByMode ?? {}).map(([mode, total]) => (
          <span key={mode}><span className="text-muted-foreground">{mode.replaceAll("_", " ")}</span> <strong>{currency.format(total)}</strong></span>
        ))}
        <span className="ml-auto font-semibold">Grand total {currency.format(report.data?.grandTotal ?? 0)}</span>
      </div>

      {report.isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground" aria-busy="true">Loading receipts...</div>
      ) : report.isError ? (
        <div className="py-12 text-center">
          <p role="alert" className="text-sm text-destructive">Receipt register could not be loaded.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => report.refetch()}>Retry</Button>
        </div>
      ) : receipts.length === 0 ? (
        <div className="border-y py-12 text-center text-sm text-muted-foreground">No receipts match these filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>{COLUMNS.map((column) => <th key={column.key} className="px-3 py-3 font-medium">{column.label}</th>)}{canManageReceipts && <th className="px-3 py-3 font-medium">Actions</th>}</tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-3 font-medium">{receipt.receiptNumber}</td>
                  <td className="px-3 py-3">{new Date(receipt.issuedAt).toLocaleDateString("en-NG")}</td>
                  <td className="px-3 py-3">{receipt.customer.companyName || `${receipt.customer.firstName} ${receipt.customer.lastName}`}</td>
                  <td className="px-3 py-3">{receipt.mode.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3">{receipt.bank?.name ?? "-"}</td>
                  <td className="px-3 py-3">{receipt.allocations.map((allocation) => allocation.invoice?.invoiceNumber ?? allocation.debitNote?.number ?? "").join(", ") || "Advance"}</td>
                  <td className="px-3 py-3 text-right">{currency.format(receipt.advanceAmount)}</td>
                  <td className="px-3 py-3 text-right font-medium">{currency.format(receipt.amount)}</td>
                  {canManageReceipts && <td className="px-3 py-3 text-right"><Button variant="outline" size="sm" disabled={Boolean(receipt.status && receipt.status !== "ACTIVE")} onClick={() => setManagedReceipt(receipt)}>Manage</Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ReceiptManageModal receipt={managedReceipt} onClose={() => setManagedReceipt(null)} canEdit={canEditReceipts} canCancel={canCancelReceipts} />
    </div>
  );
}
