import { ChargeType, Prisma } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';
import { lineAmount, sumMoney } from '../finance/money';
import { requisitionAmounts } from './requisition.logic';

export function effectiveReturnedQuantity(returns: { quantity: number; status: string }[]): number {
  return returns.filter(row => !['REJECTED', 'CANCELLED'].includes(row.status.toUpperCase())).reduce((sum, row) => sum + row.quantity, 0);
}

export function assertReturnQuantity(issued: number, alreadyReturned: number, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestError('Return quantity must be a positive integer');
  if (alreadyReturned < 0 || alreadyReturned + quantity > issued) throw new BadRequestError('Return quantity exceeds issued minus already returned');
}

export function remainingReturnCharges(line: {
  quantityIssued: number; rate: Prisma.Decimal; approvalPercent: Prisma.Decimal | null; customerPercent: Prisma.Decimal | null;
}, chargeType: ChargeType, returned: number) {
  if (!Number.isInteger(returned) || returned < 0 || returned > line.quantityIssued) throw new BadRequestError('Returned quantity is outside the issued quantity');
  return requisitionAmounts(chargeType, line.quantityIssued - returned, line.rate.toNumber(), line.approvalPercent?.toNumber(), line.customerPercent?.toNumber());
}

export function returnSlipFooter(lines: { quantity: number; amount: Prisma.Decimal | null }[]) {
  return {
    numberOfItems: lines.length,
    netQuantityReturned: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalAmount: sumMoney(lines.map(line => line.amount?.toNumber() ?? 0)),
  };
}

export function returnSnapshot(quantity: number, rate: Prisma.Decimal) {
  return { rate, amount: lineAmount(quantity, rate.toNumber()) };
}
