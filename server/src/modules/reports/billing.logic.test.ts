import { reportBillType, reconciledTaxRows, sortTaxBills } from './billing.logic';
import { taxAnnexure } from './billing.report';
import { sumMoney } from '../finance/money';

describe('tax register reconciliation and safe bill classification', () => {
    it('orders displayed legacy document numbers instead of internal import keys', () => {
        const rows = [{ billNumber: '10', billDate: '2026-10-01' }, { billNumber: '2', billDate: '2026-10-02' }];
        expect(sortTaxBills(rows, 'NUMBER').map(r => r.billNumber)).toEqual(['2', '10']);
        expect(sortTaxBills(rows, 'DATE').map(r => r.billNumber)).toEqual(['10', '2']);
    });
    it('uses only explicit cash/credit values', () => {
        expect(reportBillType('cash')).toBe('CASH');
        expect(reportBillType('CREDIT')).toBe('CREDIT');
        for (const value of [null, undefined, 'I', 'Z']) expect(reportBillType(value)).toBe('UNCLASSIFIED');
    });
    it('balances partial snapshots explicitly without changing stored amounts', () => {
        const rows = [{ category: 'SPARES', rate: 7.5, saleAmount: 100, discount: 0, taxableAmount: 100, vat: 7.5 }];
        const result = reconciledTaxRows(rows, 15);
        expect(result.difference).toBe(7.5);
        expect(result.rows.at(-1)).toMatchObject({ category: 'UNALLOCATED_DIFFERENCE', rate: null, vat: 7.5 });
        expect(sumMoney(taxAnnexure(result.rows).map(r => Number(r.vat)))).toBe(15);
        expect(rows).toHaveLength(1);
    });
    it('does not fabricate a tax rate for negative reconciliation adjustments', () => {
        const result = reconciledTaxRows([{ category: 'LABOUR', rate: 7.5, saleAmount: 100, discount: 0, taxableAmount: 100, vat: 7.5 }], 7);
        expect(result.rows.at(-1)).toMatchObject({ rate: null, vat: -0.5 });
        expect(result.difference).toBe(-0.5);
    });
});
