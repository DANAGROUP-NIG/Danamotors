"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCancelPdiBill, usePdiBill, usePrintPdi } from "../hooks/use-pdi";
import { chargeLabel, formatDate, formatDateTime, formatMoney, PDI_PERMISSIONS, personName } from "../lib/pdi.logic";
import { PageState, pdiInput } from "./pdi-ui";

/** A PDI bill as printed: "PDI INVOICE" or "PDI CASH MEMO", lines, totals and the accounts voucher. */
export function PdiBillView({ id }: { id: string }) {
  const { data: bill, isLoading, error } = usePdiBill(id);
  const { hasPermission } = useAuth();
  const print = usePrintPdi();
  const cancel = useCancelPdiBill();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  if (isLoading) return <PageState loading />;
  if (error || !bill) return <PageState message="PDI bill not found, or you do not have access to it." />;

  const cancelled = !!bill.cancelledAt;
  const vehicle = bill.job.vehicle;
  const customer = bill.customer.companyName || `${bill.customer.firstName} ${bill.customer.lastName}`;
  const noCharge = bill.jobLines.filter(line => !line.chargeable);

  return (
    <div className="px-4 py-6 lg:px-6 print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/pdi/${bill.job.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {bill.job.jobNumber}</Link>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => print.mutate({ kind: "bill", id: bill.id })}><Printer className="size-4" /> Print</Button>
          {hasPermission(PDI_PERMISSIONS.BILL) && !cancelled && <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => setCancelling(true)}><XCircle className="size-4" /> Cancel bill</Button>}
        </div>
      </div>

      <article className={cn("mx-auto max-w-4xl rounded-xl border border-border bg-card p-8 print:max-w-none print:rounded-none print:border-0", cancelled && "opacity-80")}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-foreground pb-4">
          <div>
            <p className="text-lg font-bold tracking-wide">DANA MOTORS</p>
            <p className="text-sm text-muted-foreground">{bill.job.branch.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{bill.printTitle}</p>
            <p className="font-mono">{bill.invoiceNumber}</p>
            <p className="text-sm">{formatDate(bill.issuedDate)}</p>
            {cancelled && <p className="mt-1 text-sm font-bold uppercase text-destructive">Cancelled {formatDate(bill.cancelledAt)}</p>}
          </div>
        </header>

        <section className="grid gap-6 py-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Bill to</p>
            <p className="font-semibold">{customer}</p>
            {bill.customer.address && <p>{bill.customer.address}</p>}
            {bill.creditCompany && <p className="mt-1">Credit company: {bill.creditCompany}{bill.cardNumber ? ` · Card ${bill.cardNumber}` : ""}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">PDI job no.</dt><dd className="font-mono">{bill.job.jobNumber}</dd>
            <dt className="text-muted-foreground">Job date</dt><dd>{formatDate(bill.job.createdAt)}</dd>
            <dt className="text-muted-foreground">PDI reg.</dt><dd className="font-mono">{bill.job.pdiRegistration ?? "—"}</dd>
            <dt className="text-muted-foreground">VIN</dt><dd className="font-mono">{vehicle?.vin}</dd>
            <dt className="text-muted-foreground">Model / variant</dt><dd>{[vehicle?.catalogue?.parent?.description ?? vehicle?.model, vehicle?.catalogue?.description].filter(Boolean).join(" · ") || "—"}</dd>
            <dt className="text-muted-foreground">Engineer</dt><dd>{personName(bill.job.engineer)}</dd>
            <dt className="text-muted-foreground">Delivery adviser</dt><dd>{personName(bill.serviceAdvisor)}</dd>
          </dl>
        </section>

        <table className="w-full border-collapse text-sm">
          <thead><tr className="border-y border-foreground">{["Description", "Qty", "Rate", "Amount"].map(label => <th key={label} className={cn("px-2 py-2 text-left font-semibold", label !== "Description" && "text-right")}>{label}</th>)}</tr></thead>
          <tbody>
            {bill.lines.length ? bill.lines.map(line => (
              <tr key={line.id} className="border-b border-border">
                <td className="px-2 py-1.5">{line.description}<span className="ml-2 text-xs text-muted-foreground">{line.type === "PART" ? "Part" : line.type === "LABOUR" ? "Labour" : "Service"}</span></td>
                <td className="px-2 py-1.5 text-right tabular-nums">{line.quantity}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.rate)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.amount)}</td>
              </tr>
            )) : <tr><td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">No chargeable lines (zero bill).</td></tr>}
          </tbody>
        </table>

        {noCharge.length > 0 && (
          <div className="mt-4 text-xs text-muted-foreground">
            <p className="font-semibold uppercase tracking-wider">Done at no charge</p>
            <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
              {noCharge.map((line, index) => <li key={index}>{line.description} · {chargeLabel(line.chargeType)} · {formatMoney(line.amount)}</li>)}
            </ul>
          </div>
        )}

        <dl className="ml-auto mt-6 w-full max-w-sm space-y-1 text-sm">
          {[
            ["Spares", bill.partsTotal], ["Spares discount", -bill.partsDiscountAmount], ["Labour / service", bill.labourTotal + bill.serviceTotal],
            ["Labour discount", -bill.labourDiscountAmount], [`VAT on labour (${bill.vatRate}%)`, bill.vatAmount], ["Round off", bill.roundOff],
          ].map(([label, value]) => <div key={label as string} className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatMoney(value as number)}</dd></div>)}
          <div className="flex justify-between border-t-2 border-foreground pt-2 text-base font-bold"><dt>Net bill amount</dt><dd className="tabular-nums">{formatMoney(bill.total)}</dd></div>
        </dl>

        <section className="mt-6 grid gap-4 rounded-lg border border-border p-4 text-sm sm:grid-cols-4 print:hidden">
          <div><p className="text-xs uppercase text-muted-foreground">Bill for</p><p>{bill.pdiBillType === "INVOICE" ? "Invoice (credit)" : bill.pdiBillType === "ZERO" ? "Zero bill" : "Cash memo"}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Voucher no.</p><p className="font-mono">{bill.voucher.number ?? "—"}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Voucher type</p><p>{bill.voucher.type}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Accounts posting</p><p>{bill.voucher.status === "NOT_POSTED" ? "Off in PDI settings" : bill.total === 0 ? "Not posted (zero bill)" : bill.voucher.status}{bill.voucher.postedAt ? ` · ${formatDateTime(bill.voucher.postedAt)}` : ""}</p></div>
        </section>
        {bill.notes && <p className="mt-4 text-sm">Remarks: {bill.notes}</p>}
        {bill.cancelRemark && <p className="mt-2 text-sm text-destructive">Cancellation: {bill.cancelRemark}</p>}
        <footer className="mt-16 hidden grid-cols-3 gap-6 text-sm print:grid">
          {["Prepared by", "Delivery adviser", "Customer"].map(label => <p key={label} className="border-t border-foreground pt-1 text-center">{label}</p>)}
        </footer>
      </article>

      <ModalFame isOpen={cancelling} onClose={() => setCancelling(false)} title={`Cancel ${bill.invoiceNumber}`} description="Not possible after Tally export or receipts. The PDI job goes back to vehicle ready and the vehicle's PDI done is undone.">
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); cancel.mutate({ id: bill.id, reason: reason.trim() }, { onSuccess: () => setCancelling(false) }); }}>
          <label className="grid gap-1.5 text-sm font-semibold">Reason<textarea className={`${pdiInput} h-24 py-2`} required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelling(false)}>Back</Button>
            <Button variant="destructive" disabled={!reason.trim() || cancel.isPending}>Cancel bill</Button>
          </div>
        </form>
      </ModalFame>
    </div>
  );
}
