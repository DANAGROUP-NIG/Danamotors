"use client";
import { useState } from "react";
import { PackagePlus, Plus, Printer, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkshopPicker, type PickerRecord } from "@/features/job-cards/components/WorkshopPicker";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useCancelRequisition, useCreateRequisition } from "../hooks/use-pdi";
import { CHARGE_TYPES, formatDateTime, personName, returnable } from "../lib/pdi.logic";
import type { ChargeType, PdiJob, PdiRequisition } from "../types/pdi.types";
import { ChargePill, EmptyNote, MoneyText, PdiField, Segmented, TotalsStrip, pdiInput, pdiNumberInput, tdCls, thCls } from "./pdi-ui";

type Draft = { sparePartId: string; partNumber: string; description: string; quantityRequired: number; quantityIssued: number; approvalPercent: number };

/** PDI requisition (IPO): type and header, line entry on top, lines below, then issue. Rates are snapshotted by the server. */
export function RequisitionForm({ job }: { job: PdiJob }) {
  const { hasPermission } = useAuth();
  const create = useCreateRequisition();
  const [chargeType, setChargeType] = useState<ChargeType>("CUSTOMER");
  const [header, setHeader] = useState({ engineerId: job.engineerId ?? "", groupId: job.teamId ?? "", pickingListNumber: "", mileage: String(job.mileage ?? ""), goodwillReason: "" });
  const [entry, setEntry] = useState<{ part: PickerRecord | null; quantityRequired: string; quantityIssued: string; approvalPercent: string }>({ part: null, quantityRequired: "1", quantityIssued: "1", approvalPercent: "100" });
  const [lines, setLines] = useState<Draft[]>([]);
  const [entryError, setEntryError] = useState("");
  const goodwill = chargeType === "GOODWILL";

  const addLine = () => {
    const required = Number(entry.quantityRequired);
    const issued = Number(entry.quantityIssued);
    const approval = Number(entry.approvalPercent);
    if (!entry.part) return setEntryError("Choose a part");
    if (!Number.isInteger(required) || required < 1) return setEntryError("Quantity required must be a whole number of at least 1");
    if (!Number.isInteger(issued) || issued < 0 || issued > required) return setEntryError("Quantity issued must be between 0 and the quantity required");
    if (goodwill && !(approval >= 0 && approval <= 100)) return setEntryError("Approval percent must be between 0 and 100");
    if (lines.some(line => line.sparePartId === entry.part!.id)) return setEntryError("This part is already on the requisition");
    setLines(current => [...current, { sparePartId: entry.part!.id, partNumber: entry.part!.partNumber ?? entry.part!.code ?? "", description: entry.part!.name ?? entry.part!.description ?? "", quantityRequired: required, quantityIssued: issued, approvalPercent: approval }]);
    setEntry({ part: null, quantityRequired: "1", quantityIssued: "1", approvalPercent: entry.approvalPercent });
    setEntryError("");
  };

  const submit = () => create.mutate({
    branchId: job.branchId,
    jobCardId: job.id,
    chargeType,
    engineerId: header.engineerId || undefined,
    groupId: header.groupId || undefined,
    pickingListNumber: header.pickingListNumber.trim() || undefined,
    mileage: header.mileage === "" ? undefined : Number(header.mileage),
    goodwillReason: goodwill ? header.goodwillReason.trim() : undefined,
    lines: lines.map(line => ({
      sparePartId: line.sparePartId, quantityRequired: line.quantityRequired, quantityIssued: line.quantityIssued,
      ...(goodwill ? { approvalPercent: line.approvalPercent, customerPercent: Math.round((100 - line.approvalPercent) * 100) / 100 } : {}),
    })),
  }, { onSuccess: () => { setLines([]); setHeader(current => ({ ...current, pickingListNumber: "", goodwillReason: "" })); } });

  return (
    <div className="space-y-5">
      <Segmented
        label="Requisition type"
        value={chargeType}
        onChange={setChargeType}
        options={CHARGE_TYPES.filter(type => type.value !== "GOODWILL" || hasPermission("requisition:goodwill")).map(type => ({ value: type.value, label: type.label, hint: type.hint }))}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkshopPicker label="Engineer" endpoint={`/service/staff?role=Engineer&branchId=${job.branchId}`} collection="users" value={header.engineerId} onChange={engineerId => setHeader(current => ({ ...current, engineerId }))} />
        <WorkshopPicker label="Group" endpoint="/workshop-masters?kind=TEAM" collection="items" value={header.groupId} onChange={groupId => setHeader(current => ({ ...current, groupId }))} />
        <PdiField label="Picking list no." hint="Optional">
          <input className={`${pdiInput} uppercase`} maxLength={50} value={header.pickingListNumber} onChange={event => setHeader(current => ({ ...current, pickingListNumber: event.target.value }))} />
        </PdiField>
        <PdiField label="Mileage (km)">
          <input className={pdiNumberInput} inputMode="numeric" value={header.mileage} onChange={event => setHeader(current => ({ ...current, mileage: event.target.value.replace(/[^0-9]/g, "") }))} />
        </PdiField>
        {goodwill && (
          <PdiField label="Goodwill reason" required className="md:col-span-2 xl:col-span-4">
            <input className={pdiInput} maxLength={2000} value={header.goodwillReason} onChange={event => setHeader(current => ({ ...current, goodwillReason: event.target.value }))} />
          </PdiField>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Line entry</p>
        <div className={cn("grid gap-3 md:items-end", goodwill ? "md:grid-cols-[minmax(0,3fr)_repeat(3,minmax(0,1fr))_auto]" : "md:grid-cols-[minmax(0,3fr)_repeat(2,minmax(0,1fr))_auto]")}>
          <WorkshopPicker label="Part number" endpoint={`/inventory/parts?branchId=${job.branchId}`} collection="parts" value={entry.part?.id ?? ""} onChange={id => { if (!id) setEntry(current => ({ ...current, part: null })); }} onSelect={part => setEntry(current => ({ ...current, part }))} />
          <PdiField label="Qty required"><input className={pdiNumberInput} inputMode="numeric" value={entry.quantityRequired} onChange={event => setEntry(current => ({ ...current, quantityRequired: event.target.value.replace(/[^0-9]/g, ""), quantityIssued: event.target.value.replace(/[^0-9]/g, "") }))} /></PdiField>
          <PdiField label="Qty issued"><input className={pdiNumberInput} inputMode="numeric" value={entry.quantityIssued} onChange={event => setEntry(current => ({ ...current, quantityIssued: event.target.value.replace(/[^0-9]/g, "") }))} /></PdiField>
          {goodwill && <PdiField label="Approval %" hint={`Customer ${Math.max(0, 100 - Number(entry.approvalPercent || 0))}%`}><input className={pdiNumberInput} inputMode="decimal" value={entry.approvalPercent} onChange={event => setEntry(current => ({ ...current, approvalPercent: event.target.value }))} /></PdiField>}
          <Button type="button" variant="outline" className="gap-1.5" onClick={addLine}><Plus className="size-4" /> Add</Button>
        </div>
        {entryError && <p role="alert" className="mt-2 text-xs text-destructive">{entryError}</p>}
      </div>

      {lines.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40"><tr>{["Part no.", "Description", "Qty req.", "Qty iss.", ...(goodwill ? ["Approval %", "Customer %"] : []), ""].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
            <tbody>
              {lines.map(line => (
                <tr key={line.sparePartId} className="border-b border-border last:border-0">
                  <td className={cn(tdCls, "font-mono")}>{line.partNumber}</td>
                  <td className={tdCls}>{line.description}</td>
                  <td className={cn(tdCls, "tabular-nums")}>{line.quantityRequired}</td>
                  <td className={cn(tdCls, "tabular-nums")}>{line.quantityIssued}</td>
                  {goodwill && <><td className={tdCls}>{line.approvalPercent}%</td><td className={tdCls}>{Math.round((100 - line.approvalPercent) * 100) / 100}%</td></>}
                  <td className={cn(tdCls, "text-right")}><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${line.partNumber}`} onClick={() => setLines(current => current.filter(row => row.sparePartId !== line.sparePartId))}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyNote>Add the parts above. Stock is checked and deducted when you issue.</EmptyNote>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{lines.length} item(s) · {lines.reduce((sum, line) => sum + line.quantityIssued, 0)} to issue. Rates, amounts and approval shares are calculated when saved.</p>
        <Button className="gap-1.5" disabled={!lines.length || create.isPending || (goodwill && !header.goodwillReason.trim())} onClick={submit}><PackagePlus className="size-4" /> {create.isPending ? "Issuing…" : "Issue parts"}</Button>
      </div>
    </div>
  );
}

/** A saved PDI requisition with the legacy grid and footer totals. */
export function RequisitionCard({ doc, canChange, onPrint }: { doc: PdiRequisition; canChange: boolean; onPrint: () => void }) {
  const cancel = useCancelRequisition();
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const cancelled = doc.status === "CANCELLED";
  return (
    <details className={cn("group rounded-xl border border-border bg-card", cancelled && "opacity-70")} open={!cancelled}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono font-semibold">{doc.requisitionNumber}</span>
          <ChargePill type={doc.chargeType} />
          {cancelled && <span className="text-xs font-semibold uppercase text-destructive">Cancelled</span>}
          <span className="text-xs text-muted-foreground">{formatDateTime(doc.requisitionDate)} · {personName(doc.engineer)}{doc.pickingListNumber ? ` · Picking list ${doc.pickingListNumber}` : ""}{doc.mileage != null ? ` · ${doc.mileage} km` : ""}</span>
        </div>
        <MoneyText value={doc.totals.totalAmount} className="font-semibold" />
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{["Part no.", "Flag", "Qty req.", "Qty iss.", "Qty ret.", "Rate", "Amount", "Approv. %", "Approv. amt", "Cust. %", "Cust. amt"].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
            <tbody>
              {doc.lines.map(line => (
                <tr key={line.id} className="border-t border-border">
                  <td className={tdCls}><span className="font-mono">{line.partNumber ?? line.sparePart?.partNumber}</span><p className="text-xs text-muted-foreground">{line.description}</p></td>
                  <td className={tdCls}>{line.partSource}</td>
                  <td className={cn(tdCls, "tabular-nums")}>{line.quantityRequired}</td>
                  <td className={cn(tdCls, "tabular-nums")}>{line.quantityIssued}</td>
                  <td className={cn(tdCls, "tabular-nums")}>{line.quantityIssued - returnable(line)}</td>
                  <td className={tdCls}><MoneyText value={line.rate} /></td>
                  <td className={tdCls}><MoneyText value={line.amount} /></td>
                  <td className={tdCls}>{line.approvalPercent != null ? `${Number(line.approvalPercent)}%` : "—"}</td>
                  <td className={tdCls}><MoneyText value={line.approvedAmount} /></td>
                  <td className={tdCls}>{line.customerPercent != null ? `${Number(line.customerPercent)}%` : "—"}</td>
                  <td className={tdCls}><MoneyText value={line.customerAmount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TotalsStrip items={[
          { label: "Number of items", value: doc.totals.numberOfItems },
          { label: "Net quantity issued", value: doc.totals.netQuantityIssued },
          { label: "Total amount", value: <MoneyText value={doc.totals.totalAmount} />, strong: true },
          { label: "Approved amount", value: <MoneyText value={doc.totals.approvedAmount} /> },
        ]} />
        {doc.cancelReason && <p className="text-xs text-destructive">Cancelled: {doc.cancelReason}</p>}
        <div className="flex flex-wrap items-end justify-end gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onPrint}><Printer className="size-4" /> Print</Button>
          {canChange && !cancelled && !cancelling && <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCancelling(true)}><XCircle className="size-4" /> Cancel requisition</Button>}
          {cancelling && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); cancel.mutate({ id: doc.id, reason: reason.trim() }, { onSuccess: () => setCancelling(false) }); }}>
              <input aria-label="Cancellation reason" className={cn(pdiInput, "w-64")} placeholder="Reason (stock is returned)" required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(false)}>Keep</Button>
              <Button variant="destructive" size="sm" disabled={!reason.trim() || cancel.isPending}>Cancel requisition</Button>
            </form>
          )}
        </div>
      </div>
    </details>
  );
}
