"use client";
import Link from "next/link";
import { BadgeCheck, CreditCard, FileText, Info, Loader2, MessageSquare, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { formatDateTime, formatMoney, NOT_PROVIDED } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  COMPARISON_LABELS,
  creditLine,
  differenceText,
  differenceTone,
  invoiceBlockedReason,
  invoiceFigures,
  noticeLine,
  PAYMENT_BADGE,
  paymentBlockedReason,
  storageLine,
} from "../../lib/billing.logic";
import type { JobBillingStep } from "../../types/job-billing.types";
import { StageCard } from "../workspace/StageCard";

function Muted({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** "Customer notified": the latest notice with Send again, the storage line and the washed tick. */
export function CustomerNoticeCard({
  step,
  readOnly,
  washPending,
  onSendAgain,
  onWashed,
}: {
  step: JobBillingStep;
  readOnly: boolean;
  /** The value being saved, shown at once so the tick answers the click. Undefined when nothing is saving. */
  washPending: boolean | undefined;
  onSendAgain: () => void;
  onWashed: (washed: boolean) => void;
}) {
  const [latest, ...earlier] = step.notices;
  const storage = storageLine(step.storage);
  const canWash = step.access.canMarkWashed && !readOnly;
  return (
    <StageCard title="Customer notified">
      {latest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
          <p className="flex min-w-0 items-start gap-2 text-sm">
            {latest.channel === "SMS" ? (
              <MessageSquare className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
            ) : (
              <Phone className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className="block font-semibold text-emerald-900">{noticeLine(latest)}</span>
              <span className="block text-emerald-900/80">By {latest.by ?? NOT_PROVIDED}{latest.note ? `. ${latest.note}` : ""}</span>
            </span>
          </p>
          {step.access.canNotify && !readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={onSendAgain}>
              <RefreshCw aria-hidden="true" />
              Send again
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm">
          {step.status === "QC"
            ? "The customer has not been told yet. Marking the vehicle ready records the notice."
            : "No notice is recorded for this job."}
          {step.status !== "QC" && step.access.canNotify && !readOnly && (
 <button type="button" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onSendAgain}>
              Record a notice
            </button>
          )}
        </p>
      )}
      {earlier.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Earlier notices ({earlier.length})</summary>
          <ul className="mt-2 space-y-1">
            {earlier.map((notice) => (
              <li key={notice.id}>
                {noticeLine(notice)}, by {notice.by ?? NOT_PROVIDED}
                {notice.note ? `. ${notice.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {storage && <Muted>{storage}</Muted>}
      <div className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3">
        <Checkbox
          id="vehicle-washed"
          checked={washPending ?? !!step.washed}
          disabled={!canWash || washPending !== undefined}
          onCheckedChange={(checked) => onWashed(checked)}
          aria-describedby="vehicle-washed-by"
        />
        <label htmlFor="vehicle-washed" className={cn("flex-1 py-2 text-sm font-medium", canWash && "cursor-pointer")}>
          Vehicle washed
        </label>
        {washPending !== undefined && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}
        <span id="vehicle-washed-by" className="text-xs text-muted-foreground">
          {step.washed ? `${step.washed.by ?? NOT_PROVIDED}, ${formatDateTime(step.washed.at)}` : canWash ? "" : "Not washed"}
        </span>
      </div>
    </StageCard>
  );
}

/** The paper job card's "Estimated and actual": customer amounts before VAT, right-aligned. */
export function ComparisonCard({ step }: { step: JobBillingStep }) {
  const rows = step.comparison.rows;
  return (
    <StageCard title="Estimated and actual" description="What the customer approved against what is charged, before VAT.">
      {!rows ? (
        <Muted>{step.comparison.problem ?? "The amounts could not be worked out yet."}</Muted>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm tabular-nums">
            <caption className="sr-only">Estimated and actual amounts</caption>
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-2 text-left font-medium">Item</th>
                <th scope="col" className="py-2 px-2 text-right font-medium">Estimated</th>
                <th scope="col" className="py-2 px-2 text-right font-medium">Actual</th>
                <th scope="col" className="py-2 pl-2 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const total = row.group === "TOTAL";
                const tone = differenceTone(row.difference);
                return (
                  <tr key={row.group} className={cn("border-b border-border last:border-0", total && "bg-muted/60 font-semibold")}>
                    <th scope="row" className="py-2 pr-2 text-left font-[inherit]">{COMPARISON_LABELS[row.group]}</th>
                    <td className="px-2 py-2 text-right">{formatMoney(row.estimated)}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(row.actual)}</td>
                    <td className={cn("py-2 pl-2 text-right", tone === "over" && "text-destructive", tone === "under" && "text-emerald-700")}>
                      {differenceText(row.difference)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </StageCard>
  );
}

/**
 * "Invoice": customer total, advance, balance due (largest) and the payment badge; Create invoice for
 * billing staff, Record payment for cashiers and the credit approval for managers, each disabled with
 * its reason. Also the warranty claim note, a cancelled bill and readiness reasons.
 */
export function InvoiceCard({
  step,
  readOnly,
  onCreateInvoice,
  onRecordPayment,
  onApproveCredit,
}: {
  step: JobBillingStep;
  readOnly: boolean;
  onCreateInvoice?: () => void;
  onRecordPayment?: () => void;
  onApproveCredit?: () => void;
}) {
  const figures = invoiceFigures(step);
  const badge = PAYMENT_BADGE[step.paymentStatus];
  const invoiceReason = invoiceBlockedReason(step);
  const paymentReason = paymentBlockedReason(step);
  const showCreate = !step.invoice && !step.nothingToPay && !!onCreateInvoice;
  const due = figures.balanceDue !== null && Number(figures.balanceDue) > 0;
  return (
    <StageCard
      title="Invoice"
      description={step.invoice ? `Invoice ${step.invoice.number}, ${formatDateTime(step.invoice.issuedAt)}` : step.draft?.total ? "Not created yet. The amounts are what the invoice will show." : undefined}
    >
      {step.nothingToPay ? (
        <Muted>The customer has nothing to pay on this job: the work is covered by warranty, a campaign or free service.</Muted>
      ) : !step.invoice && !step.draft ? (
        <Muted>The invoice amounts appear here once the vehicle is marked ready.</Muted>
      ) : (
        <>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm tabular-nums">
          <dt>Customer total</dt>
          <dd className="text-right">{figures.total ? formatMoney(figures.total) : NOT_PROVIDED}</dd>
          <dt>Advance paid</dt>
          <dd className="text-right">{formatMoney(figures.advancePaid)}</dd>
          {figures.paymentsReceived && (
            <>
              <dt>Payments received</dt>
              <dd className="text-right">{formatMoney(figures.paymentsReceived)}</dd>
            </>
          )}
        </dl>
        <p className={cn("flex items-center justify-between gap-3 rounded-lg px-3 py-2 font-semibold tabular-nums", due ? "bg-red-50 text-red-900" : "bg-muted/60")}>
          <span>Balance due</span>
          <span className="text-xl">{figures.balanceDue !== null ? formatMoney(figures.balanceDue) : NOT_PROVIDED}</span>
        </p>
        </>
      )}
      <div className="flex items-center justify-between text-sm">
        <span>Payment status</span>
        <StatusBadge status={badge.label} tone={badge.tone} className="normal-case" />
      </div>

      {step.credit && (
        <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {creditLine(step.credit)}
        </p>
      )}
      {step.cancelledBill && !step.invoice && (
        <Muted>
          Invoice {step.cancelledBill.number} was cancelled{step.cancelledBill.by ? ` by ${step.cancelledBill.by}` : ""}
          {step.cancelledBill.at ? ` on ${formatDateTime(step.cancelledBill.at)}` : ""}
          {step.cancelledBill.reason ? `: ${step.cancelledBill.reason}` : ""}. Create a new invoice.
        </Muted>
      )}
      {!step.invoice && step.draft && step.draft.blockers.length > 1 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
          {step.draft.blockers.slice(1).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {step.invoice && step.invoice.jobs.length > 1 && (
        <p className="text-sm">Jobs on this invoice: {step.invoice.jobs.map((job) => job.jobNumber).join(", ")}</p>
      )}

      {!readOnly || step.access.canCreateInvoice || step.access.canRecordPayment || step.access.canApproveCredit ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {showCreate && (
              <Button type="button" disabled={!!invoiceReason} aria-describedby={invoiceReason ? "invoice-blocked" : undefined} onClick={onCreateInvoice}>
                <FileText aria-hidden="true" />
                Create invoice
              </Button>
            )}
            {step.invoice && (
              <Button type="button" variant="outline" asChild>
                <Link href={`/invoices/${step.invoice.id}`}>
                  <FileText aria-hidden="true" />
                  View invoice
                </Link>
              </Button>
            )}
            {!step.nothingToPay && onRecordPayment && (
              <Button type="button" variant="outline" disabled={!!paymentReason} aria-describedby={paymentReason ? "payment-blocked" : undefined} onClick={onRecordPayment}>
                <CreditCard aria-hidden="true" />
                Record payment
              </Button>
            )}
          </div>
          {showCreate && invoiceReason && (
            <p id="invoice-blocked" className="text-sm text-muted-foreground">
              {invoiceReason}
            </p>
          )}
          {!step.nothingToPay && onRecordPayment && paymentReason && (step.invoice || !invoiceReason) && (
            <p id="payment-blocked" className="text-sm text-muted-foreground">
              {paymentReason}
            </p>
          )}
          {step.access.canApproveCredit && onApproveCredit && !step.nothingToPay && (
            <button type="button" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onApproveCredit}>
              Approve delivery on credit
            </button>
          )}
        </div>
      ) : null}

      {step.warrantyClaim && (
        <p className="flex items-start gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Warranty claim of {formatMoney(step.warrantyClaim.amount)} will be sent by {step.warrantyClaim.officer ?? "the warranty officer"}.
        </p>
      )}
    </StageCard>
  );
}
