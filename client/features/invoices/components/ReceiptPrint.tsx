"use client";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { lagosDate, moneyText } from '@/features/service-transactions/transaction.logic';
import { useReceipt } from '../hooks/use-receipt';

export function ReceiptPrint({ id }: { id: string }) {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('receipt:read');
  const query = useReceipt(id, allowed);
  if (!allowed) return <p role="alert">You do not have permission to view receipts.</p>;
  if (query.isPending) return <p role="status">Loading receipt…</p>;
  if (query.isError) return <div role="alert">Could not load receipt. <Button onClick={() => void query.refetch()}>Retry</Button></div>;
  const receipt = query.data.receipt;
  const snapshot = receipt.advanceSnapshot;
  return <article id="payment-receipt-print" className="mx-auto max-w-3xl space-y-5 rounded-xl border border-border bg-card p-6 text-card-foreground">
    <style>{`@media print { body * { visibility: hidden; } #payment-receipt-print, #payment-receipt-print * { visibility: visible; } #payment-receipt-print { position: absolute; inset: 0; width: 100%; max-width: none; border: 0; } #payment-receipt-print .print-controls { display: none; } }`}</style>
    <div className="print-controls"><Button onClick={() => window.print()}>Print receipt</Button></div>
    <header><h1 className="text-2xl font-semibold">{receipt.advanceJobCardId ? 'Advance payment receipt' : 'Payment receipt'}</h1><p>{snapshot?.branchName ?? receipt.branch?.name}</p></header>
    {receipt.status !== 'ACTIVE' && <p className="font-semibold text-destructive">{receipt.status} — {receipt.cancelRemark}</p>}
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt>Receipt number</dt><dd>{receipt.receiptNumber}</dd></div>
      <div><dt>Payment date</dt><dd>{lagosDate(receipt.issuedAt)}</dd></div>
      <div><dt>Customer</dt><dd>{snapshot?.customerName ?? (receipt.customer.companyName || `${receipt.customer.firstName} ${receipt.customer.lastName}`)}</dd></div>
      {snapshot && <><div><dt>Job card / vehicle</dt><dd>{snapshot.jobNumber} / {snapshot.registrationNumber ?? '—'}</dd></div><div><dt>Estimate / version</dt><dd>{snapshot.estimateNumber ?? '—'} / {snapshot.estimateVersion}</dd></div></>}
      <div><dt>Payment method</dt><dd>{receipt.mode.replaceAll('_', ' ')} {receipt.bank?.name}</dd></div>
      <div><dt>Payment reference</dt><dd>{receipt.reference || '—'}</dd></div>
      <div><dt>Amount received on this receipt</dt><dd className="text-lg font-semibold">{moneyText(receipt.amount)}</dd></div>
      {snapshot && <><div><dt>Estimate total at receipt</dt><dd>{moneyText(snapshot.estimateTotal)}</dd></div><div><dt>Total advances at receipt</dt><dd>{moneyText(snapshot.receivedAmount)} ({snapshot.paidPercent === null ? 'percentage unavailable' : `${snapshot.paidPercent}%`})</dd></div><div><dt>Estimated balance at receipt</dt><dd>{moneyText(snapshot.balanceAmount)}</dd></div>{snapshot.excessAmount > 0 && <div><dt>Excess advance at receipt</dt><dd>{moneyText(snapshot.excessAmount)}</dd></div>}</>}
      <div><dt>Received by</dt><dd>{[receipt.issuedBy?.firstName, receipt.issuedBy?.lastName].filter(Boolean).join(' ') || '—'}</dd></div>
    </dl>
    {receipt.notes && <p className="text-sm">{receipt.notes}</p>}
    {!!receipt.allocations.length && <section className="space-y-2"><h2 className="font-semibold">Current allocations</h2>{receipt.allocations.map((allocation, index) => <p key={index} className="text-sm">{allocation.invoice?.invoiceNumber ?? 'Account adjustment'}: {moneyText(allocation.amount)}</p>)}</section>}
    {receipt.advanceJobCardId && <p className="text-sm text-muted-foreground">Payment received in advance for the referenced job. The final balance is determined by completed work and the final invoice. Figures above are the original receipt snapshot; later allocations do not represent additional cash received.</p>}
  </article>;
}
