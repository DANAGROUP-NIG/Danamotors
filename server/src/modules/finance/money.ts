import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';

/** Round at the monetary boundary using decimal arithmetic, never binary floats. */
export function money(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new BadRequestError('Amount is outside the supported range');
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function lineAmount(quantity: number, rate: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(rate) || rate < 0) {
    throw new BadRequestError('Bill lines require a positive quantity and a non-negative rate');
  }
  return money(new Prisma.Decimal(quantity).times(rate).toNumber());
}

export function sumMoney(values: number[]): number {
  return money(values.reduce((sum, value) => sum.plus(money(value)), new Prisma.Decimal(0)).toNumber());
}
