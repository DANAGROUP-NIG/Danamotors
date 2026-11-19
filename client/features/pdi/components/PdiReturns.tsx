"use client";
import { useState } from "react";
import { Printer, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCancelReturn, useCreateReturn } from "../hooks/use-pdi";
import { formatDateTime, returnable, sumMoney } from "../lib/pdi.logic";
import type { PdiJob, PdiReturn } from "../types/pdi.types";
import { ChargePill, EmptyNote, MoneyText, PdiField, TotalsStrip, pdiInput, pdiNumberInput, tdCls, thCls } from "./pdi-ui";

/** PDI requisition return: one of this job's requisitions, quantity ≤ issued − already returned; stock goes back. */
export function ReturnForm({ job }: { job: PdiJob }) {
  const create = useCreateReturn();
  const issued = job.requisitions.filter(doc => doc.status === "ISSUED" && doc.lines.some(line => returnable(line) > 0));
  const [requisitionId, setRequisitionId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const requisition = issued.find(doc => doc.id === requisitionId);
  const rows = (requisition?.lines ?? []).map(line => {
    const max = returnable(line);
    const raw = quantities[line.id] ?? "";
    const quantity = Number(raw || 0);
    return { line, max, raw, quantity, invalid: !Number.isInteger(quantity) || quantity < 0 || quantity > max };
  });
  const chosen = rows.filter(row => row.quantity > 0 && !row.invalid);
  const invalid = rows.some(row => row.invalid);

  if (!issued.length) return <EmptyNote>No issued parts left to return on this PDI.</EmptyNote>;

  return (
    <div className="space-y-4">
      <PdiField label="Requisition" required hint="Only this PDI job's issued requisitions">
        <select className={cn(pdiInput, "max-w-md")} value={requisitionId} onChange={event => { setRequisitionId(event.target.value); setQuantities({}); }}>
          <option value="">Choose a requisition</option>
          {issued.map(doc => <option key={doc.id} value={doc.id}>{doc.requisitionNumber} · {formatDateTime(doc.requisitionDate)}</option>)}
        </select>
      </PdiField>
      {requisition && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><ChargePill type={requisition.chargeType} /> Requisition date {formatDateTime(requisition.requisitionDate)}</div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40"><tr>{["Part no.", "Flag", "Qty req.", "Qty iss.", "Can return", "Rate", "Qty returned", "Amount"].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ line, max, raw, quantity, invalid: bad }) => (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className={tdCls}><span className="font-mono">{line.partNumber ?? line.sparePart?.partNumber}</span><p className="text-xs text-muted-foreground">{line.description}</p></td>
                    <td className={tdCls}>{line.partSource}</td>
                    <td className={cn(tdCls, "tabular-nums")}>{line.quantityRequired}</td>
                    <td className={cn(tdCls, "tabular-nums")}>{line.quantityIssued}</td>
                    <td className={cn(tdCls, "tabular-nums font-semibold")}>{max}</td>
                    <td className={tdCls}><MoneyText value={line.rate} /></td>
                    <td className={cn(tdCls, "w-32")}>
                      <input aria-label={`Return quantity for ${line.partNumber ?? line.description}`} aria-invalid={bad} disabled={!max} className={cn(pdiNumberInput, bad && "border-destructive")} inputMode="numeric" placeholder="0" value={raw} onChange={event => setQuantities(current => ({ ...current, [line.id]: event.target.value.replace(/[^0-9]/g, "") }))} />
                      {bad && <p className="mt-1 text-xs text-destructive">At most {max}</p>}
                    </td>
                    <td className={tdCls}><MoneyText value={bad ? 0 : sumMoney([Number(line.rate) * quantity])} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TotalsStrip items={[
            { label: "Number of items", value: chosen.length },
            { label: "Net quantity returned", value: chosen.reduce((sum, row) => sum + row.quantity, 0) },
            { label: "Total amount", value: <MoneyText value={sumMoney(chosen.map(row => Number(row.line.rate) * row.quantity))} />, strong: true },
          ]} />
          <div className="flex justify-end">
            <Button className="gap-1.5" disabled={!chosen.length || invalid || create.isPending} onClick={() => create.mutate({ requisitionId: requisition.id, lines: chosen.map(row => ({ requisitionLineId: row.line.id, quantity: row.quantity })) }, { onSuccess: () => { setQuantities({}); setRequisitionId(""); } })}>
              <Undo2 className="size-4" /> {create.isPending ? "Saving…" : "Save return"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function ReturnCard({ doc, canChange, onPrint }: { doc: PdiReturn; canChange: boolean; onPrint: () => void }) {
  const cancel = useCancelReturn();
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const cancelled = doc.status === "CANCELLED";
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", cancelled && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono font-semibold">{doc.returnNumber}</span>
          <span className="text-xs text-muted-foreground">against {doc.requisition.requisitionNumber} · {formatDateTime(doc.returnDate)}</span>
          {cancelled && <span className="text-xs font-semibold uppercase text-destructive">Cancelled</span>}
        </div>
        <MoneyText value={doc.totals.totalAmount} className="font-semibold" />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>{["Part no.", "Description", "Qty returned", "Rate", "Amount"].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
          <tbody>
            {(doc.lines ?? []).map(line => (
              <tr key={line.id} className="border-t border-border">
                <td className={cn(tdCls, "font-mono")}>{line.partIssuance.sparePart.partNumber}</td>
                <td className={tdCls}>{line.partIssuance.sparePart.name}</td>
                <td className={cn(tdCls, "tabular-nums")}>{line.quantity}</td>
                <td className={tdCls}><MoneyText value={line.rate} /></td>
                <td className={tdCls}><MoneyText value={line.amount} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TotalsStrip className="mt-3" items={[
        { label: "Number of items", value: doc.totals.numberOfItems },
        { label: "Net quantity returned", value: doc.totals.netQuantityReturned },
        { label: "Total amount", value: <MoneyText value={doc.totals.totalAmount} />, strong: true },
      ]} />
      <div className="mt-3 flex flex-wrap items-end justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onPrint}><Printer className="size-4" /> Print</Button>
        {canChange && !cancelled && !cancelling && <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCancelling(true)}><XCircle className="size-4" /> Cancel return</Button>}
        {cancelling && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); cancel.mutate({ id: doc.id, reason: reason.trim() }, { onSuccess: () => setCancelling(false) }); }}>
            <input aria-label="Cancellation reason" className={cn(pdiInput, "w-64")} placeholder="Reason" required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(false)}>Keep</Button>
            <Button variant="destructive" size="sm" disabled={!reason.trim() || cancel.isPending}>Cancel return</Button>
          </form>
        )}
      </div>
    </div>
  );
}
