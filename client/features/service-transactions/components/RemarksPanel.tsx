"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useServiceAction, useServiceData } from '../hooks/use-service-transactions';
import type { TransactionJob } from '../document.types';
function RemarksEditor({ id, path, remarks, editable }: { id: string; path: string; remarks: string | null; editable: boolean }) {
  const [text, setText] = useState(remarks ?? ''); const save = useServiceAction();
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); save.mutate({ url: `/service/${path}/${id}/remarks`, method: 'put', body: { remarks: text.trim() || null } }); }}><Field label="Remarks"><textarea className={`${inputCls} min-h-40`} maxLength={5000} disabled={!editable || save.isPending} value={text} onChange={event => setText(event.target.value)} /></Field>{editable && <Button disabled={save.isPending || text === (remarks ?? '')}>Save remarks</Button>}<p className="text-xs text-muted-foreground">Remarks can be amended in any status. Changes are audited and do not change work done or amounts.</p></form>;
}
export function RemarksPanel({ job }: { job: TransactionJob }) {
  const { hasPermission } = useAuth(); const [target, setTarget] = useState('job');
  const path = target === 'job' ? 'job-cards' : 'estimates'; const id = target === 'job' ? job.id : target;
  const readable = hasPermission(target === 'job' ? 'jobcard:read' : 'estimate:read');
  const query = useServiceData<{ document: { id: string; remarks: string | null } }>(`/service/${path}/${id}/remarks`, readable);
  return <section className="space-y-4"><h3 className="font-semibold">Remarks entry</h3><Field label="For transaction"><select className={inputCls} value={target} onChange={event => setTarget(event.target.value)}><option value="job">Job card ? {job.jobNumber}</option>{hasPermission('estimate:read') && (job.estimates ?? []).map(estimate => <option key={estimate.id} value={estimate.id}>Job estimate ? revision {estimate.version ?? 1} ? {estimate.status}</option>)}</select></Field>
    {!readable ? <p role="alert">You do not have permission to read these remarks.</p> : query.isLoading ? <p role="status">Loading remarks?</p> : query.isError ? <div role="alert">Could not load remarks. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div> : query.data && <RemarksEditor key={`${id}-${query.data.document.remarks}`} id={id} path={path} remarks={query.data.document.remarks} editable={hasPermission('jobcard:remarks:update')} />}
    {hasPermission('jobcard:picking-list:print') && <Button variant="outline" asChild><Link href={`/service-transactions/${target === 'job' ? 'job-picking' : 'estimate-picking'}/${id}/print`}>Print picking list</Link></Button>}
  </section>;
}
