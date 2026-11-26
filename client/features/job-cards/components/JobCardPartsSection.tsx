"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { PART_SOURCE_LABELS } from '@/features/inventory/lib/part-codes';
import { lagosDate, remainingReturn } from '@/features/service-transactions/transaction.logic';
import type { JobCard } from '../types/job-card.types';
import { canonicalJobStatus, hasJobBill } from '../types/job-card-status';
import { useJobPartsActions } from '../hooks/use-job-parts-actions';
import { PartCollectionSignature } from './PartCollectionSignature';

import { NumberInput } from '@/components/forms/NumberInput';
/** History and signed collection only; new issues are created through requisitions. */
export function JobCardPartsSection({ jobCard }: { jobCard: JobCard }) {
  const { hasPermission, user } = useAuth();
  const { receive, returnPart, receiveError, returnError } = useJobPartsActions(jobCard.id, jobCard.branchId);
  const [collectingId, setCollectingId] = useState('');
  const [issuanceId, setIssuanceId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const issues = jobCard.partIssuances ?? [];
  const canRead = hasPermission('jobcard:read');
  const closed = hasJobBill(jobCard) || ['DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(jobCard.status));
  const canReceive = canRead && !closed && canonicalJobStatus(jobCard.status) !== 'READY' && user?.id === jobCard.technicianId && hasPermission('jobprogress:update');
  const legacyIssues = issues.filter(issue => !issue.requisitionLine);
  const selected = legacyIssues.find(issue => issue.id === issuanceId);
  const available = selected ? remainingReturn({ quantityIssued: selected.quantity, returns: selected.returns }) : 0;
  const canReturn = canRead && hasPermission('partreturn:create') && !closed;
  const validReturn = !!selected && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= available && !!reason.trim();
  return <section id="job-parts" aria-labelledby="issued-parts-title" className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground print:hidden">
    <div className="space-y-1"><h2 id="issued-parts-title" className="font-semibold">Issued parts and collection</h2><p className="text-sm text-muted-foreground">Request and issue parts through the Requisition tab in Service transactions. Return requisition parts through the Returns tab.</p></div>
    {!canRead ? <p className="text-sm text-muted-foreground">Your account does not have access to issued parts.</p> : !issues.length ? <p className="text-sm text-muted-foreground">No parts issued. Use Request part and then prepare a requisition.</p> : <ul className="space-y-3">{issues.map(issue => {
      const remaining = remainingReturn({ quantityIssued: issue.quantity, returns: issue.returns });
      const cancelled = issue.requisitionLine?.requisition.status.toUpperCase() === 'CANCELLED';
      return <li key={issue.id} className="space-y-3 rounded-lg border border-border p-3 text-sm">
        <p className="break-words font-medium">{issue.sparePart.partNumber}: {issue.sparePart.name}</p>
        <dl className="grid gap-3 sm:grid-cols-3"><div><dt className="text-muted-foreground">Source</dt><dd>{PART_SOURCE_LABELS[issue.partSource ?? ''] ?? 'Not provided'}</dd></div><div><dt className="text-muted-foreground">Issued quantity</dt><dd className="text-right tabular-nums">{issue.quantity.toLocaleString('en-NG')}</dd></div><div><dt className="text-muted-foreground">Returned quantity</dt><dd className="text-right tabular-nums">{(issue.quantity - remaining).toLocaleString('en-NG')}</dd></div><div><dt className="text-muted-foreground">Issued at</dt><dd>{lagosDate(issue.issuedAt)}</dd></div><div><dt className="text-muted-foreground">Issued by</dt><dd className="break-words">{issue.issuedBy ? `${issue.issuedBy.firstName} ${issue.issuedBy.lastName}` : 'Not provided'}</dd></div><div><dt className="text-muted-foreground">Record</dt><dd>{cancelled ? 'Cancelled requisition' : issue.requisitionLine ? 'Parts requisition' : 'Historical direct issue'}</dd></div></dl>
        {cancelled ? <p className="text-muted-foreground">This requisition was cancelled and its stock movement reversed.</p> : issue.receivedAt ? <p>Collection recorded at {lagosDate(issue.receivedAt)}</p> : <p className="text-muted-foreground">Collection not recorded.</p>}
        {canReceive && !cancelled && !issue.receivedAt && remaining > 0 && (collectingId === issue.id ? <div className="space-y-2"><PartCollectionSignature label={`${issue.sparePart.name} (${issue.quantity})`} pending={receive.isPending} onSign={signatureImage => receive.mutate({ id: issue.id, signatureImage }, { onSuccess: () => setCollectingId('') })} />{receiveError && <p role="alert" className="text-destructive">{receiveError}</p>}<Button type="button" variant="outline" disabled={receive.isPending} onClick={() => { receive.reset(); setCollectingId(''); }}>Cancel collection signature</Button></div> : <Button type="button" variant="outline" disabled={receive.isPending || !!collectingId} onClick={() => { receive.reset(); setCollectingId(issue.id); }}>Sign collection for {issue.sparePart.partNumber}</Button>)}
      </li>;
    })}</ul>}
    {canReturn && legacyIssues.some(issue => remainingReturn({ quantityIssued: issue.quantity, returns: issue.returns }) > 0) && <form className="space-y-3 border-t border-border pt-4" onSubmit={event => { event.preventDefault(); if (validReturn && !returnPart.isPending) returnPart.mutate({ id: issuanceId, quantity, reason: reason.trim() }, { onSuccess: () => { setIssuanceId(''); setQuantity(1); setReason(''); } }); }}>
      <h3 className="font-medium">Return a historical direct issue</h3><p className="text-sm text-muted-foreground">This action preserves returns for older issues that have no requisition.</p>
      <fieldset disabled={returnPart.isPending} className="grid gap-3 sm:grid-cols-3"><Field label="Issued part" required><select className={inputCls} required value={issuanceId} onChange={event => { setIssuanceId(event.target.value); setQuantity(1); }}><option value="">Select an issued part</option>{legacyIssues.map(issue => <option key={issue.id} value={issue.id} disabled={remainingReturn({ quantityIssued: issue.quantity, returns: issue.returns }) < 1}>{issue.sparePart.partNumber}: {issue.sparePart.name}</option>)}</select></Field><Field label="Quantity to return" required error={issuanceId && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > available) ? `Enter a whole quantity from 1 to ${available}` : undefined}><NumberInput className={inputCls} min="1" max={available} step="1" required value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></Field><Field label="Return reason" required><input className={inputCls} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button type="submit" variant="outline" disabled={!validReturn}>{returnPart.isPending ? 'Recording return' : 'Record historical return'}</Button></fieldset>
      {returnError && <p role="alert" className="text-sm text-destructive">{returnError}</p>}
    </form>}
  </section>;
}
