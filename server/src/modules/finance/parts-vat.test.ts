import { calculateBillWithPartsVat, defaultPartsVatRates } from './parts-vat';
import { jobBillMappingAmounts } from './tally-xml';
import { sumMoney } from './money';
import { calculateJobBillTotals } from './job-bill-calculator';
const input = { partsTotal: 1750, labourTotal: 1000, serviceTotal: 100, partsDiscountPercent: 10, labourDiscountPercent: 20, vatRate: 7.5 };
const parts = [{ category: 'SPARES', amount: 1000, taxable: true, customerPaid: true }, { category: 'OIL', amount: 500, taxable: true, customerPaid: true }, { category: 'ACCESSORIES', amount: 250, taxable: false, customerPaid: true }, { category: 'SPARES', amount: 9999, taxable: true, customerPaid: false }];
describe('Flagged parts VAT', () => {
    it('posts the full enabled parts-and-labour VAT to the existing Tally mapping', () => {
        const { totals } = calculateBillWithPartsVat(input, parts, true);
        const mappings = jobBillMappingAmounts(totals);
        expect(mappings.find(([key]) => key === 'VAT')?.[1]).toBe(-168.75);
        expect(sumMoney([totals.total, ...mappings.map(([, amount]) => amount)])).toBe(0);
    });

    it('never assigns a negative rounding discount across six category/rate buckets',()=>{
      const p=['SPARES','OIL','ACCESSORIES'].flatMap(category=>[true,false].map(taxable=>({category,taxable,customerPaid:true,amount:0.05})));
      const r=calculateBillWithPartsVat({...input,partsTotal:0.3,partsDiscountPercent:10},p,true);
      const amounts=r.breakdown.filter(b=>b.category!=='LABOUR');expect(amounts.every(b=>b.discount>=0&&b.discount<=b.saleAmount)).toBe(true);expect(amounts.reduce((s,b)=>s+Math.round(b.discount*100),0)).toBe(3);
    });
    it('is byte-for-byte identical to original calculator when OFF', () => { expect(JSON.stringify(calculateBillWithPartsVat(input, parts, false).totals)).toBe(JSON.stringify(calculateJobBillTotals(input))); });
    it('does not introduce category or rate validation failures while OFF', () => {
        const result = calculateBillWithPartsVat(input, [], false, { SPARES: 999, OIL: -1, ACCESSORIES: 0 });
        expect(JSON.stringify(result.totals)).toBe(JSON.stringify(calculateJobBillTotals(input)));
        expect(result.breakdown[0]).toMatchObject({ category: 'UNCLASSIFIED', saleAmount: 1750, vat: 0 });
        expect(() => calculateBillWithPartsVat(input, [], true)).toThrow('reconcile');
    });
    it('taxes discounted customer-paid category amounts, exempt at 0%', () => { const r = calculateBillWithPartsVat(input, parts, true); expect(r.breakdown).toEqual([{ category: 'SPARES', rate: 7.5, saleAmount: 1000, discount: 100, taxableAmount: 900, vat: 67.5 }, { category: 'OIL', rate: 7.5, saleAmount: 500, discount: 50, taxableAmount: 450, vat: 33.75 }, { category: 'ACCESSORIES', rate: 0, saleAmount: 250, discount: 25, taxableAmount: 225, vat: 0 }, { category: 'LABOUR', rate: 7.5, saleAmount: 1100, discount: 200, taxableAmount: 900, vat: 67.5 }]); expect(r.totals).toMatchObject({ vatAmount: 168.75, total: 2644, roundOff: 0.25 }); });
    it('accepts category-specific rates', () => { expect(calculateBillWithPartsVat(input, parts, true, { ...defaultPartsVatRates, OIL: 5 }).breakdown[1].vat).toBe(22.5); });
    it('rejects unclassified parts only when enabled', () => { const p = [{ amount: 1750, category: 'UNCLASSIFIED', taxable: true, customerPaid: true }]; expect(() => calculateBillWithPartsVat(input, p, true)).toThrow('Classify'); expect(() => calculateBillWithPartsVat(input, p, false)).not.toThrow(); });
    it('allocates a rounding remainder so category discounts reconcile', () => { const p = [{ amount: 0.05, category: 'SPARES', taxable: true, customerPaid: true }, { amount: 0.05, category: 'OIL', taxable: true, customerPaid: true }]; const r = calculateBillWithPartsVat({ ...input, partsTotal: 0.1, partsDiscountPercent: 10 }, p, true); expect(r.breakdown[0].discount + r.breakdown[1].discount).toBe(r.totals.partsDiscountAmount); });
});
