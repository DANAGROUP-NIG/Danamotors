"use client";
import { requestTotals } from "@/features/job-cards/components/opening/CustomerRequestsTab";
import { moneyText } from "../transaction.logic";
import { toast } from "sonner";
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { WorkshopPicker } from '@/features/job-cards/components/WorkshopPicker';
import type { BookingExtra, BookingRequest } from '@/features/appointments/types/appointment.types';
export function BookingFields({ value, onChange, vehicleId, disabled = false }: { value: BookingExtra; onChange: (value: BookingExtra) => void; vehicleId?: string; disabled?: boolean }) {
  const rows = value.requests ?? [];
  const totals = requestTotals(rows.map(row => ({ ...row, complaintCodeId: row.complaintCodeId ?? "", spare: row.spare ?? 0, oil: row.oil ?? 0, labour: row.labour ?? 0 })));
  const edit = (index: number, patch: Partial<BookingRequest>) => onChange({ ...value, requests: rows.map((row, position) => index === position ? { ...row, ...patch } : row) });
  return <fieldset disabled={disabled} className="min-w-0 space-y-4 rounded-xl border border-border p-4">
    <legend className="px-2 font-semibold">Vehicle details and customer requests</legend>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Booking mileage"><input aria-label="Booking mileage" className={inputCls} type="number" min="0" max="2147483647" step="1" value={value.mileage ?? ''} onChange={event => onChange({ ...value, mileage: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.acFitted ?? false} onChange={event => onChange({ ...value, acFitted: event.target.checked })} />Air conditioning fitted</label>
    </div>
    <WorkshopPicker label="Follow-up job (optional)" endpoint={`/service/job-cards?vehicleId=${vehicleId ?? ''}`} collection="jobCards" value={value.followUpJobId ?? ''} disabled={!vehicleId || disabled} onChange={id => { if (!id) onChange({ ...value, followUpJobId: null }); }} onSelect={record => { if (record.vehicleId !== vehicleId) { toast.error("Choose a job for the selected vehicle"); return; } onChange({ ...value, followUpJobId: record.id }); }} />
    <p className="text-xs text-muted-foreground">Requests and estimated amounts are optional. Follow-up jobs must belong to this vehicle and branch.</p>
    {rows.map((row, index) => <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
      <div className="sm:col-span-3"><WorkshopPicker label={`Request ${index + 1} complaint code (optional)`} endpoint="/workshop-masters?kind=COMPLAINT" collection="items" value={row.complaintCodeId ?? ''} disabled={disabled} onChange={id => edit(index, { complaintCodeId: id || undefined })} onSelect={item => edit(index, { complaintCodeId: item.id, description: row.description || item.description || '' })} /></div>
      <Field label="Defect code"><input className={inputCls} maxLength={50} value={row.defectCode ?? ''} onChange={event => edit(index, { defectCode: event.target.value || undefined })} /></Field>
      <div className="sm:col-span-2"><Field label="Request description"><input className={inputCls} required={!row.complaintCodeId && !row.defectCode} maxLength={2000} value={row.description} onChange={event => edit(index, { description: event.target.value })} /></Field></div>
      {(['spare', 'oil', 'labour'] as const).map(key => <Field key={key} label={`${key === 'spare' ? 'Parts' : key === 'oil' ? 'Oil' : 'Labour'} estimate (NGN)`}><input className={inputCls} type="number" min="0" max="1000000000000" step="0.01" value={row[key] ?? 0} onChange={event => edit(index, { [key]: Number(event.target.value) })} /></Field>)}
      {!disabled && <Button type="button" variant="outline" onClick={() => onChange({ ...value, requests: rows.filter((_, position) => position !== index) })}>Remove request {index + 1}</Button>}
    </div>)}
    <dl className="grid gap-3 text-sm sm:grid-cols-3">{Object.entries(totals).map(([key, amount]) => <div key={key}><dt className="text-muted-foreground">{key === "spare" ? "Parts estimate" : key === "oil" ? "Oil estimate" : "Labour estimate"}</dt><dd>{moneyText(amount)}</dd></div>)}</dl>
    {!disabled && <Button type="button" variant="outline" disabled={rows.length >= 100} onClick={() => onChange({ ...value, requests: [...rows, { description: '', spare: 0, oil: 0, labour: 0 }] })}>Add customer request</Button>}
  </fieldset>;
}
