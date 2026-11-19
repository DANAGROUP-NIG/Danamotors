"use client";
import { useState } from "react";
import { Plus, Printer, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkshopPicker, type PickerRecord } from "@/features/job-cards/components/WorkshopPicker";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useCreateLabourSlip } from "../hooks/use-pdi";
import { CHARGE_TYPES, formatDateTime, personName } from "../lib/pdi.logic";
import type { ChargeTotals, ChargeType, PdiJob, PdiLabourSlip } from "../types/pdi.types";
import { ChargePill, EmptyNote, MoneyText, PdiField, TotalsStrip, pdiInput, pdiNumberInput, tdCls, thCls } from "./pdi-ui";

type Draft = { key: string; labourItemId: string; code: string; description: string; chargeType: ChargeType; chargedHours?: number; technicianId: string; technicianName: string; groupId?: string; reason?: string };

export function chargeTotalsStrip(totals: ChargeTotals) {
  return [
    { label: "Total warranty amount", value: <MoneyText value={totals.warranty} /> },
    { label: "Total non-warranty amount", value: <MoneyText value={totals.nonWarranty} /> },
    { label: "Total FOC amount", value: <MoneyText value={totals.foc} /> },
    { label: totals.goodwill ? "Goodwill / total" : "Total", value: totals.goodwill ? <><MoneyText value={totals.goodwill} /> / <MoneyText value={totals.total} /></> : <MoneyText value={totals.total} />, strong: true },
  ];
}

