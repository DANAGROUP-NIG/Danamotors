import { labourSlipFooter, labourSlipPricing } from './labour-slip.logic';
import { labourSlipLineBody } from './labour-slip.validation';
import { ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '../../shared/constants/roles';

describe('Labour slip pricing', () => {
  it('stores standard and charged hours separately and uses decimal rounding', () => {
    expect(labourSlipPricing({ pricing: 'TIME', standardHours: 3, chargedHours: 2.5, rate: 100.01 })).toEqual({ hours: 2.5, standardHours: 3, pricing: 'TIME', rate: 100.01, amount: 250.03, chargeQuantity: 2.5 });
    expect(labourSlipPricing({ pricing: 'TIME', standardHours: 3, rate: 100.01 }).hours).toBe(3);
  });

  it('keeps fixed amounts independent of charged hours', () => {
    expect(labourSlipPricing({ pricing: 'FIXED', standardHours: 3, chargedHours: 4.5, rate: 500 })).toEqual({ hours: 4.5, standardHours: 3, pricing: 'FIXED', rate: 500, amount: 500, chargeQuantity: 1 });
  });

  it('rejects unsupported pricing, invalid hours and invalid rates', () => {
    for (const input of [
      { pricing: 'UNKNOWN', standardHours: 1, rate: 1 },
      { pricing: 'TIME', standardHours: -1, rate: 1 },
      { pricing: 'TIME', standardHours: 1, chargedHours: 0, rate: 1 },
      { pricing: 'FIXED', standardHours: 1, chargedHours: NaN, rate: 1 },
      { pricing: 'FIXED', standardHours: 1, rate: Infinity },
      { pricing: 'TIME', standardHours: 1, rate: -1 },
    ]) expect(() => labourSlipPricing(input)).toThrow();
  });

  it('keeps each payer subtotal separate and reconciles the grand total', () => {
    expect(labourSlipFooter([
      { amount: 100.01, chargeLine: { chargeType: 'CUSTOMER' } },
      { amount: 200.02, chargeLine: { chargeType: 'WARRANTY' } },
      { amount: 300.03, chargeLine: { chargeType: 'FREE' } },
      { amount: 50.04, chargeLine: { chargeType: 'GOODWILL' } },
    ])).toEqual({ numberOfItems: 4, nonWarrantyAmount: 100.01, warrantyAmount: 200.02, freeAmount: 300.03, goodwillAmount: 50.04, totalAmount: 650.1 });
  });

  it('requires one technician and rejects caller-supplied price snapshots', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const input = { labourItemId: id, technicianId: id, chargedHours: 2, chargeType: 'CUSTOMER' };
    expect(labourSlipLineBody.safeParse(input).success).toBe(true);
    expect(labourSlipLineBody.safeParse({ labourItemId: id }).success).toBe(false);
    expect(labourSlipLineBody.safeParse({ ...input, mechanicId: id }).success).toBe(false);
    for (const field of ['rate', 'standardHours', 'amount', 'pricing', 'technicianIds']) expect(labourSlipLineBody.safeParse({ ...input, [field]: 1 }).success).toBe(false);
  });

  it('does not grant store roles labour-writing rights', () => {
    for (const role of [ROLES.GENERAL_STORE_MANAGER, ROLES.BRANCH_STORE_MANAGER]) expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.JOBLABOUR_UPDATE);
  });
});
