"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import type { TransactionJob } from '../document.types';
import { RequisitionPanel } from './RequisitionPanel';
import { ReturnPanel } from './ReturnPanel';
import { LabourPanel } from './LabourPanel';
import { RemarksPanel } from './RemarksPanel';
export function ServiceTransactions({ job }: { job: TransactionJob }) {
  const { hasPermission } = useAuth();
  const tabs = [hasPermission('requisition:read') || hasPermission('requisition:create') ? 'Requisition' : null, hasPermission('requisition:read') ? 'Returns' : null, hasPermission('jobcard:read') || hasPermission('jobcard:labour:update') ? 'Labour' : null, hasPermission('jobcard:read') ? 'Remarks' : null].filter((tab): tab is string => tab !== null);
  const [selected, setSelected] = useState('Requisition'); const [visited, setVisited] = useState<string[]>(['Requisition']); const select = (tab: string) => { setSelected(tab); setVisited(current => current.includes(tab) ? current : [...current, tab]); }; const current = tabs.includes(selected) ? selected : tabs[0];
  if (!tabs.length) return null;
  return <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground print:hidden">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Service transactions</h2>{hasPermission('jobcard:picking-list:print') && <Button variant="outline" asChild><Link href={`/service-transactions/job-picking/${job.id}/print`}>Print picking list</Link></Button>}</div>
    <dl className="grid gap-3 text-sm sm:grid-cols-4"><div><dt className="text-muted-foreground">Job card</dt><dd>{job.jobNumber}</dd></div><div><dt className="text-muted-foreground">Vehicle</dt><dd>{job.vehicle?.registrationNumber ?? job.vehicle?.vin ?? '?'}</dd></div><div><dt className="text-muted-foreground">Model / variant</dt><dd>{job.vehicle?.model ?? '?'} / {job.vehicle?.trim ?? '?'}</dd></div><div><dt className="text-muted-foreground">Mileage</dt><dd>{job.mileage ?? '?'}</dd></div></dl>
    <div role="tablist" aria-label="Service transactions" className="flex flex-wrap gap-2 border-b border-border pb-3">{tabs.map(tab => <Button type="button" key={tab} role="tab" aria-selected={current === tab} id={`transaction-tab-${tab}`} aria-controls={`transaction-panel-${tab}`} tabIndex={current === tab ? 0 : -1} variant={current === tab ? 'default' : 'outline'} onClick={() => select(tab)} onKeyDown={event => { if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const index = tabs.indexOf(tab); const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; select(next); document.getElementById(`transaction-tab-${next}`)?.focus(); } }}>{tab}</Button>)}</div>
    {tabs.map(tab => <div key={tab} role="tabpanel" hidden={current !== tab} id={`transaction-panel-${tab}`} aria-labelledby={`transaction-tab-${tab}`}>{(current === tab || visited.includes(tab)) && (tab === 'Requisition' ? <RequisitionPanel job={job} /> : tab === 'Returns' ? <ReturnPanel job={job} /> : tab === 'Labour' ? <LabourPanel job={job} /> : <RemarksPanel job={job} />)}</div>)}
  </section>;
}
