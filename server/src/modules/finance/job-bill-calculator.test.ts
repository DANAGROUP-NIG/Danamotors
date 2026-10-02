import { BadRequestError } from '../../shared/errors/appError';
import { calculateJobBillTotals } from './job-bill-calculator';

describe('calculateJobBillTotals', () => {
  it('applies the two discounts and VAT to discounted labour only', () => {
    expect(calculateJobBillTotals({
      partsTotal: 1000,
      labourTotal: 1000,
      partsDiscountPercent: 10,
      labourDiscountPercent: 20,
      vatRate: 7.5,
    })).toEqual({
      partsTotal: 1000,
      labourTotal: 1000,
      partsDiscountAmount: 100,
      labourDiscountAmount: 200,
      vatRate: 7.5,
      vatAmount: 60,
      roundOff: 0,
      total: 1760,
    });
  });

  it('allows a labour discount on a job without parts', () => {
    expect(calculateJobBillTotals({
      partsTotal: 0,
      labourTotal: 1000,
      partsDiscountPercent: 0,
      labourDiscountPercent: 10,
      vatRate: 7.5,
    })).toMatchObject({ labourDiscountAmount: 100, vatAmount: 67.5, total: 968 });
  });

  it('rejects a parts discount when the job has no parts', () => {
    expect(() => calculateJobBillTotals({
      partsTotal: 0,
      labourTotal: 1000,
      partsDiscountPercent: 1,
      labourDiscountPercent: 0,
      vatRate: 7.5,
    })).toThrow(BadRequestError);
  });

  it('rounds the final total to the nearest whole currency unit', () => {
    expect(calculateJobBillTotals({
      partsTotal: 0,
      labourTotal: 10.01,
      partsDiscountPercent: 0,
      labourDiscountPercent: 0,
      vatRate: 7.5,
    })).toMatchObject({ vatAmount: 0.75, roundOff: 0.24, total: 11 });
  });

  it('rejects discounts above 100 percent', () => {
    expect(() => calculateJobBillTotals({
      partsTotal: 1,
      labourTotal: 0,
      partsDiscountPercent: 101,
      labourDiscountPercent: 0,
      vatRate: 7.5,
    })).toThrow(BadRequestError);
  });
});