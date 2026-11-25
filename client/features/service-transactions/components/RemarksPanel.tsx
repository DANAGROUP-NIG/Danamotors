"use client";
import { NOT_PROVIDED, formatKm } from '@/lib/format';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useServiceAction, useServiceData } from '../hooks/use-service-transactions';
import { lagosDate } from '../transaction.logic';
import type { RemarksDocument, TransactionJob } from '../document.types';
function RemarksEditor({ id, path, remarks, customerRemarks, editable }: { id: string; path: string; remarks: string | null; customerRemarks?: string | null; editable: boolean }) {
  const [text, setText] = useState(remarks ?? ''); const [explanation, setExplanation] = useState(customerRemarks ?? ''); const save = useServiceAction();
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); save.mutate({ url: `/service/${path}/${id}/remarks`, method: 'put', body: { remarks: text.trim() || null, customerRemarks: explanation.trim() || null } }); }}><Field label="Internal remarks"><textarea className={`${inputCls} min-h-40`} maxLength={5000} disabled={!editable || save.isPending} value={text} onChange={event => setText(event.target.value)} /></Field><Field label="Customer explanation (prints)"><textarea className={`${inputCls} min-h-40`} maxLength={5000} disabled={!editable || save.isPending} value={explanation} onChange={event => setExplanation(event.target.value)} /></Field>{editable && <Button disabled={save.isPending || (text === (remarks ?? '') && explanation === (customerRemarks ?? ''))}>Save remarks</Button>}<p className="text-xs text-muted-foreground">Internal remarks stay with staff. Only the customer explanation appears on customer documents. Changes are audited in every status and do not change work done or amounts.</p></form>;
}
export function RemarksPanel({ job }: { job: TransactionJob }) {
  const { hasPermission } = useAuth(); const [target, setTarget] = useState('job');
  const path = target === 'job' ? 'job-cards' : 'estimates'; const id = target === 'job' ? job.id : target;
  const readable = hasPermission(target === 'job' ? 'jobcard:read' : 'estimate:read');
  const query = useServiceData<{ document: RemarksDocument }>(`/service/${path}/${id}/remarks`, readable);
  return <section className="space-y-4"><h3 className="font-semibold">Remarks entry</h3><Field label="For transaction"><select className={inputCls} value={target} onChange={event => setTarget(event.target.value)}><option value="job">Job card ? {job.jobNumber}</option>{hasPermission('estimate:read') && (job.estimates ?? []).map(estimate => <option key={estimate.id} value={estimate.id}>Job estimate ? revision {estimate.version ?? 1} ? {estimate.status}</option>)}</select></Field>
    {!readable ? <p role="alert">You do not have permission to read these remarks.</p> : query.isLoading ? <p role="status">Loading remarks?</p> : query.isError ? <div role="alert">Could not load remarks. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div> : query.data && <><RemarksContext document={query.data.document} /><RemarksEditor key={`${id}-${query.data.document.remarks}-${query.data.document.customerRemarks}`} id={id} path={path} remarks={query.data.document.remarks} customerRemarks={query.data.document.customerRemarks} editable={hasPermission('jobcard:remarks:update')} /></>}
    {hasPermission('jobcard:picking-list:print') && <Button variant="outline" asChild><Link href={`/service-transactions/${target === 'job' ? 'job-picking' : 'estimate-picking'}/${id}/print`}>Print picking list</Link></Button>}
  </section>;
}

function RemarksContext({ document }: { document: RemarksDocument }) {
  const context = document.context;
  if (!context) return null;
  const fields = [
    ['Document', context.documentNumber ?? 'Legacy document'],
    ['Date (Lagos)', lagosDate(context.documentDate)],
    ['Status', /^[A-Z_]+$/.test(context.status ?? '') ? context.status.charAt(0) + context.status.slice(1).toLowerCase().replaceAll('_', ' ') : context.status || NOT_PROVIDED],
    ['Job', context.jobNumber ?? 'Standalone estimate'],
    ['Job date (Lagos)', context.jobDate ? lagosDate(context.jobDate) : NOT_PROVIDED],
    ['Customer', context.customerName ?? NOT_PROVIDED],
    ['Registration', context.vehicle?.registrationNumber ?? NOT_PROVIDED],
    ['VIN', context.vehicle?.vin ?? NOT_PROVIDED],
    ['Model', context.vehicle?.model ?? NOT_PROVIDED],
    ['Variant', context.vehicle?.trim ?? NOT_PROVIDED],
    ['Mileage', formatKm(context.mileage)],
    ['Service', context.service ? `${context.service.code}: ${context.service.description}` : NOT_PROVIDED],
  ];
  return <dl className="grid gap-3 text-sm sm:grid-cols-3">{fields.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}</dl>;
}
