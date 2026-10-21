"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { WorkshopPicker } from '@/features/job-cards/components/WorkshopPicker';
import { useAuth } from '@/features/auth/hooks/use-auth';
import type { TransactionJob } from '../document.types';
import { useServiceAction } from '../hooks/use-service-transactions';
import { canWriteTransactions } from '../transaction.logic';
import { AssignmentFields, PayerFields, type Payer } from './TransactionFields';
import { SlipList } from './SavedSlip';
type PartRow = { sparePartId: string; quantityRequired: number; quantityIssued: number; approvalPercent: number; customerPercent: number };
const empty = (): PartRow => ({ sparePartId: '', quantityRequired: 1, quantityIssued: 1, approvalPercent: 100, customerPercent: 0 });
export function RequisitionPanel({ job }: { job: TransactionJob }) {
  const { hasPermission } = useAuth(); const save = useServiceAction();
  const [payer, setPayer] = useState<Payer>({ chargeType: 'CUSTOMER' }); const [group, setGroup] = useState(''); const [engineer, setEngineer] = useState(''); const [rows, setRows] = useState<PartRow[]>([empty()]);
  const locked = !canWriteTransactions(job); const canCreate = hasPermission('requisition:create');
  const edit = (index: number, patch: Partial<PartRow>) => setRows(current => current.map((row, position) => position === index ? { ...row, ...patch } : row));
  return <section className="space-y-5"><h3 className="font-semibold">Job card item details ? Requisition</h3>
    {canCreate && <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate({ url: '/inventory/requisitions', body: { branchId: job.branchId, jobCardId: job.id, chargeType: payer.chargeType, groupId: group || undefined, engineerId: engineer || undefined, campaignId: payer.chargeType === 'FREE' ? payer.campaignId : undefined, goodwillReason: payer.chargeType === 'GOODWILL' ? payer.reason?.trim() : undefined, lines: rows.map(row => ({ ...row, approvalPercent: payer.chargeType === 'GOODWILL' ? row.approvalPercent : undefined, customerPercent: payer.chargeType === 'GOODWILL' ? row.customerPercent : undefined })) } }, { onSuccess: () => setRows([empty()]) }); }}><fieldset disabled={locked || save.isPending} className="space-y-4"><PayerFields value={payer} onChange={setPayer} campaigns={job.campaigns ?? []} /><AssignmentFields branchId={job.branchId} groupId={group} engineerId={engineer} onGroup={setGroup} onEngineer={setEngineer} />
    {rows.map((row, index) => <div key={index} className="space-y-3 rounded-lg border border-border p-3"><WorkshopPicker label={`Part ${index + 1}`} endpoint={`/inventory/parts?branchId=${job.branchId}`} collection="parts" value={row.sparePartId} onChange={id => edit(index, { sparePartId: id })} /><div className="grid gap-3 sm:grid-cols-4"><Field label="Quantity required"><input className={inputCls} type="number" required min="1" step="1" value={row.quantityRequired} onChange={event => edit(index, { quantityRequired: Number(event.target.value) })} /></Field><Field label="Quantity issued"><input className={inputCls} type="number" required min="0" max={row.quantityRequired} step="1" value={row.quantityIssued} onChange={event => edit(index, { quantityIssued: Number(event.target.value) })} /></Field>{payer.chargeType === 'GOODWILL' && <><Field label="Approval percent"><input className={inputCls} type="number" required min="0" max="100" step="0.01" value={row.approvalPercent} onChange={event => { const approvalPercent = Number(event.target.value); edit(index, { approvalPercent, customerPercent: 100 - approvalPercent }); }} /></Field><Field label="Customer percent"><input className={inputCls} readOnly value={row.customerPercent} /></Field></>}</div><Button type="button" variant="outline" disabled={rows.length === 1} onClick={() => setRows(current => current.filter((_, position) => position !== index))}>Remove part {index + 1}</Button></div>)}
    <div className="flex gap-3"><Button type="button" variant="outline" disabled={rows.length >= 100} onClick={() => setRows(current => [...current, empty()])}>Add part</Button><Button disabled={rows.some(row => !row.sparePartId)}>Save and issue parts</Button></div><p className="text-xs text-muted-foreground">Saved documents show stock-checked quantities, snapshotted rates and approval amounts.</p></fieldset></form>}
    {locked && <p className="text-sm text-muted-foreground">Parts documents are read-only after billing, delivery or cancellation.</p>}
    {hasPermission('requisition:read') && <SlipList kind="requisitions" jobId={job.id} locked={locked} />}
  </section>;
}
