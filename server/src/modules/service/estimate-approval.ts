import { Prisma } from '@prisma/client';
import { serviceChargeDescription, serviceChargeReference } from './job-service-charge';
import { BadRequestError } from '../../shared/errors/appError';
import { money, sumMoney } from '../finance/money';

export type ScopeLine = { type: string; referenceId?: string | null; description: string; quantity: number; rate: number; amount: number };
export type ApprovalEstimate = { id: string; status: string; currency?: string; amount: number; lines: ScopeLine[]; approvals: { approved: boolean | null; customerId: string }[] };
export const latestEstimateQuery = { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], take: 1, include: { lines: true, approvals: true } };
const baseType = (type: string) => type.replace('INCLUDED_', '');
const key = (line: ScopeLine) => `${baseType(line.type)}:${line.referenceId ?? ''}`;

export function reviewApprovedScope(estimate: ApprovalEstimate | undefined, actual: ScopeLine[], customerId?: string | null) {
  const approved = !!estimate && estimate.status.toUpperCase() === 'APPROVED' && estimate.approvals.some(a => a.approved === true && a.customerId === customerId);
  const issues: string[] = [];
  if (!approved) issues.push(!estimate ? 'Prepare an estimate and record customer approval first.' : 'The latest estimate needs customer approval.');
  if (estimate?.currency && estimate.currency !== 'NGN') issues.push('Create an NGN estimate revision before proceeding.');
  const expected = new Map<string, ScopeLine>();
  for (const line of estimate?.lines ?? []) {
    if (line.type === 'COMPLAINT') continue;
    if (expected.has(key(line))) issues.push(`Revise the estimate to remove duplicate scope: ${line.description}.`);
    expected.set(key(line), line);
  }
  const grouped = new Map<string, ScopeLine>();
  for (const line of actual) {
    const previous = grouped.get(key(line));
    grouped.set(key(line), previous ? { ...previous, quantity: previous.quantity + line.quantity, amount: sumMoney([previous.amount, line.amount]), rate: Math.max(previous.rate, line.rate) } : { ...line });
  }
  const rows = [...new Set([...expected.keys(), ...grouped.keys()])].map(id => {
    const planned = expected.get(id);
    const used = grouped.get(id);
    const included = !!planned?.type.startsWith('INCLUDED_');
    const actualAmount = included ? 0 : money(used?.amount ?? 0);
    const approvedAmount = included ? 0 : money(planned?.amount ?? 0);
    let reason: string | null = null;
    if (used && !planned) reason = 'Not in approved scope';
    else if (used && planned && used.quantity > planned.quantity + 0.000001) reason = 'Quantity / hours exceed approval';
    else if (used && planned && !included && (money(used.rate) > money(planned.rate) || actualAmount > approvedAmount)) reason = 'Charge exceeds approval';
    if (reason) issues.push(`${used?.description ?? planned?.description}: ${reason}. Revise the estimate and obtain approval.`);
    return { type: baseType((used ?? planned)!.type), referenceId: (used ?? planned)!.referenceId, description: (used ?? planned)!.description, approvedQuantity: planned?.quantity ?? 0, actualQuantity: used?.quantity ?? 0, approvedAmount, actualAmount, difference: money(actualAmount - approvedAmount), included, reason };
  });
  return { estimateId: estimate?.id ?? null, status: !estimate ? 'Draft' : approved ? (issues.length ? 'Revision Required' : 'Approved') : estimate.status.toUpperCase() === 'DECLINED' ? 'Revision Required' : 'Awaiting Approval', canBill: issues.length === 0, issues, rows, approvedSubtotal: sumMoney(rows.map(row => row.approvedAmount)), actualSubtotal: sumMoney(rows.map(row => row.actualAmount)) };
}

// Call while holding the JobCard row lock. All estimate decisions and work writes share it.
export async function assertApprovedOperation(tx: Prisma.TransactionClient, jobCardId: string, customerId: string | null, actual: ScopeLine[]) {
  const estimates = await tx.estimate.findMany({ where: { jobCardId }, ...latestEstimateQuery });
  const review = reviewApprovedScope(estimates[0], actual, customerId);
  if (!review.canBill) throw new BadRequestError(review.issues.join(' '));
  return review;
}

export async function assertRecordedScope(tx: Prisma.TransactionClient, jobCardId: string) {
  const card = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, include: { service: true, serviceType: { select: { description: true } }, partIssuances: { include: { sparePart: true, returns: true } }, labourLines: true } });
  const lines: ScopeLine[] = [];
  const chargeReference = serviceChargeReference(card);
  if (chargeReference) lines.push({ type: 'SERVICE', referenceId: chargeReference, description: serviceChargeDescription(card), quantity: 1, rate: card.serviceCharge ?? 0, amount: card.serviceCharge ?? 0 });
  for (const row of card.partIssuances) {
    const quantity = row.quantity - row.returns.filter(r => r.status.toUpperCase() !== 'REJECTED').reduce((sum, r) => sum + r.quantity, 0);
    if (quantity > 0) {
      if (row.sparePart.retailRate == null) throw new BadRequestError('Set the part retail rate before completing this job');
      lines.push({ type: 'PART', referenceId: row.sparePartId, description: row.sparePart.name, quantity, rate: row.sparePart.retailRate, amount: money(quantity * row.sparePart.retailRate) });
    }
  }
  for (const row of card.labourLines) lines.push({ type: 'LABOUR', referenceId: row.labourItemId, description: row.description, quantity: row.hours, rate: row.rate, amount: row.amount });
  return assertApprovedOperation(tx, jobCardId, card.customerId, lines);
}
