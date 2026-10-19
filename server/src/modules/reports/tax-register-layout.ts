import { z } from 'zod';
import { money, sumMoney } from '../finance/money';

export const taxRegisterGroups = [
    { title: 'Bill details', columns: ['serialNumber', 'billNumber', 'billDate', 'customer'] },
    { title: 'Taxable', columns: ['taxableSpares', 'taxableDiscount', 'taxableHandlingCharge', 'taxableAmount', 'upstGovernment', 'upstNonGovernment', 'surchargeGovernment', 'surchargeNonGovernment', 'taxableOtherCharges', 'taxableSubtotal'] },
    { title: 'Tax paid / non-taxable', columns: ['nonTaxableTotal', 'nonTaxableDiscount', 'nonTaxableHandlingCharge', 'nonTaxableOtherCharges', 'nonTaxableSubtotal'] },
    { title: 'Labour and bill total', columns: ['labourAmount', 'labourVat', 'wctAmount', 'roundOff', 'netTotal'] },
];
export const taxRegisterMoneyKeys = taxRegisterGroups.slice(1).flatMap(g => g.columns);
export const taxRegisterColumns = taxRegisterGroups.flatMap(g => g.columns);
export const taxRegisterLabels: Record<string, string> = {
    serialNumber: 'S.No.', billNumber: 'Bill number', billDate: 'Bill date', customer: 'Customer',
    taxableSpares: 'Spares', taxableDiscount: 'Discount', taxableHandlingCharge: 'Handling charge',
    taxableAmount: 'Taxable amount', upstGovernment: 'UPST · Govt.', upstNonGovernment: 'UPST · Non-govt.',
    surchargeGovernment: 'Surcharge · Govt.', surchargeNonGovernment: 'Surcharge · Non-govt.',
    taxableOtherCharges: 'Other charges', taxableSubtotal: 'Subtotal', nonTaxableTotal: 'Total',
    nonTaxableDiscount: 'Discount', nonTaxableHandlingCharge: 'Handling charge', nonTaxableOtherCharges: 'Other charges',
    nonTaxableSubtotal: 'Subtotal', labourAmount: 'Labour amount', labourVat: 'VAT on labour',
    wctAmount: 'WCT amount', roundOff: 'Round off', netTotal: 'Net total',
};
const amount = z.number().finite().nullable();
export const taxRegisterSnapshotSchema = z.object({
    version: z.literal(1),
    source: z.enum(['BILLING', 'LEGACY']),
    documentNumber: z.string().min(1).optional(),
    sourceRoundingDifference: z.number().finite().optional(),
    values: z.object(Object.fromEntries(taxRegisterMoneyKeys.map(k => [k, amount])) as Record<string, typeof amount>),
});
type VatRow = { category: string; rate: number | { toString(): string }; saleAmount: number | { toString(): string }; discount: number | { toString(): string }; taxableAmount: number | { toString(): string }; vat: number | { toString(): string } };
type Bill = { taxRegisterSnapshot?: unknown; vatBreakdown: VatRow[]; labourTotal: number; labourDiscountAmount: number; serviceTotal: number; roundOff: number; total: number };
export function taxRegisterValues(bill: Bill): { values: Record<string, number | null>; incomplete: boolean; sourceRoundingDifference?: number; documentNumber?: string; source?: 'BILLING' | 'LEGACY' } {
    const stored = taxRegisterSnapshotSchema.safeParse(bill.taxRegisterSnapshot);
    if (stored.success) return { values: { ...stored.data.values, netTotal: bill.total, roundOff: bill.roundOff }, incomplete: Object.values(stored.data.values).some(v => v == null), sourceRoundingDifference: stored.data.sourceRoundingDifference ?? 0, documentNumber: stored.data.documentNumber, source: stored.data.source };
    const values: Record<string, number | null> = Object.fromEntries(taxRegisterMoneyKeys.map(k => [k, null]));
    values.netTotal = bill.total;
    values.roundOff = bill.roundOff;
    const rows = bill.vatBreakdown;
    if (!rows.length || rows.some(r => r.category === 'LEGACY_UNALLOCATED')) return { values, incomplete: true };
    const taxable = rows.filter(r => r.category !== 'LABOUR' && Number(r.rate) > 0);
    const nonTaxable = rows.filter(r => r.category !== 'LABOUR' && Number(r.rate) === 0);
    const sum = (rs: VatRow[], k: 'saleAmount' | 'discount' | 'taxableAmount' | 'vat') => sumMoney(rs.map(r => Number(r[k])));
    // Current billing has no handling, surcharge, other-charge or WCT inputs.
    // Do not fabricate a government split for tax already stored without it.
    Object.assign(values, {
        taxableSpares: sum(taxable, 'saleAmount'), taxableDiscount: sum(taxable, 'discount'),
        taxableHandlingCharge: 0, taxableAmount: sum(taxable, 'taxableAmount'),
        upstGovernment: taxable.length ? null : 0, upstNonGovernment: taxable.length ? null : 0,
        surchargeGovernment: 0, surchargeNonGovernment: 0, taxableOtherCharges: 0,
        taxableSubtotal: sumMoney([sum(taxable, 'taxableAmount'), sum(taxable, 'vat')]),
        nonTaxableTotal: sum(nonTaxable, 'saleAmount'), nonTaxableDiscount: sum(nonTaxable, 'discount'),
        nonTaxableHandlingCharge: 0, nonTaxableOtherCharges: 0, nonTaxableSubtotal: sum(nonTaxable, 'taxableAmount'),
        labourAmount: money(bill.labourTotal - bill.labourDiscountAmount + bill.serviceTotal),
        labourVat: sum(rows.filter(r => r.category === 'LABOUR'), 'vat'), wctAmount: 0,
    });
    return { values, incomplete: Object.values(values).some(v => v == null) };
}
// A missing historical value must not silently turn into a zero subtotal.
export function taxRegisterTotals(rows: Record<string, unknown>[]) {
    return Object.fromEntries(taxRegisterMoneyKeys.map(k => [k, rows.some(r => r[k] == null) ? null : sumMoney(rows.map(r => Number(r[k])))]));
}
