import { ChargeType } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';
import { lineAmount, money, sumMoney } from '../finance/money';

export interface LabourSlipActor {
  userId: string;
  branchId?: string | null;
  allBranches: boolean;
  goodwill: boolean;
}

export function labourSlipPricing(input: { pricing: string; standardHours: number; chargedHours?: number; rate: number }) {
  if (!['TIME', 'FIXED'].includes(input.pricing)) throw new BadRequestError('Labour pricing must be TIME or FIXED');
  const hours = input.chargedHours ?? input.standardHours;
  if (!Number.isFinite(input.standardHours) || input.standardHours < 0 || !Number.isFinite(hours) || hours <= 0) throw new BadRequestError('Labour hours must be valid; charged hours must be positive');
  const rate = money(input.rate);
  if (rate < 0) throw new BadRequestError('Labour rate cannot be negative');
  const quantity = input.pricing === 'FIXED' ? 1 : hours;
  return { hours, standardHours: input.standardHours, pricing: input.pricing, rate, amount: lineAmount(quantity, rate), chargeQuantity: quantity };
}

export function labourSlipFooter(lines: { amount: number; chargeLine: { chargeType: ChargeType } | null }[]) {
  const total = (type: ChargeType) => sumMoney(lines.filter(line => line.chargeLine?.chargeType === type).map(line => line.amount));
  // TODO(confirm): goodwill remains separate rather than being silently counted
  // as customer-paid or warranty in the three legacy footer buckets.
  return { numberOfItems: lines.length, warrantyAmount: total(ChargeType.WARRANTY), nonWarrantyAmount: total(ChargeType.CUSTOMER), freeAmount: total(ChargeType.FREE), goodwillAmount: total(ChargeType.GOODWILL), totalAmount: sumMoney(lines.map(line => line.amount)) };
}
