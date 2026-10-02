"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInvoice } from "../hooks/use-invoice";
import { CancelJobBillModal } from "./CancelJobBillModal";
import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";

const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading, isError, refetch } = useInvoice(id);
  const { hasPermission } = useAuth();
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading bill...</div>;
  if (isError || !invoice) return <div className="p-8 text-center"><p role="alert" className="text-sm text-destructive">Bill could not be loaded.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button></div>;

  const cancelled = invoice.status.toLowerCase() === "cancelled";
  const paidAmount = Math.max(invoice.total - invoice.outstandingAmount, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 lg:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/invoices" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Invoices</Link>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" />Print</Button>{hasPermission("invoice:cancel") && invoice.jobCardId && !cancelled && <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>Cancel bill</Button>}</div>
      </div>

      <section className="grid gap-5 border-y py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-medium uppercase text-muted-foreground">Job bill</p><h1 className="mt-1 text-xl font-semibold">{invoice.invoiceNumber}</h1><p className="mt-1 text-sm text-muted-foreground">{invoice.jobCard?.jobNumber ?? "Job card"} · {invoice.customer.firstName} {invoice.customer.lastName}</p></div>
          <div className="text-right"><span className="inline-flex border px-2 py-1 text-sm font-medium">{invoice.status}</span><p className="mt-2 text-sm">Issued {new Date(invoice.issuedDate).toLocaleDateString("en-NG")}</p></div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt className="text-sm text-muted-foreground">Service advisor</dt><dd className="mt-1 text-sm">{invoice.serviceAdvisor ? `${invoice.serviceAdvisor.firstName} ${invoice.serviceAdvisor.lastName}` : "-"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Paid</dt><dd className="mt-1 text-sm">{currency.format(paidAmount)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Outstanding</dt><dd className="mt-1 text-sm font-semibold">{currency.format(invoice.outstandingAmount)}</dd></div>
        </dl>
      </section>

      <section className="grid gap-3">
        <h2 className="font-semibold">Bill lines</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="py-2">Type</th><th className="py-2">Description</th><th className="py-2 text-right">Qty / hours</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>
          {invoice.lines.map((line) => <tr key={line.id} className="border-b last:border-0"><td className="py-2">{line.type}</td><td className="py-2">{line.description}</td><td className="py-2 text-right">{line.quantity}</td><td className="py-2 text-right">{currency.format(line.rate)}</td><td className="py-2 text-right">{currency.format(line.amount)}</td></tr>)}
          {invoice.lines.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No bill lines available for this legacy invoice.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="ml-auto grid w-full max-w-sm grid-cols-2 gap-x-6 gap-y-2 border-t pt-4 text-sm">
        <span>Parts</span><span className="text-right">{currency.format(invoice.partsTotal)}</span>
        <span>Parts discount ({invoice.partsDiscountPercent}%)</span><span className="text-right">-{currency.format(invoice.partsDiscountAmount)}</span>
        <span>Labour</span><span className="text-right">{currency.format(invoice.labourTotal)}</span>
        <span>Labour discount ({invoice.labourDiscountPercent}%)</span><span className="text-right">-{currency.format(invoice.labourDiscountAmount)}</span>
        <span>VAT ({invoice.vatRate}%)</span><span className="text-right">{currency.format(invoice.vatAmount)}</span>
        <span>Round-off</span><span className="text-right">{currency.format(invoice.roundOff)}</span>
        <span className="border-t pt-2 font-semibold">Total</span><span className="border-t pt-2 text-right font-semibold">{currency.format(invoice.total)}</span>
      </section>

      <section className="grid gap-3 border-t pt-4">
        <h2 className="font-semibold">Receipts allocated</h2>
        {invoice.allocations.length === 0 ? <p className="text-sm text-muted-foreground">No receipts have been allocated.</p> : invoice.allocations.map((allocation) => <div key={allocation.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{allocation.receipt.receiptNumber ?? "Receipt"} · {allocation.receipt.mode ?? ""} · {new Date(allocation.receipt.issuedAt).toLocaleDateString("en-NG")}</span><span>{currency.format(allocation.amount)}</span></div>)}
      </section>

      {invoice.tallyPostedAt && <p className="border-t pt-4 text-sm text-muted-foreground">Posted to Tally as {invoice.tallyVoucherNo ?? "voucher"} on {new Date(invoice.tallyPostedAt).toLocaleString("en-NG")}.</p>}
      {cancelled && <p className="border-t pt-4 text-sm text-destructive">Cancelled: {invoice.cancelRemark || "No remark recorded"}</p>}
      {invoice.notes && <section className="border-t pt-4"><h2 className="font-semibold">Notes</h2><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</p></section>}
      {cancelOpen && <CancelJobBillModal invoice={invoice} isOpen={cancelOpen} onClose={() => setCancelOpen(false)} />}
    </div>
  );
}
