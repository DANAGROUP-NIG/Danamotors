"use client";
import Link from 'next/link';
import { useState } from 'react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { PaymentReceiptModal } from '@/features/invoices/components/PaymentReceiptModal';
import { moneyText, lagosDate } from '@/features/service-transactions/transaction.logic';
import { WorkshopPicker } from './WorkshopPicker';
import { useLinkJobAdvance } from '../hooks/use-job-advances';
import type { JobCard } from '../types/job-card.types';

export function JobAdvanceSection({ jobCard, open }: { jobCard: JobCard; open: boolean }) {
  const { hasPermission } = useAuth();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptId, setReceiptId] = useState('');
  const link = useLinkJobAdvance(jobCard.id);
  const summary = jobCard.advanceSummary;
  const canReceive = open && summary?.hasEstimate && !!jobCard.customerId && hasPermission('receipt:create');
  return <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Job advance payments">
    <h3 className="font-semibold">Advance payments</h3>
    {summary && <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt>{summary.basis === 'INVOICE' ? 'Final invoice total' : 'Current estimate total'}</dt><dd>{moneyText(summary.total)}</dd></div>
      <div><dt>{summary.basis === 'INVOICE' ? 'Payments applied' : 'Advances received'}</dt><dd>{moneyText(summary.receivedAmount)} ({summary.paidPercent === null ? 'percentage unavailable' : `${summary.paidPercent}% paid`})</dd></div>
      <div><dt>{summary.basis === 'INVOICE' ? 'Balance due' : 'Estimated balance'}</dt><dd>{moneyText(summary.balanceAmount)}</dd></div>
      {summary.excessAmount > 0 && <div><dt>Excess advance</dt><dd>{moneyText(summary.excessAmount)}</dd></div>}
    </dl>}
    {open && <p className="text-sm text-muted-foreground">Suggested advance: {summary?.suggestedPercent ?? 60}%. Any positive amount is accepted. An advance is required before work can start. The final balance depends on completed work and the final invoice.</p>}
    {open && !jobCard.canStartWork && <p role="status" className="text-sm text-destructive">Record an advance before moving this job to In Progress.</p>}
    {open && !summary?.hasEstimate && <p className="text-sm text-muted-foreground">Prepare an estimate before receiving or linking a job advance.</p>}
    {canReceive && <div className="space-y-3">
      <Button type="button" onClick={() => setReceiptOpen(true)}>Receive advance</Button>
      <details><summary className="cursor-pointer text-sm">Link an existing unallocated receipt</summary>
        <div className="mt-3 space-y-3">
          <WorkshopPicker label="Service receipt" endpoint={`/finance/receipts?customerId=${jobCard.customerId}&branchId=${jobCard.branchId}&category=SERVICE_PARTS`} collection="receipts" value={receiptId} onChange={setReceiptId} />
          <Button type="button" variant="outline" disabled={!receiptId || link.isPending} onClick={() => link.mutate(receiptId, { onSuccess: () => setReceiptId('') })}>Link advance receipt</Button>
          {link.isError && <p role="alert" className="text-sm text-destructive">{isAxiosError(link.error) ? link.error.response?.data?.message : 'Could not link receipt'}</p>}
        </div>
      </details>
    </div>}
    {!!jobCard.advanceReceipts?.length && <ul className="space-y-2 text-sm">
      {jobCard.advanceReceipts.map(receipt => <li key={receipt.id} className="flex flex-wrap justify-between gap-2 border-t pt-2">
        <span>{receipt.receiptNumber} · {lagosDate(receipt.issuedAt)} · {moneyText(receipt.amount)} · {receipt.status}</span>
        <Link className="text-primary underline" href={`/finance/receipts/${receipt.id}/print`}>View receipt</Link>
      </li>)}
    </ul>}
    {jobCard.customerId && <PaymentReceiptModal isOpen={receiptOpen} onClose={() => setReceiptOpen(false)} job={{ id: jobCard.id, customerId: jobCard.customerId, branchId: jobCard.branchId, jobNumber: jobCard.jobNumber ?? jobCard.id }} />}
  </section>;
}