/** PDI labour slip: line entry (W/T/Q, labour code, hours, technician), lines below. Standard hours and rate come from the model. */
export function LabourForm({ job }: { job: PdiJob }) {
  const { hasPermission } = useAuth();
  const create = useCreateLabourSlip();
  const [header, setHeader] = useState({ groupId: job.teamId ?? "", engineerId: job.engineerId ?? "", mileage: String(job.mileage ?? "") });
  const [entry, setEntry] = useState<{ item: PickerRecord | null; chargeType: ChargeType; hours: string; technician: PickerRecord | null; groupId: string; reason: string }>({ item: null, chargeType: "WARRANTY", hours: "", technician: null, groupId: "", reason: "" });
  const [lines, setLines] = useState<Draft[]>([]);
  const [error, setError] = useState("");

  const add = () => {
    const hours = entry.hours === "" ? undefined : Number(entry.hours);
    if (!entry.item) return setError("Choose the labour code");
    if (!entry.technician) return setError("Choose the technician");
    if (hours !== undefined && !(hours > 0)) return setError("Charged hours must be more than 0");
    if (entry.chargeType === "GOODWILL" && !entry.reason.trim()) return setError("Goodwill labour needs a reason");
    setLines(current => [...current, {
      key: `${entry.item!.id}-${current.length}-${Date.now()}`, labourItemId: entry.item!.id, code: entry.item!.code ?? "", description: entry.item!.description ?? entry.item!.name ?? "",
      chargeType: entry.chargeType, chargedHours: hours, technicianId: entry.technician!.id, technicianName: `${entry.technician!.firstName ?? ""} ${entry.technician!.lastName ?? ""}`.trim(),
      groupId: entry.groupId || undefined, reason: entry.reason.trim() || undefined,
    }]);
    setEntry(current => ({ ...current, item: null, hours: "", reason: "" }));
    setError("");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <WorkshopPicker label="Group" endpoint="/workshop-masters?kind=TEAM" collection="items" value={header.groupId} onChange={groupId => setHeader(current => ({ ...current, groupId }))} />
        <WorkshopPicker label="Engineer" endpoint={`/service/staff?role=Engineer&branchId=${job.branchId}`} collection="users" value={header.engineerId} onChange={engineerId => setHeader(current => ({ ...current, engineerId }))} />
        <PdiField label="Mileage (km)"><input className={pdiNumberInput} inputMode="numeric" value={header.mileage} onChange={event => setHeader(current => ({ ...current, mileage: event.target.value.replace(/[^0-9]/g, "") }))} /></PdiField>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Line entry</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto] xl:items-end">
          <PdiField label="W / T / Q">
            <select className={pdiInput} value={entry.chargeType} onChange={event => setEntry(current => ({ ...current, chargeType: event.target.value as ChargeType }))}>
              {CHARGE_TYPES.filter(type => type.value !== "GOODWILL" || hasPermission("warranty:update")).map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </PdiField>
          <WorkshopPicker label="Labour code" endpoint="/service/labour-items" collection="labourItems" value={entry.item?.id ?? ""} onChange={id => { if (!id) setEntry(current => ({ ...current, item: null })); }} onSelect={item => setEntry(current => ({ ...current, item }))} />
          <PdiField label="Charged hrs" hint="Blank = standard"><input className={pdiNumberInput} inputMode="decimal" value={entry.hours} onChange={event => setEntry(current => ({ ...current, hours: event.target.value.replace(/[^0-9.]/g, "") }))} /></PdiField>
          <WorkshopPicker label="Technician" endpoint={`/service/staff?role=Technician&branchId=${job.branchId}`} collection="users" value={entry.technician?.id ?? ""} onChange={id => { if (!id) setEntry(current => ({ ...current, technician: null })); }} onSelect={technician => setEntry(current => ({ ...current, technician }))} />
          <WorkshopPicker label="Line group" endpoint="/workshop-masters?kind=TEAM" collection="items" value={entry.groupId} onChange={groupId => setEntry(current => ({ ...current, groupId }))} />
          <Button type="button" variant="outline" className="gap-1.5" onClick={add}><Plus className="size-4" /> Add</Button>
        </div>
        {entry.chargeType === "GOODWILL" && <PdiField label="Goodwill reason" className="mt-3"><input className={pdiInput} maxLength={2000} value={entry.reason} onChange={event => setEntry(current => ({ ...current, reason: event.target.value }))} /></PdiField>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      {lines.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40"><tr>{["W/T/Q", "Lab code", "Description", "Chrg hrs", "Technician", ""].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
            <tbody>
              {lines.map(line => (
                <tr key={line.key} className="border-b border-border last:border-0">
                  <td className={tdCls}><ChargePill type={line.chargeType} /></td>
                  <td className={cn(tdCls, "font-mono")}>{line.code}</td>
                  <td className={tdCls}>{line.description}</td>
                  <td className={cn(tdCls, "tabular-nums")}>{line.chargedHours ?? "Standard"}</td>
                  <td className={tdCls}>{line.technicianName}</td>
                  <td className={cn(tdCls, "text-right")}><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${line.code}`} onClick={() => setLines(current => current.filter(row => row.key !== line.key))}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyNote>Add the labour operations above. Standard hours and the model rate are applied when saved.</EmptyNote>}

      <div className="flex justify-end">
        <Button className="gap-1.5" disabled={!lines.length || create.isPending} onClick={() => create.mutate({
          branchId: job.branchId, jobCardId: job.id, groupId: header.groupId || undefined, engineerId: header.engineerId || undefined,
          mileage: header.mileage === "" ? undefined : Number(header.mileage),
          lines: lines.map(line => ({ labourItemId: line.labourItemId, chargeType: line.chargeType, chargedHours: line.chargedHours, technicianId: line.technicianId, groupId: line.groupId, reason: line.reason })),
        }, { onSuccess: () => setLines([]) })}>
          <Wrench className="size-4" /> {create.isPending ? "Saving…" : "Save labour slip"}
        </Button>
      </div>
    </div>
  );
}

export function LabourSlipCard({ slip, onPrint }: { slip: PdiLabourSlip; onPrint: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono font-semibold">{slip.slipNumber}</span>
          <span className="text-xs text-muted-foreground">{formatDateTime(slip.slipDate)} · {slip.group?.description ?? "No group"} · Engineer {personName(slip.engineer)}{slip.mileage != null ? ` · ${slip.mileage} km` : ""}</span>
        </div>
        <MoneyText value={slip.totals.total} className="font-semibold" />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>{["W/T/Q", "Lab code", "Description", "Std hrs", "Chrg hrs", "Amount", "Technician", "Group"].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
          <tbody>
            {(slip.lines ?? []).map(line => (
              <tr key={line.id} className="border-t border-border">
                <td className={tdCls}><ChargePill type={line.chargeLine?.chargeType ?? "CUSTOMER"} /></td>
                <td className={cn(tdCls, "font-mono")}>{line.labourItem.code}</td>
                <td className={tdCls}>{line.description}</td>
                <td className={cn(tdCls, "tabular-nums")}>{line.standardHours ?? "—"}</td>
                <td className={cn(tdCls, "tabular-nums")}>{line.hours}</td>
                <td className={tdCls}><MoneyText value={line.amount} /></td>
                <td className={tdCls}>{personName(line.technician)}</td>
                <td className={tdCls}>{line.group?.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TotalsStrip className="mt-3" items={chargeTotalsStrip(slip.totals)} />
      <div className="mt-3 flex justify-end"><Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onPrint}><Printer className="size-4" /> Print</Button></div>
    </div>
  );
}

