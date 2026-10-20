"use client";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, FileText, Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PART_SALE_PERMISSIONS } from "@/features/auth/roles";
import { DetailField } from "./OrderDetail";
import { useCancelCounterSale, useCounterSale, useCreateReturn } from "../hooks/use-part-sale";
import {
  BILL_STATUS_TONES,
  TRANSPORT_MODE_LABELS,
  customerAddress,
  customerName,
  fmtCurrency,
  fmtDate,
  previewSale,
} from "../lib/part-sale-format";
import type { CounterSale } from "../types/part-sale.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const toInt = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

function ReturnDialog({ sale, onClose }: { sale: CounterSale; onClose: () => void }) {
  const createReturn = useCreateReturn(sale.id);
  const returnable = sale.invoice.lines.filter((l) => l.partId && l.quantity - l.returnedQuantity > 0);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const values = returnable.map((line) => {
    const left = line.quantity - line.returnedQuantity;
    const q = toInt(qty[line.id] || "0");
    return { line, left, q, ok: Number.isFinite(q) && q <= left };
  });
  const invalid = values.some((v) => !v.ok);
  const chosen = values.filter((v) => v.ok && v.q > 0);
  const preview = previewSale(
    chosen.map((v) => ({ quantity: v.q, rate: v.line.rate, vatPercent: v.line.vatPercent ?? 0 })),
    sale.invoice.partsDiscountPercent,
  );

  return (
    <ModalFame isOpen onClose={onClose} title={`Sale return against ${sale.invoice.invoiceNumber}`} size="wide">
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Returned parts go back into {sale.branch.name} stock. The customer gets a credit note at the bill&apos;s discount
          and VAT, set off against the bill&apos;s outstanding first.
        </p>
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className={thCls}>Part</th>
                <th className={cn(thCls, "text-right")}>Billed</th>
                <th className={cn(thCls, "text-right")}>Returned</th>
                <th className={cn(thCls, "text-right")}>Return now</th>
                <th className={cn(thCls, "text-right")}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {values.map(({ line, left, ok }) => (
                <tr key={line.id} className="border-t border-slate-100">
                  <td className={tdCls}>
                    <p className="font-mono font-medium">{line.part?.partNumber}</p>
                    <p className="max-w-56 truncate text-slate-500">{line.description}</p>
                  </td>
                  <td className={cn(tdCls, "text-right")}>{line.quantity}</td>
                  <td className={cn(tdCls, "text-right text-slate-500")}>{line.returnedQuantity}</td>
                  <td className={cn(tdCls, "text-right")}>
                    <input
                      type="number"
                      min={0}
                      max={left}
                      className={cn(inputCls, "ml-auto h-9 w-20 text-right", !ok && "border-red-400")}
                      value={qty[line.id] ?? ""}
                      placeholder="0"
                      onChange={(e) => setQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    />
                  </td>
                  <td className={cn(tdCls, "text-right")}>{fmtCurrency(line.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invalid && <p className="text-sm text-red-500">A line cannot return more than was billed and not yet returned.</p>}
        <Field label="Reason (optional)">
          <input className={inputCls} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQty(Object.fromEntries(values.map((v) => [v.line.id, String(v.left)])))}
            >
              Full return
            </Button>
            <p className="text-sm text-slate-600">
              Credit {fmtCurrency(preview.total)}
              <span className="text-slate-400">
                {" "}
                (gross {fmtCurrency(preview.gross)} − discount {fmtCurrency(preview.discount)} + VAT {fmtCurrency(preview.vat)})
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              disabled={invalid || chosen.length === 0 || createReturn.isPending}
              onClick={() =>
                createReturn.mutate(
                  {
                    reason: reason.trim() || undefined,
                    lines: chosen.map((v) => ({ invoiceLineId: v.line.id, quantity: v.q })),
                  },
                  { onSuccess: onClose },
                )
              }
            >
              {createReturn.isPending ? "Recording…" : "Record return"}
            </Button>
          </div>
        </div>
      </div>
    </ModalFame>
  );
}

function CancelDialog({ sale, onClose }: { sale: CounterSale; onClose: () => void }) {
  const cancel = useCancelCounterSale(sale.id);
  const [remark, setRemark] = useState("");
  return (
    <ModalFame isOpen onClose={onClose} title={`Cancel bill ${sale.invoice.invoiceNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          The parts go back into stock and the order lines can be billed again. A bill with receipts, returns or a Tally
          posting cannot be cancelled.
        </p>
        <Field label="Reason">
          <input className={inputCls} maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="destructive"
            disabled={!remark.trim() || cancel.isPending}
            onClick={() => cancel.mutate(remark.trim(), { onSuccess: onClose })}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel bill"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

export function CounterSaleDetail({ id }: { id: string }) {
  const { data: sale, isLoading, error } = useCounterSale(id);
  const { hasPermission } = useAuth();
  const [dialog, setDialog] = useState<"return" | "cancel" | null>(null);

  if (isLoading) {
    return <LoadingSkeleton variant="detail" />;
  }
  if (error || !sale) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/part-sale/counter-sales" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Counter Sales
        </Link>
        <p className="text-sm text-red-500">Counter sale not found, or you do not have access to it.</p>
      </div>
    );
  }

  const { invoice } = sale;
  const cancelled = !!invoice.cancelledAt;
  const canReturn =
    !cancelled && hasPermission(PART_SALE_PERMISSIONS.RETURN) && invoice.lines.some((l) => l.quantity > l.returnedQuantity);
  const canCancel = !cancelled && hasPermission(PART_SALE_PERMISSIONS.BILL) && sale.returns.length === 0;
  const totalQty = invoice.lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/part-sale/counter-sales" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Counter Sales
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={`/invoices/${invoice.id}`}>
              <FileText className="size-4" /> Invoice &amp; receipts
            </Link>
          </Button>
          {canCancel && (
            <Button size="sm" variant="outline" className="gap-1.5 text-red-600" onClick={() => setDialog("cancel")}>
              <Ban className="size-4" /> Cancel
            </Button>
          )}
          {canReturn && (
            <Button size="sm" className="gap-1.5" onClick={() => setDialog("return")}>
              <Undo2 className="size-4" /> Sale return
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Counter sale · {sale.branch.name}</p>
              <h1 className="font-mono text-xl font-semibold text-slate-800">{invoice.invoiceNumber}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {customerName(invoice.customer)}
                {invoice.customer.code && <span className="ml-1.5 font-mono">{invoice.customer.code}</span>}
              </p>
            </div>
            <StatusBadge status={invoice.status} tone={BILL_STATUS_TONES[invoice.status] ?? "gray"} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <DetailField label="Invoice date" value={fmtDate(invoice.issuedDate)} />
            <DetailField label="Due date" value={fmtDate(invoice.dueDate)} />
            <DetailField wide label="Address" value={customerAddress(invoice.customer) || null} />
            <DetailField
              label="Sales executive"
              value={sale.salesExecutive ? `${sale.salesExecutive.firstName} ${sale.salesExecutive.lastName}` : null}
            />
            <DetailField label="Despatch mode" value={sale.transportMode ? TRANSPORT_MODE_LABELS[sale.transportMode] : null} />
            <DetailField label="Transporter" value={sale.transporter} />
            <DetailField
              label="GR no. / date"
              value={sale.grNumber ? `${sale.grNumber}${sale.grDate ? ` · ${fmtDate(sale.grDate)}` : ""}` : null}
            />
            <DetailField label="No. of cases" value={sale.numberOfCases} />
            <DetailField label="Outstanding" value={fmtCurrency(invoice.outstandingAmount)} />
            {invoice.notes && <DetailField wide label="Remarks" value={invoice.notes} />}
            {cancelled && (
              <DetailField
                wide
                label="Cancelled"
                value={`${fmtDate(invoice.cancelledAt)}${invoice.cancelledBy ? ` · ${invoice.cancelledBy.firstName} ${invoice.cancelledBy.lastName}` : ""} · ${invoice.cancelRemark ?? ""}`}
              />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="mb-4 text-sm font-semibold text-slate-700">Bill lines</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>CPO</th>
                  <th className={thCls}>Part no.</th>
                  <th className={thCls}>Description</th>
                  <th className={cn(thCls, "text-right")}>Qty</th>
                  <th className={cn(thCls, "text-right")}>Returned</th>
                  <th className={cn(thCls, "text-right")}>Rate</th>
                  <th className={cn(thCls, "text-right")}>VAT</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => {
                  const order = l.customerOrderLine?.order;
                  return (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className={tdCls}>
                        {order ? (
                          <Link href={`/part-sale/orders/${order.id}`} className="font-mono hover:underline">
                            {order.cpoNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={cn(tdCls, "font-mono font-medium")}>{l.part?.partNumber ?? ""}</td>
                      <td className={cn(tdCls, "max-w-64 truncate")}>{l.description}</td>
                      <td className={cn(tdCls, "text-right")}>{l.quantity}</td>
                      <td className={cn(tdCls, "text-right", l.returnedQuantity ? "text-red-600" : "text-slate-300")}>{l.returnedQuantity}</td>
                      <td className={cn(tdCls, "text-right")}>{fmtCurrency(l.rate)}</td>
                      <td className={cn(tdCls, "text-right")}>{l.vatPercent ? `${l.vatPercent}%` : "—"}</td>
                      <td className={cn(tdCls, "text-right")}>{fmtCurrency(l.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 ml-auto grid max-w-sm grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">Total items / qty</dt>
            <dd className="text-right">
              {invoice.lines.length} / {totalQty}
            </dd>
            <dt className="text-slate-500">Gross</dt>
            <dd className="text-right">{fmtCurrency(invoice.partsTotal)}</dd>
            <dt className="text-slate-500">Cash discount ({Number(invoice.partsDiscountPercent.toFixed(4))}%)</dt>
            <dd className="text-right">− {fmtCurrency(invoice.partsDiscountAmount)}</dd>
            <dt className="text-slate-500">VAT</dt>
            <dd className="text-right">{fmtCurrency(invoice.vatAmount)}</dd>
            <dt className="text-slate-500">Round off</dt>
            <dd className="text-right">{fmtCurrency(invoice.roundOff)}</dd>
            <dt className="font-semibold text-slate-800">Net amount</dt>
            <dd className="text-right font-semibold text-slate-800">{fmtCurrency(invoice.total)}</dd>
          </dl>
        </div>

        {sale.returns.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="mb-4 text-sm font-semibold text-slate-700">Sale returns</p>
            <div className="space-y-3">
              {sale.returns.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p>
                      <span className="font-mono font-semibold">{r.returnNumber}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {fmtDate(r.returnDate)}
                        {r.createdBy ? ` · ${r.createdBy.firstName} ${r.createdBy.lastName}` : ""}
                      </span>
                    </p>
                    <p className="font-medium">Credit {fmtCurrency(r.total)}</p>
                  </div>
                  <p className="mt-1 text-slate-600">
                    {r.lines.map((l) => `${l.part.partNumber} × ${l.quantity}`).join(", ")}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </p>
                  {r.creditNote && (
                    <p className="mt-1 text-slate-500">
                      Credit note <span className="font-mono">{r.creditNote.number}</span>
                      {r.creditNote.remainingAmount > 0
                        ? ` · ${fmtCurrency(r.creditNote.remainingAmount)} left as customer credit`
                        : " · set off against this bill"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {dialog === "return" && <ReturnDialog sale={sale} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && <CancelDialog sale={sale} onClose={() => setDialog(null)} />}
    </div>
  );
}
