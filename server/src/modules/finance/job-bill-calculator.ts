import { BadRequestError } from '../../shared/errors/appError';

export interface JobBillTotalsInput {
  partsTotal: number;
  labourTotal: number;
  partsDiscountPercent: number;
  labourDiscountPercent: number;
  vatRate: number;
}

export interface JobBillTotals {
  partsTotal: number;
  labourTotal: number;
  partsDiscountAmount: number;
  labourDiscountAmount: number;
  vatRate: number;
  vatAmount: number;
  roundOff: number;
  total: number;
}

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function calculateJobBillTotals(input: JobBillTotalsInput): JobBillTotals {
  const { partsTotal, labourTotal, partsDiscountPercent, labourDiscountPercent, vatRate } = input;
  const values = [partsTotal, labourTotal, partsDiscountPercent, labourDiscountPercent, vatRate];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new BadRequestError('Bill amounts, discounts, and VAT rate must be non-negative finite numbers');
  }
  if (partsDiscountPercent > 100 || labourDiscountPercent > 100) {
    throw new BadRequestError('Discount percentages cannot exceed 100');
  }
  if (partsTotal === 0 && partsDiscountPercent > 0) {
    throw new BadRequestError('A parts discount cannot be applied when the job has no parts');
  }

  const partsDiscountAmount = roundMoney((partsTotal * partsDiscountPercent) / 100);
  const labourDiscountAmount = roundMoney((labourTotal * labourDiscountPercent) / 100);
  const discountedParts = roundMoney(partsTotal - partsDiscountAmount);
  const discountedLabour = roundMoney(labourTotal - labourDiscountAmount);
  const vatAmount = roundMoney((discountedLabour * vatRate) / 100);
  const amountBeforeRoundOff = roundMoney(discountedParts + discountedLabour + vatAmount);
  const total = Math.round(amountBeforeRoundOff);

  return {
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