import { Prisma } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { money, sumMoney } from './money';
import { invoiceStatus, lagosDay } from './credit-terms';

export const advanceReceiptDateLimit = (now = new Date()) => new Date(`${lagosDay(now)}T23:59:59.999+01:00`);

export function usesAdvanceReference(receipt: { advanceSnapshot?: Prisma.JsonValue | null }) {
  const snapshot = receipt.advanceSnapshot;
  return !!snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && snapshot.tallyAsAdvance === true;
}

export function advanceBillReferences(number: string, total: number, allocations: { advanceReference?: string | null; amount: number }[]) {
  const advances = allocations.filter(row => row.advanceReference);
  const remaining = sumMoney([total, -sumMoney(advances.map(row => row.amount))]);
  if (remaining < 0) throw new ConflictError('Advance references exceed the bill total');
  return [
    ...advances.map(row => ({ name: row.advanceReference!, type: 'Agst Ref' as const, amount: money(row.amount) })),
    ...(remaining > 0 ? [{ name: number, type: 'New Ref' as const, amount: remaining }] : []),
  ];
}

export function advanceCoverage(total: number, received: number) {
  const amount = money(received);
  return {
    receivedAmount: amount,
    paidPercent: total > 0 ? new Prisma.Decimal(amount).times(100).div(total).toDecimalPlaces(2).toNumber() : null,
    balanceAmount: money(Prisma.Decimal.max(new Prisma.Decimal(total).minus(amount), 0).toNumber()),
    excessAmount: money(Prisma.Decimal.max(new Prisma.Decimal(amount).minus(total), 0).toNumber()),
  };
}

export async function lockAdvanceJob(tx: Prisma.TransactionClient, jobCardId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`);
}

export async function prepareJobAdvance(tx: Prisma.TransactionClient, jobCardId: string, customerId: string, branchId: string, amount: number) {
  await lockAdvanceJob(tx, jobCardId);
  const job = await tx.jobCard.findUnique({ where: { id: jobCardId }, include: { vehicle: true, customer: true, branch: true } });
  if (!job) throw new NotFoundError('Job card not found');
  if (job.customerId !== customerId || job.branchId !== branchId) throw new BadRequestError('Advance must belong to the job customer and branch');
  if (job.billedAt || ['BILLED', 'DELIVERED', 'CANCELLED', 'Closed', 'Cancelled'].includes(job.status)) throw new BadRequestError('Receive payment against the final bill for a billed job; closed jobs cannot receive advances');
  const estimate = await tx.estimate.findFirst({ where: { jobCardId }, orderBy: [{ version: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] });
  if (!estimate) throw new BadRequestError('Prepare an estimate before receiving an advance');
  if (estimate.currency && estimate.currency !== 'NGN') throw new BadRequestError('Job advances require an NGN estimate');
  const receipts = await tx.receipt.findMany({ where: { advanceJobCardId: jobCardId, status: 'ACTIVE', mode: { not: 'CHEQUE' }, issuedAt: { lte: advanceReceiptDateLimit() } }, select: { advanceAmount: true } });
  const coverage = advanceCoverage(estimate.amount, sumMoney([...receipts.map(row => row.advanceAmount), amount]));
  return {
    jobNumber: job.jobNumber, registrationNumber: job.vehicle?.registrationNumber ?? null,
    customerName: job.customer?.companyName || [job.customer?.firstName, job.customer?.lastName].filter(Boolean).join(' '),
    branchName: job.branch.name,
    // Keep the receipt voucher stable even if it is exported after final billing.
    tallyAsAdvance: true,
    estimateId: estimate.id, estimateNumber: estimate.estimateNumber, estimateVersion: estimate.version,
    estimateTotal: money(estimate.amount), suggestedPercent: estimate.upfrontPaymentPercent.toNumber(),
    ...coverage,
  } satisfies Prisma.InputJsonObject;
}

/** Reserved receipts cannot be consumed through general customer-credit adjustments. */
export async function assertNoReservedAdvances(tx: Prisma.TransactionClient, receiptIds: string[]) {
  if (!receiptIds.length) return;
  const reserved = await tx.receipt.findFirst({ where: {
    id: { in: receiptIds }, advanceAmount: { gt: 0 },
    advanceJobCard: { billedAt: null, status: { notIn: ['CANCELLED', 'Cancelled', 'DELIVERED', 'Closed'] } },
  }, select: { id: true } });
  if (reserved) throw new ConflictError('This advance is reserved for a job card and will be applied when that job is billed');
}

/** Caller locks the customer and jobs first. Reuse receipts; never record cash twice. */
export async function applyJobAdvances(tx: Prisma.TransactionClient, jobIds: string[], invoice: { id: string; customerId: string; total: number; dueDate: Date | null }, branchId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Receipt" WHERE "advanceJobCardId" IN (${Prisma.join(jobIds)}) ORDER BY id FOR UPDATE`);
  const receipts = await tx.receipt.findMany({ where: { advanceJobCardId: { in: jobIds }, status: 'ACTIVE', mode: { not: 'CHEQUE' }, advanceAmount: { gt: 0 }, issuedAt: { lte: advanceReceiptDateLimit() } }, orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }] });
  let remaining = money(invoice.total);
  for (const receipt of receipts) {
    if (receipt.customerId !== invoice.customerId || receipt.branchId !== branchId || receipt.category !== 'SERVICE_PARTS') throw new ConflictError('A job advance belongs to a different billing customer or branch');
    const amount = money(Math.min(receipt.advanceAmount, remaining));
    if (amount <= 0) continue;
    const exported = usesAdvanceReference(receipt) || receipt.tallyPostedAt || await tx.tallyPostingLog.findFirst({ where: { documentType: 'RECEIPT', documentId: receipt.id, status: { in: ['EXPORTED', 'POSTED'] } }, select: { id: true } });
    await tx.receiptAllocation.create({ data: { receiptId: receipt.id, invoiceId: invoice.id, amount, advanceReference: exported ? receipt.receiptNumber : undefined } });
    await tx.receipt.update({ where: { id: receipt.id }, data: { advanceAmount: sumMoney([receipt.advanceAmount, -amount]) } });
    remaining = sumMoney([remaining, -amount]);
  }
  return tx.invoice.update({ where: { id: invoice.id }, data: { outstandingAmount: remaining, status: invoiceStatus(remaining, invoice.total, invoice.dueDate) },
    include: { lines: true, customer: true, jobCard: true, serviceAdvisor: true } });
}
