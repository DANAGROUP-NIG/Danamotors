import { ChargeType, Prisma } from '@prisma/client';
import { assertReturnQuantity, effectiveReturnedQuantity, remainingReturnCharges, returnSlipFooter, returnSnapshot } from './return-slip.logic';
import { returnSlipBody } from './return-slip.validation';

const decimal = (value: number) => new Prisma.Decimal(value);

describe('Return slip rules', () => {
  it('bounds returns by issued minus all active prior returns', () => {
    expect(effectiveReturnedQuantity([{ quantity: 1, status: 'Completed' }, { quantity: 1, status: 'Approved' }, { quantity: 1, status: 'Pending' }, { quantity: 2, status: 'REJECTED' }, { quantity: 2, status: 'CANCELLED' }])).toBe(3);
    expect(() => assertReturnQuantity(5, 3, 2)).not.toThrow();
    expect(() => assertReturnQuantity(5, 3, 3)).toThrow('exceeds issued');
    expect(() => assertReturnQuantity(5, 0, 0)).toThrow('positive integer');
    expect(() => assertReturnQuantity(5, 0, 0.5)).toThrow('positive integer');
  });

  it.each([0, 10, 30, 50, 100, 33.33])('reconciles every remaining goodwill quantity at %s percent', percent => {
    const line = { quantityIssued: 3, rate: decimal(100.01), approvalPercent: decimal(percent), customerPercent: decimal(100).minus(percent) };
    for (let returned = 0; returned <= 3; returned++) {
      const result = remainingReturnCharges(line, ChargeType.GOODWILL, returned);
      expect(decimal(result.approvedAmount).plus(result.customerAmount).toNumber()).toBe(decimal(100.01).times(3 - returned).toNumber());
      expect(result.charges.reduce((sum, charge) => sum.plus(charge.amount), decimal(0)).toNumber()).toBe(result.amount);
      expect(result.charges.reduce((sum, charge) => sum.plus(charge.quantity), decimal(0)).toNumber()).toBe(3 - returned);
    }
    expect(remainingReturnCharges(line, ChargeType.GOODWILL, 3).charges).toEqual([]);
    expect(remainingReturnCharges(line, ChargeType.GOODWILL, 0).amount).toBe(300.03);
  });

  it.each([ChargeType.CUSTOMER, ChargeType.WARRANTY, ChargeType.FREE])('reduces %s without inventing a customer share', type => {
    const result = remainingReturnCharges({ quantityIssued: 2, rate: decimal(80), approvalPercent: null, customerPercent: null }, type, 1);
    expect(result.charges).toEqual([{ chargeType: type, quantity: 1, rate: 80, amount: 80 }]);
  });

  it('rejects impossible remaining quantities', () => {
    const line = { quantityIssued: 2, rate: decimal(1), approvalPercent: null, customerPercent: null };
    for (const returned of [-1, 3, 0.5]) expect(() => remainingReturnCharges(line, ChargeType.CUSTOMER, returned)).toThrow('outside the issued');
  });

  it('uses the saved rate and decimal money helpers for return totals', () => {
    expect(returnSnapshot(3, decimal(100.01)).amount).toBe(300.03);
    expect(returnSlipFooter([{ quantity: 3, amount: decimal(300.03) }, { quantity: 1, amount: decimal(50.01) }])).toEqual({ numberOfItems: 2, netQuantityReturned: 4, totalAmount: 350.04 });
  });

  it('rejects duplicate rows, zero quantity and caller-supplied job/type/rate snapshots', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const line = { requisitionLineId: id, quantity: 1 };
    const input = { requisitionId: id, lines: [line] };
    expect(returnSlipBody.safeParse(input).success).toBe(true);
    expect(returnSlipBody.safeParse({ ...input, lines: [line, line] }).success).toBe(false);
    expect(returnSlipBody.safeParse({ ...input, lines: [{ ...line, quantity: 0 }] }).success).toBe(false);
    expect(returnSlipBody.safeParse({ ...input, lines: [{ ...line, rate: 0 }] }).success).toBe(false);
    expect(returnSlipBody.safeParse({ ...input, chargeType: 'FREE', jobCardId: id }).success).toBe(false);
  });
});
