"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { NumberInput } from "@/components/forms/NumberInput";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { CHALLAN_PERMISSIONS } from "@/features/auth/roles";
import { DetailField } from "@/features/part-sale/components/OrderDetail";
import { customerAddress, customerName, fmtCurrency, fmtDate } from "@/features/part-sale/lib/part-sale-format";
import { cn } from "@/lib/utils";
import { useChallan, useCreateChallanReturn } from "../hooks/use-challans";
import type { Challan } from "../types/challan.types";
import { ChallanPrint } from "./ChallanPrint";

const thCls = "px-3 py-2 text-left text-sm font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap";
const tdCls = "px-3 py-2 whitespace-nowrap";
const outstanding = (l: { quantity: number; returnedQuantity: number }) => l.quantity - l.returnedQuantity;

/** Status from what is still out with the cost centre. */
export function challanStatus(issued: number, returned: number): { label: string; tone: "blue" | "amber" | "gray" } {
  if (returned <= 0) return { label: "Issued", tone: "blue" };
  if (returned >= issued) return { label: "Returned", tone: "gray" };
  return { label: "Partly returned", tone: "amber" };
}

function ReturnDialog({ challan, onClose }: { challan: Challan; onClose: () => void }) {
  const createReturn = useCreateChallanReturn(challan.id);
  const open = challan.lines.filter((l) => outstanding(l) > 0);
  const [qty, setQty] = useState<Record<string, number | null>>({});
  const [reason, setReason] = useState("");

  const values = open.map((line) => {
    const left = outstanding(line);
    const q = qty[line.id] ?? 0;
    return { line, left, q, ok: Number.isInteger(q) && q >= 0 && q <= left };
  });
  const invalid = values.some((v) => !v.ok);
  const chosen = values.filter((v) => v.ok && v.q > 0);
  const full = chosen.length === open.length && chosen.every((v) => v.q === v.left);
  const amount = chosen.reduce((s, v) => s + v.q * v.line.rate, 0);

  return (
    <ModalFame isOpen onClose={onClose} title={`Return against challan ${challan.challanNumber}`} size="wide">
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">Returned parts go back into {challan.branch.name} stock at the rate they were issued at.</p>
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className={thCls}>Part</th>
                <th className={cn(thCls, "text-right")}>Issued</th>
                <th className={cn(thCls, "text-right")}>Returned</th>
                <th className={cn(thCls, "text-right")}>Return now</th>
                <th className={cn(thCls, "text-right")}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {values.map(({ line, left, ok }) => (
                <tr key={line.id} className="border-t border-slate-100">
                  <td className={tdCls}>
                    <p className="font-mono font-medium">{line.part.partNumber}</p>
                    <p className="max-w-56 truncate text-slate-500">{line.part.name}</p>
                  </td>
                  <td className={cn(tdCls, "text-right")}>{line.quantity}</td>
                  <td className={cn(tdCls, "text-right text-slate-500")}>{line.returnedQuantity}</td>
                  <td className={cn(tdCls, "text-right")}>
                    <NumberInput
                      min={0}
                      max={left}
                      step={1}
                      placeholder="0"
                      aria-label={`Return quantity of ${line.part.partNumber}`}
                      className={cn(inputCls, "ml-auto h-9 w-24 text-right", !ok && "border-red-400")}
                      value={qty[line.id] ?? null}
                      onValueChange={(v) => setQty((prev) => ({ ...prev, [line.id]: v }))}
                    />
                  </td>
                  <td className={cn(tdCls, "text-right")}>{fmtCurrency(line.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invalid && <p className="text-sm text-red-500">Enter whole quantities, no more than is still out on each line.</p>}
        <Field label="Reason (optional)">
          <input className={inputCls} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setQty(Object.fromEntries(values.map((v) => [v.line.id, v.left])))}>
              Full return
            </Button>
            <p className="text-sm text-slate-600">
              {chosen.reduce((s, v) => s + v.q, 0)} units · {fmtCurrency(amount)}
              {full && <span className="ml-1.5 text-slate-400">(full return)</span>}
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
                  full
                    ? { reason: reason.trim() || undefined, fullReturn: true }
                    : { reason: reason.trim() || undefined, lines: chosen.map((v) => ({ challanLineId: v.line.id, quantity: v.q })) },
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

export function ChallanDetail({ id }: { id: string }) {
  const { data: challan, isLoading, error } = useChallan(id);
  const { hasPermission } = useAuth();
  const [returning, setReturning] = useState(false);

  if (isLoading) return <LoadingSkeleton variant="detail" />;
  if (error || !challan) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/part-sale/challans" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Dispatch Challans
        </Link>
        <p className="text-sm text-red-500">Challan not found, or you do not have access to it.</p>
      </div>
    );
  }

  const returned = challan.lines.reduce((s, l) => s + l.returnedQuantity, 0);
  const status = challanStatus(challan.totalQuantity, returned);
  const canReturn = hasPermission(CHALLAN_PERMISSIONS.RETURN) && challan.lines.some((l) => outstanding(l) > 0);

  return (
    <div className="px-4 py-6 lg:px-6 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/part-sale/challans" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Dispatch Challans
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          {canReturn && (
            <Button size="sm" className="gap-1.5" onClick={() => setReturning(true)}>
              <Undo2 className="size-4" /> Challan return
            </Button>
          )}
        </div>
      </div>

      {/* On paper the formal challan (ChallanPrint) replaces the screen view. */}
      <div className="space-y-5 print:hidden">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Dispatch challan · {challan.branch.name}</p>
              <h1 className="font-mono text-xl font-semibold text-slate-800">{challan.challanNumber}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {customerName(challan.customer)}
                {challan.customer.code && <span className="ml-1.5 font-mono">{challan.customer.code}</span>}
              </p>
            </div>
            <StatusBadge status={status.label} tone={status.tone} />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <DetailField label="Challan date" value={fmtDate(challan.challanDate)} />
            <DetailField label="Gate pass" value={challan.gatePassNumber} />
            <DetailField label="Issued by" value={challan.createdBy ? `${challan.createdBy.firstName} ${challan.createdBy.lastName}` : null} />
            <DetailField label="Value" value={fmtCurrency(challan.totalAmount)} />
            <DetailField wide label="Address" value={customerAddress(challan.customer) || null} />
            {challan.remarks && <DetailField wide label="Remarks" value={challan.remarks} />}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="mb-4 text-sm font-semibold text-slate-700">Lines</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Part no.</th>
                  <th className={thCls}>Description</th>
                  <th className={thCls}>UOM</th>
                  <th className={cn(thCls, "text-right")}>Qty issued</th>
                  <th className={cn(thCls, "text-right")}>Returned</th>
                  <th className={cn(thCls, "text-right")}>Rate</th>
                  <th className={cn(thCls, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {challan.lines.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className={cn(tdCls, "font-mono font-medium")}>{l.part.partNumber}</td>
                    <td className={cn(tdCls, "max-w-64 truncate")}>{l.part.name}</td>
                    <td className={cn(tdCls, "text-slate-500")}>{l.part.uom}</td>
                    <td className={cn(tdCls, "text-right")}>{l.quantity}</td>
                    <td className={cn(tdCls, "text-right text-slate-500")}>{l.returnedQuantity || "—"}</td>
                    <td className={cn(tdCls, "text-right")}>{fmtCurrency(l.rate)}</td>
                    <td className={cn(tdCls, "text-right font-medium")}>{fmtCurrency(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className={tdCls} colSpan={3}>
                    Total ({challan.lines.length} {challan.lines.length === 1 ? "item" : "items"})
                  </td>
                  <td className={cn(tdCls, "text-right")}>{challan.totalQuantity}</td>
                  <td className={cn(tdCls, "text-right")}>{returned || "—"}</td>
                  <td className={tdCls} />
                  <td className={cn(tdCls, "text-right")}>{fmtCurrency(challan.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {challan.returns.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="mb-4 text-sm font-semibold text-slate-700">Returns</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thCls}>Return no.</th>
                    <th className={thCls}>Date</th>
                    <th className={thCls}>Parts</th>
                    <th className={cn(thCls, "text-right")}>Qty</th>
                    <th className={cn(thCls, "text-right")}>Amount</th>
                    <th className={thCls}>Reason</th>
                    <th className={thCls}>By</th>
                  </tr>
                </thead>
                <tbody>
                  {challan.returns.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className={cn(tdCls, "font-mono")}>
                        {r.returnNumber}
                        {r.fullReturn && <span className="ml-1.5 text-xs text-slate-400">full</span>}
                      </td>
                      <td className={tdCls}>{fmtDate(r.returnDate)}</td>
                      <td className={cn(tdCls, "max-w-64 truncate")}>{r.lines.map((l) => `${l.part.partNumber} × ${l.quantity}`).join(", ")}</td>
                      <td className={cn(tdCls, "text-right")}>{r.totalQuantity}</td>
                      <td className={cn(tdCls, "text-right")}>{fmtCurrency(r.totalAmount)}</td>
                      <td className={cn(tdCls, "text-slate-500")}>{r.reason ?? "—"}</td>
                      <td className={cn(tdCls, "text-slate-500")}>{r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ChallanPrint challan={challan} />

      {returning && <ReturnDialog challan={challan} onClose={() => setReturning(false)} />}
    </div>
  );
}
