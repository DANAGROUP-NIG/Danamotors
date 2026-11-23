"use client";
import { useAuth } from '@/features/auth/hooks/use-auth';
import { moneyText } from '@/features/service-transactions/transaction.logic';
import type { JobCard } from '../types/job-card.types';

/** Read the already-authorized job response; labour entry lives in labour slips. */
export function JobCardLabourSection({ jobCard }: { jobCard: JobCard }) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('jobcard:read');
  const canSeeAmounts = hasPermission('estimate:read') || hasPermission('invoice:read');
  const lines = jobCard.labourLines ?? [];
  return <section aria-labelledby="recorded-labour-title" className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
    <div className="space-y-1"><h2 id="recorded-labour-title" className="font-semibold">Recorded labour</h2><p className="text-sm text-muted-foreground">Add and edit labour through the Labour tab in Service transactions. This summary includes historical entries.</p></div>
    {!canRead ? <p className="text-sm text-muted-foreground">Your account does not have access to job-card labour.</p> : !lines.length ? <p className="text-sm text-muted-foreground">No labour recorded. Use the Labour tab to record the work performed.</p> : <ul className="space-y-3">{lines.map(line => <li key={line.id} className="space-y-3 rounded-lg border border-border p-3 text-sm">
      <p className="break-words font-medium">{line.description || line.labourItem.description}</p>
      <dl className="grid gap-3 sm:grid-cols-3"><div><dt className="text-muted-foreground">Assigned mechanic or technician</dt><dd className="break-words">{line.mechanic?.name || (line.technician ? `${line.technician.firstName} ${line.technician.lastName}` : 'Not assigned')}</dd></div><div><dt className="text-muted-foreground">Charged hours</dt><dd className="text-right tabular-nums">{line.hours.toLocaleString('en-NG', { maximumFractionDigits: 2 })}</dd></div><div><dt className="text-muted-foreground">Record</dt><dd>{line.labourSlipId ? 'Labour slip' : 'Historical entry'}</dd></div>
        {canSeeAmounts && <><div><dt className="text-muted-foreground">Saved rate</dt><dd className="text-right tabular-nums">{line.rate == null ? 'Not provided' : moneyText(line.rate)}</dd></div><div><dt className="text-muted-foreground">Recorded amount</dt><dd className="text-right tabular-nums">{line.amount == null ? 'Not provided' : moneyText(line.amount)}</dd></div></>}
      </dl>
    </li>)}</ul>}
  </section>;
}