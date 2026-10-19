import { Prisma } from '@prisma/client';
import { money, sumMoney } from '../finance/money';
import { ReportRow } from './report.types';

export function reportBillType(value: string | null | undefined) {
    const normalized = value?.trim().toUpperCase();
    // TODO(confirm): historical bill flags must be mapped by the business.
    // Current paid status or a later job-credit approval cannot establish type.
    return normalized === 'CASH' || normalized === 'CREDIT' ? normalized : 'UNCLASSIFIED';
}
export interface TaxRow {
    category: string; rate: number | null; saleAmount: number | null; discount: number | null; taxableAmount: number | null; vat: number;
}
export function reconciledTaxRows(rows: TaxRow[], storedVat: number) {
    const difference = money(new Prisma.Decimal(storedVat).minus(sumMoney(rows.map(r => r.vat))).toNumber());
    return { difference, rows: difference === 0 ? rows : [...rows, { category: 'UNALLOCATED_DIFFERENCE', rate: null, saleAmount: 0, discount: 0, taxableAmount: 0, vat: difference }] };
}
export function sortTaxBills(rows: ReportRow[], order: unknown): ReportRow[] {
    return [...rows].sort((a, b) => (order === 'DATE' ? String(a.billDate).localeCompare(String(b.billDate)) : 0) || String(a.billNumber).localeCompare(String(b.billNumber), 'en', { numeric: true })).map((row, index) => ({ ...row, serialNumber: index + 1 }));
}
