"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { WorkshopPicker } from '@/features/job-cards/components/WorkshopPicker';
import { useAuth } from '@/features/auth/hooks/use-auth';
import type { TransactionJob } from '../document.types';
import { useServiceAction } from '../hooks/use-service-transactions';
import { canWriteTransactions } from '../transaction.logic';
import { LabourLineEditor, emptyLabour, labourBody, type LabourDraft } from './LabourLineEditor';
import { AssignmentFields } from './TransactionFields';
import { SlipList } from './SavedSlip';
export function LabourPanel({ job }: { job: TransactionJob }) {
  const { hasPermission } = useAuth(); const save = useServiceAction(); const work = useServiceAction();
  const [rows, setRows] = useState<LabourDraft[]>([emptyLabour()]); const [group, setGroup] = useState(''); const [engineer, setEngineer] = useState(''); const [slipId, setSlipId] = useState(''); const [workDone, setWorkDone] = useState(job.workDone ?? '');
  const locked = !canWriteTransactions(job);
  return <section className="space-y-5"><h3 className="font-semibold">Job card labour details</h3>{hasPermission('jobcard:labour:update') && <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate({ url: slipId ? `/service/labour-slips/${slipId}/lines` : '/service/labour-slips', body: slipId ? labourBody(rows[0]) : { branchId: job.branchId, jobCardId: job.id, groupId: group || undefined, engineerId: engineer || undefined, lines: rows.map(labourBody) } }, { onSuccess: () => setRows([emptyLabour()]) }); }}><fieldset disabled={locked || save.isPending} className="space-y-4"><WorkshopPicker label="Add to existing labour slip (optional)" endpoint={`/service/labour-slips?jobCardId=${job.id}`} collection="labourSlips" value={slipId} onChange={id => { setSlipId(id); setRows([emptyLabour()]); }} />{!slipId && <AssignmentFields branchId={job.branchId} groupId={group} engineerId={engineer} onGroup={setGroup} onEngineer={setEngineer} />}
    {rows.map((row, index) => <div className="space-y-3 rounded-lg border border-border p-3" key={index}><h4 className="text-sm font-medium">Labour line {index + 1}</h4><LabourLineEditor value={row} branchId={job.branchId} campaigns={job.campaigns ?? []} onChange={value => setRows(current => current.map((item, position) => position === index ? value : item))} /><Button variant="outline" type="button" disabled={rows.length === 1} onClick={() => setRows(current => current.filter((_, position) => position !== index))}>Remove labour line {index + 1}</Button></div>)}
    <div className="flex gap-3">{!slipId && <Button type="button" variant="outline" disabled={rows.length >= 100} onClick={() => setRows(current => [...current, emptyLabour()])}>Add labour line</Button>}<Button disabled={rows.some(row => !row.labourItemId || (!row.technicianId && !row.mechanicId))}>{slipId ? 'Save additional labour line' : 'Save labour slip'}</Button></div></fieldset></form>}
    {locked && <p className="text-sm text-muted-foreground">Labour is read-only after billing, delivery or cancellation.</p>}
    {hasPermission('jobcard:read') && <SlipList kind="labour-slips" jobId={job.id} locked={locked} branchId={job.branchId} campaigns={job.campaigns ?? []} />}
    {hasPermission('jobcard:update') && <form className="space-y-3 rounded-lg border border-border p-3" onSubmit={event => { event.preventDefault(); work.mutate({ url: `/service/job-cards/${job.id}`, method: 'put', body: { workDone } }); }}><Field label="Work done"><textarea className={inputCls} disabled={locked || work.isPending} maxLength={5000} value={workDone} onChange={event => setWorkDone(event.target.value)} /></Field><div className="flex flex-wrap gap-3"><Button disabled={locked || work.isPending}>Save work done</Button><Button variant="outline" type="button" disabled={locked || work.isPending || job.qcStatus?.toUpperCase() !== 'PASSED' || !['QC', 'QUALITY CHECK'].includes(job.status.toUpperCase())} onClick={() => work.mutate({ url: `/service/job-cards/${job.id}`, method: 'put', body: { status: 'READY' } })}>Mark vehicle ready</Button></div><p className="text-xs text-muted-foreground">Vehicle ready requires the job to be in quality check with a passed QC result.</p></form>}
  </section>;
}
