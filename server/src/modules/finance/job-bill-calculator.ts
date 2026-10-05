import { BadRequestError } from '../../shared/errors/appError';
import { Prisma } from '@prisma/client';
import { money as roundMoney } from './money';

export interface JobBillTotalsInput {
  partsTotal: number;
  labourTotal: number;
  serviceTotal?: number;
  partsDiscountPercent: number;
  labourDiscountPercent: number;
  vatRate: number;
}

export interface JobBillTotals {
  serviceTotal: number;
  partsTotal: number;
  labourTotal: number;
  partsDiscountAmount: number;
  labourDiscountAmount: number;
  vatRate: number;
  vatAmount: number;
  roundOff: number;
  total: number;
}

export function calculateJobBillTotals(input: JobBillTotalsInput): JobBillTotals {
  const { partsDiscountPercent, labourDiscountPercent, vatRate } = input;
  const partsTotal = roundMoney(input.partsTotal);
  const labourTotal = roundMoney(input.labourTotal);
  const serviceTotal = roundMoney(input.serviceTotal ?? 0);
  const values = [partsTotal, labourTotal, serviceTotal, partsDiscountPercent, labourDiscountPercent, vatRate];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new BadRequestError('Bill amounts, discounts, and VAT rate must be non-negative finite numbers');
  }
  if (partsDiscountPercent > 100 || labourDiscountPercent > 100 || vatRate > 100) {
    throw new BadRequestError('Discount percentages cannot exceed 100');
  }
  if (partsTotal === 0 && partsDiscountPercent > 0) {
    throw new BadRequestError('A parts discount cannot be applied when the job has no parts');
  }

  const percentage = (amount: number, percent: number) => roundMoney(new Prisma.Decimal(amount).times(percent).div(100).toNumber());
  const partsDiscountAmount = percentage(partsTotal, partsDiscountPercent);
  const labourDiscountAmount = percentage(labourTotal, labourDiscountPercent);
  const discountedParts = roundMoney(partsTotal - partsDiscountAmount);
  const discountedLabour = roundMoney(labourTotal - labourDiscountAmount);
  const vatAmount = percentage(roundMoney(discountedLabour + serviceTotal), vatRate);
  const amountBeforeRoundOff = roundMoney(discountedParts + discountedLabour + serviceTotal + vatAmount);
  const total = Math.round(amountBeforeRoundOff);

  return {
    serviceTotal,
    partsTotal: roundMoney(partsTotal),
    labourTotal: roundMoney(labourTotal),
    partsDiscountAmount,
    labourDiscountAmount,
    vatRate,
    vatAmount,
    roundOff: roundMoney(total - amountBeforeRoundOff),
    total,
  };
}
