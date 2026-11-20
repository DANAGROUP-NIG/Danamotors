import { Prisma } from '@prisma/client';
import { ConflictError } from '../../shared/errors/appError';
import type { JobBillTotals } from './job-bill-calculator';

const nonKiaSources = new Set(['L', 'A', 'F', 'U', 'R']);

export function invoiceSpareHeads(
  lines: ReadonlyArray<{ amount: number; partSource?: string | null }>,
  totals: JobBillTotals,
) {
  let kiaSpareTotal = new Prisma.Decimal(0);
  let nonKiaSpareTotal = new Prisma.Decimal(0);
  for (const { amount, partSource } of lines) {
    const source = partSource?.trim().toUpperCase();
    if (source === 'O') kiaSpareTotal = kiaSpareTotal.plus(amount);
    else if (source && nonKiaSources.has(source)) nonKiaSpareTotal = nonKiaSpareTotal.plus(amount);
    // TODO(confirm): Older records can lack a reliable part source. Keep the aggregate bill.
    else if (amount !== 0) return {};
  }

  const grossParts = kiaSpareTotal.plus(nonKiaSpareTotal);
  const total = grossParts.plus(totals.labourTotal).plus(totals.serviceTotal)
    .minus(totals.partsDiscountAmount).minus(totals.labourDiscountAmount)
    .plus(totals.vatAmount).plus(totals.roundOff);
  if (!grossParts.equals(totals.partsTotal) || !total.equals(totals.total)) {
    throw new ConflictError('Bill heads do not reconcile with the invoice total');
  }
  return { kiaSpareTotal, nonKiaSpareTotal };
}
