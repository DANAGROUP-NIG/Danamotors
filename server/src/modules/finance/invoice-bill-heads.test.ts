import { invoiceSpareHeads } from './invoice-bill-heads';
import { calculateBillWithPartsVat } from './parts-vat';
import { priceSale } from '../part-sale/partSale.logic';

const parts = [
  { amount: 100.01, partSource: 'O', category: 'SPARES', taxable: true, customerPaid: true },
  { amount: 50.02, partSource: 'L', category: 'OIL', taxable: true, customerPaid: true },
];

const jobInput = {
  partsTotal: 150.03, labourTotal: 25.02, serviceTotal: 10,
  partsDiscountPercent: 10, labourDiscountPercent: 10, vatRate: 7.5, roundOffValue: 10,
};

it('reconciles mixed job bill heads after discounts, VAT and round-off', () => {
  const { totals } = calculateBillWithPartsVat(jobInput, parts, true);
  const heads = invoiceSpareHeads(parts, totals);
  expect(JSON.parse(JSON.stringify(heads))).toEqual({ kiaSpareTotal: '100.01', nonKiaSpareTotal: '50.02' });
  expect(() => invoiceSpareHeads(parts, { ...totals, total: totals.total + 0.01 })).toThrow('reconcile');
});

it('reconciles counter-sale heads while preserving line-level pricing', () => {
  const { totals } = priceSale(parts.map(part => ({ quantity: 1, rate: part.amount, vatPercent: 7.5 })), 10);
  const heads = invoiceSpareHeads(parts, {
    ...totals, partsTotal: totals.gross, partsDiscountAmount: totals.discount,
    labourTotal: 0, labourDiscountAmount: 0, serviceTotal: 0, vatAmount: totals.vat, vatRate: 7.5,
  });
  expect(JSON.parse(JSON.stringify(heads))).toEqual({ kiaSpareTotal: '100.01', nonKiaSpareTotal: '50.02' });
});

it('keeps the aggregate fallback when a billed part has no known source', () => {
  const { totals } = calculateBillWithPartsVat(jobInput, parts, true);
  expect(invoiceSpareHeads([{ amount: 150.03, partSource: null }], totals)).toEqual({});
});
