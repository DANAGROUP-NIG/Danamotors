"use client";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, PackageCheck, PackageX, Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PART_SALE_PERMISSIONS } from "@/features/auth/roles";
import { useCancelOrder, useCustomerOrder, usePickOrder, useReleaseOrder } from "../hooks/use-part-sale";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  customerAddress,
  customerName,
  fmtCurrency,
  fmtDate,
  openQuantity,
} from "../lib/part-sale-format";
import type { CustomerOrder } from "../types/part-sale.types";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";

export function DetailField({ label, value, wide }: { label: string; value?: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 break-words text-sm text-slate-700">{value ?? "—"}</div>
    </div>
  );
}

function CancelDialog({ order, onClose }: { order: CustomerOrder; onClose: () => void }) {
  const cancel = useCancelOrder(order.id);
  const [remark, setRemark] = useState("");
  const billed = order.lines.some((l) => l.billedQuantity > 0);
  return (
    <ModalFame isOpen onClose={onClose} title={`Cancel CPO ${order.cpoNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          {billed
            ? "Billed quantities stay billed. Everything still open is cancelled and any picked stock goes back to free stock."
            : "The whole order is cancelled and any picked stock goes back to free stock."}
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
            {cancel.isPending ? "Cancelling…" : "Cancel order"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { data: order, isLoading, error } = useCustomerOrder(id);
  const { hasPermission } = useAuth();
  const pick = usePickOrder(id);
  const release = useReleaseOrder(id);
  const [cancelling, setCancelling] = useState(false);

  if (isLoading) {
    return <LoadingSkeleton variant="detail" />;
  }
  if (error || !order) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/part-sale/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Customer Orders
        </Link>
        <p className="text-sm text-red-500">Order not found, or you do not have access to it.</p>
      </div>
    );
  }

  const active = order.status === "OPEN" || order.status === "PARTLY_BILLED";
  const canOrder = active && hasPermission(PART_SALE_PERMISSIONS.ORDER);
  const canBill = active && hasPermission(PART_SALE_PERMISSIONS.BILL);
  const open = order.lines.reduce((s, l) => s + openQuantity(l), 0);
  const picked = order.lines.reduce((s, l) => s + l.pickedQuantity, 0);
  const pickable = order.lines.some((l) => openQuantity(l) > 0 && l.freeStock > 0);
  const bills = new Map<string, { id?: string; number: string; date: string; status: string }>();
  for (const line of order.lines) {
    for (const il of line.invoiceLines) {
      bills.set(il.invoice.id, {
        id: il.invoice.counterSale?.id,
        number: il.invoice.invoiceNumber,
        date: il.invoice.issuedDate,
        status: il.invoice.status,
      });
    }
  }

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/part-sale/orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Customer Orders
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          {canOrder && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 text-red-600" onClick={() => setCancelling(true)}>
                <Ban className="size-4" /> Cancel
              </Button>
              {picked > 0 && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={release.isPending} onClick={() => release.mutate()}>
                  <PackageX className="size-4" /> Release picked
                </Button>
              )}
              {open > 0 && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!pickable || pick.isPending} onClick={() => pick.mutate(undefined)}>
                  <PackageCheck className="size-4" /> {pick.isPending ? "Picking…" : "Pick free stock"}
                </Button>
              )}
            </>
          )}
          {canBill && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href={`/part-sale/counter-sales/new?orderId=${order.id}`}>
                <ReceiptText className="size-4" /> Bill
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Customer purchase order · {order.branch.name}</p>
              <h1 className="font-mono text-xl font-semibold text-slate-800">{order.cpoNumber}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {customerName(order.customer)}
                {order.customer.code && <span className="ml-1.5 font-mono">{order.customer.code}</span>}
              </p>
            </div>
            <StatusBadge status={ORDER_STATUS_LABELS[order.status]} tone={ORDER_STATUS_TONES[order.status]} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <DetailField label="CPO date" value={fmtDate(order.orderDate)} />
            <DetailField label="Valid till" value={fmtDate(order.validTill)} />
            <DetailField label="Customer ref. no." value={order.customerRefNo} />
            <DetailField label="Customer ref. date" value={fmtDate(order.customerRefDate)} />
            <DetailField wide label="Address" value={customerAddress(order.customer) || null} />
            <DetailField label="Phone" value={order.customer.phoneNumber} />
            <DetailField label="Value" value={fmtCurrency(order.totalAmount)} />
            <DetailField
              label="Created"
              value={`${order.createdBy ? `${order.createdBy.firstName} ${order.createdBy.lastName} · ` : ""}${fmtDate(order.createdAt)}`}
            />
            {order.closedAt && <DetailField label="Closed" value={fmtDate(order.closedAt)} />}
            {order.remarks && <DetailField wide label="Remarks" value={order.remarks} />}
            {order.cancelRemark && <DetailField wide label="Cancelled" value={`${fmtDate(order.cancelledAt)} · ${order.cancelRemark}`} />}
          </div>
        </div>

        {bills.size > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <p className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-700">Counter-sale bills</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-emerald-900">
              {[...bills.values()].map((b) => (
                <span key={b.number}>
                  {b.id ? (
                    <Link href={`/part-sale/counter-sales/${b.id}`} className="font-mono font-semibold hover:underline">
                      {b.number}
                    </Link>
                  ) : (
                    <span className="font-mono font-semibold">{b.number}</span>
                  )}{" "}
                  · {fmtDate(b.date)} · {b.status}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="mb-4 text-sm font-semibold text-slate-700">Order lines</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Part no.</th>
                  <th className={thCls}>Description</th>
                  <th className={thCls}>Bin</th>
                  <th className={cn(thCls, "text-right")}>Ordered</th>
                  <th className={cn(thCls, "text-right")}>Picked</th>
                  <th className={cn(thCls, "text-right")}>Billed</th>
                  <th className={cn(thCls, "text-right")}>Cancelled</th>
                  <th className={cn(thCls, "text-right")}>Open</th>
                  {active && <th className={cn(thCls, "text-right print:hidden")}>Free stock</th>}
                  <th className={cn(thCls, "text-right")}>Rate</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => {
                  const lineOpen = openQuantity(l);
                  return (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className={cn(tdCls, "font-mono font-medium")}>
                        <Link href={`/inventory/${l.partId}`} className="hover:underline">
                          {l.part.partNumber}
                        </Link>
                      </td>
                      <td className={cn(tdCls, "max-w-64 truncate")}>{l.part.name}</td>
                      <td className={cn(tdCls, "font-mono text-slate-500")}>{l.part.binLocation ?? ""}</td>
                      <td className={cn(tdCls, "text-right")}>{l.orderedQuantity}</td>
                      <td className={cn(tdCls, "text-right", l.pickedQuantity ? "font-medium text-blue-700" : "text-slate-300")}>{l.pickedQuantity}</td>
                      <td className={cn(tdCls, "text-right", l.billedQuantity ? "font-medium text-emerald-700" : "text-slate-300")}>{l.billedQuantity}</td>
                      <td className={cn(tdCls, "text-right", l.cancelledQuantity ? "text-red-600" : "text-slate-300")}>{l.cancelledQuantity}</td>
                      <td className={cn(tdCls, "text-right", lineOpen ? "font-medium text-amber-700" : "text-slate-300")}>{lineOpen}</td>
                      {active && (
                        <td className={cn(tdCls, "text-right print:hidden", l.freeStock > 0 ? "text-slate-600" : "text-red-600")}>{l.freeStock}</td>
                      )}
                      <td className={cn(tdCls, "text-right")}>{fmtCurrency(l.retailRate)}</td>
                      <td className={cn(tdCls, "text-right")}>{fmtCurrency(l.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {active && open > 0 && (
            <p className="mt-3 text-sm text-muted-foreground print:hidden">
              Picking reserves free stock for this customer. Billing uses picked units first, then any free stock.
            </p>
          )}
        </div>
      </div>

      {cancelling && <CancelDialog order={order} onClose={() => setCancelling(false)} />}
    </div>
  );
}
