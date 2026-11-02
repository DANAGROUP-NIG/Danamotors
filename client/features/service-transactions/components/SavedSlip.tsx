"use client";
import { SavedLabourLine } from "./SavedLabourLine";
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useServiceAction, useServiceData, type ServiceSlip } from '../hooks/use-service-transactions';
import { slipRoutes, slipKeys, slipListKeys, type SlipKind } from '../document.types';
import { lagosDate, moneyText, remainingReturn } from '../transaction.logic';
export function SlipRows({ document }: { document: ServiceSlip }) {
  return <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Part / labour code', 'Description', 'Flag / payer', 'Required / standard hours', 'Issued / charged hours', 'Returned', 'Rate', 'Amount'].map(label => <th className="whitespace-nowrap border-b border-border p-2" key={label}>{label}</th>)}</tr></thead><tbody>{document.lines.map(line => <tr key={line.id}><td className="p-2">{line.partNumber ?? line.requisitionLine?.partNumber ?? line.labourItem?.code ?? '?'}</td><td className="p-2">{line.description ?? line.requisitionLine?.description}<div className="text-xs text-muted-foreground">{line.technician ? `${line.technician.firstName} ${line.technician.lastName}` : line.mechanic?.name}{line.uom ? ` ? ${line.uom}` : ''}</div></td><td className="p-2">{line.partSource ?? line.chargeLine?.chargeType ?? '?'}</td><td className="p-2">{line.quantityRequired ?? line.standardHours ?? '?'}</td><td className="p-2">{line.quantityIssued ?? line.chargedHours ?? line.quantity ?? '?'}</td><td className="p-2">{line.quantityIssued != null ? line.quantityIssued - remainingReturn(line) : '?'}</td><td className="p-2">{moneyText(line.rate)}</td><td className="p-2">{moneyText(line.amount)}{line.approvedAmount != null && <div className="text-xs text-muted-foreground">Approved {moneyText(line.approvedAmount)} ? Customer {moneyText(line.customerAmount)}{line.approvalPercent != null ? ` (${line.approvalPercent}% / ${line.customerPercent}%)` : ''}</div>}</td></tr>)}</tbody></table></div><dl className="grid gap-3 rounded-lg bg-muted p-3 text-sm sm:grid-cols-3">{Object.entries(document.totals ?? {}).map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="font-medium">{key.toLowerCase().includes('amount') ? moneyText(value) : value}</dd></div>)}</dl></>;
}
function SavedSlip({ kind, summary, locked, branchId, campaigns }: { kind: SlipKind; summary: ServiceSlip; locked: boolean; branchId?: string; campaigns?: { campaignId: string; campaignTitle?: string }[] }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState('');
  const { hasPermission } = useAuth(); const cancel = useServiceAction();
  const detail = useServiceData<Record<string, ServiceSlip>>(`${slipRoutes[kind]}/${summary.id}`, open);
  const document = detail.data?.[slipKeys[kind]];
  const number = summary.requisitionNumber ?? summary.returnNumber ?? summary.slipNumber ?? summary.id;
  return <details className="rounded-lg border border-border p-3" onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-medium">{number} ? {summary.status ?? summary.chargeType ?? 'Labour'}{summary.createdAt ? ` ? ${lagosDate(summary.createdAt)}` : ''}</summary><div className="mt-3 space-y-4">{detail.isLoading ? <p role="status">Loading document?</p> : detail.isError ? <div role="alert">Could not load document. <Button variant="outline" onClick={() => void detail.refetch()}>Retry</Button></div> : document && <SlipRows document={document} />}
    {kind === 'labour-slips' && !locked && branchId && hasPermission('jobcard:labour:update') && document?.lines.map(line => <SavedLabourLine key={`${line.id}-${line.amount}-${line.chargedHours}`} line={line} slipId={summary.id} branchId={branchId} campaigns={campaigns} />)}
    <Button variant="outline" asChild><Link href={`/service-transactions/${kind}/${summary.id}/print`}>Print document</Link></Button>
    {kind !== 'labour-slips' && hasPermission('requisition:cancel') && !locked && summary.status !== 'CANCELLED' && <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); cancel.mutate({ url: `${slipRoutes[kind]}/${summary.id}/cancel`, body: { reason: reason.trim() } }, { onSuccess: () => setReason('') }); }}><Field label="Cancellation reason"><input className={inputCls} required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button variant="outline" disabled={cancel.isPending || !reason.trim()}>Cancel document</Button></form>}
  </div></details>;
}
export function SlipList({ kind, jobId, locked, branchId, campaigns }: { kind: SlipKind; jobId: string; locked: boolean; branchId?: string; campaigns?: { campaignId: string; campaignTitle?: string }[] }) {
  const [page, setPage] = useState(1);
  const list = useServiceData<Record<string, ServiceSlip[]>>(`${slipRoutes[kind]}?jobCardId=${jobId}&page=${page}&limit=25`);
  const documents = list.data?.[slipListKeys[kind]] ?? [];
  if (list.isLoading) return <p role="status">Loading documents?</p>;
  if (list.isError) return <div role="alert">Could not load documents. <Button variant="outline" onClick={() => void list.refetch()}>Retry</Button></div>;
  return <div className="space-y-3">{documents.length ? documents.map(document => <SavedSlip key={document.id} kind={kind} summary={document} locked={locked} branchId={branchId} campaigns={campaigns} />) : <p className="text-sm text-muted-foreground">No saved documents.</p>}<div className="flex items-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="text-sm">Page {page}</span><Button variant="outline" disabled={documents.length < 25} onClick={() => setPage(value => value + 1)}>Next</Button></div></div>;
}
