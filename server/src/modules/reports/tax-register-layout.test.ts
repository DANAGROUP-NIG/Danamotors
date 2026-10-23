import { taxRegisterValues, taxRegisterTotals, taxRegisterColumns, taxRegisterGroups } from './tax-register-layout';

const bill = { total: 169.75, roundOff: 0, labourTotal: 50, labourDiscountAmount: 5, serviceTotal: 10, vatBreakdown: [
    { category: 'SPARES', rate: 7.5, saleAmount: 100, discount: 10, taxableAmount: 90, vat: 6.75 },
    { category: 'OIL', rate: 0, saleAmount: 20, discount: 2, taxableAmount: 18, vat: 0 },
    { category: 'LABOUR', rate: 7.5, saleAmount: 60, discount: 5, taxableAmount: 55, vat: 4.13 },
] };
describe('legacy tax register columns', () => {
    it('keeps taxable and non-taxable values separate, with net labour', () => {
        const result = taxRegisterValues(bill);
        expect(result.values).toMatchObject({ taxableSpares: 100, taxableDiscount: 10, taxableAmount: 90, taxableSubtotal: 96.75, nonTaxableTotal: 20, nonTaxableDiscount: 2, nonTaxableSubtotal: 18, labourAmount: 55, labourVat: 4.13, wctAmount: 0, netTotal: 169.75 });
        expect(result.values.upstGovernment).toBeNull();
    });
    it('does not infer zero historical charges from missing data', () => {
        const result = taxRegisterValues({ ...bill, vatBreakdown: [] });
        expect(result.values.netTotal).toBe(bill.total);
        expect(result.values.taxableSpares).toBeNull();
        expect(result.values.labourAmount).toBeNull();
        expect(result.incomplete).toBe(true);
    });
    it('uses a complete persisted snapshot including WCT and government splits', () => {
        const values = Object.fromEntries(taxRegisterColumns.slice(4).map(k => [k, 0]));
        Object.assign(values, { wctAmount: 25, upstGovernment: 7.5, taxableHandlingCharge: 10, nonTaxableOtherCharges: 5, netTotal: 500 });
        expect(taxRegisterValues({ ...bill, total: 500, taxRegisterSnapshot: { version: 1, source: 'LEGACY', values } })).toMatchObject({ values, incomplete: false });
    });
    it('does not show a partial sum as a complete column total', () => {
        expect(taxRegisterTotals([{ taxableSpares: 100, netTotal: 100 }, { taxableSpares: null, netTotal: 200 }])).toMatchObject({ taxableSpares: null, netTotal: 300 });
    });
    it('covers every displayed column exactly once in ordered groups', () => {
        expect(new Set(taxRegisterColumns).size).toBe(taxRegisterColumns.length);
        expect(taxRegisterGroups.flatMap(g => g.columns)).toEqual(taxRegisterColumns);
    });
});
