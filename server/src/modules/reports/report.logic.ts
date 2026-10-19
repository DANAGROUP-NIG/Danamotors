import { Prisma } from '@prisma/client';
import { sumMoney, money } from '../finance/money';
import { lagosDay } from '../finance/credit-terms';
import { ReportRow, ReportSection } from './report.types';
export const cancelled = (status: string) => ['CANCELLED', 'CANCELED', 'VOID'].includes(status.toUpperCase());
export const dateKey = (date: Date) => lagosDay(date);
export const dateBounds = (from: string, to: string) => ({ gte: new Date(from + 'T00:00:00+01:00'), lt: new Date(Date.parse(to + 'T00:00:00+01:00') + 86400000) });
export const categoryOf = (part: {
    taxCategory?: string | null;
    reportTaxCategoryCode?: string | null;
} | null | undefined) => part?.reportTaxCategoryCode ?? ({ A: 'SPARES', B: 'OIL', C: 'ACCESSORIES', SPARES: 'SPARES', OIL: 'OIL', ACCESSORIES: 'ACCESSORIES' }[part?.taxCategory?.toUpperCase() ?? ''] ?? 'UNCLASSIFIED');
export function totals(rows: ReportRow[], keys: string[]): ReportRow { return Object.fromEntries(keys.map(k => [k, sumMoney(rows.map(r => typeof r[k] === 'number' ? r[k] as number : 0))])); }
export function groups(rows: ReportRow[], key: string, keys: string[]): ReportSection[] {
    const map = new Map<string, ReportRow[]>();
    for (const row of rows) {
        const label = String(row[key] ?? 'Not recorded');
        map.set(label, [...(map.get(label) ?? []), row]);
    }
    return [...map].map(([title, rows]) => ({ title, rows, totals: totals(rows, keys) }));
}
export function deliveryGrid(rows: ReportRow[], dimension: string) {
    const labels = [...new Set(rows.map(r => String(r[dimension])))].sort();
    const dates = [...new Set(rows.map(r => String(r.deliveryDate)))].sort();
    const grid = dates.map(date => {
        const row: ReportRow = { deliveryDate: date };
        for (const label of labels)
            row[label] = rows.filter(r => r.deliveryDate === date && r[dimension] === label).length;
        row.total = rows.filter(r => r.deliveryDate === date).length;
        return row;
    });
    return { rows: grid, totals: totals(grid, [...labels, 'total']), columns: ['deliveryDate', ...labels, 'total'] };
}
export const submittedStatuses = ['SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'RETURNED', 'SETTLED'];
export const claimGenerated = (claims: Array<{
    case: {
        status: string;
        statusHistory?: Array<{
            toStatus: string;
        }>;
    };
}>) => claims.some(l => submittedStatuses.includes(l.case.status) || l.case.statusHistory?.some(h => h.toStatus === 'SUBMITTED'));
export const daysLate = (booked: Date, opened: Date) => (Date.parse(dateKey(opened)) - Date.parse(dateKey(booked))) / 86400000;
export function netIssued(issued: number, returns: Array<{
    quantity: number;
    status: string;
}>) { return new Prisma.Decimal(issued).minus(returns.filter(r => r.status.toUpperCase() !== 'REJECTED').reduce((s, r) => s.plus(r.quantity), new Prisma.Decimal(0))).toNumber(); }
export function unbilledQuantity(issued: number, returned: number, billed: number) { return Prisma.Decimal.max(0, new Prisma.Decimal(issued).minus(returned).minus(billed)).toNumber(); }
export interface VariationLine {
    key: string;
    type: string;
    code: string;
    description: string;
    quantity: number;
    amount: number;
}
export function compareEstimate(expected: VariationLine[], actual: VariationLine[], basedOn: string, variation: string) {
    const aggregate = (lines: VariationLine[]) => {
        const map = new Map<string, VariationLine>();
        for (const l of lines) {
            const prior = map.get(l.key);
            map.set(l.key, prior ? { ...prior, quantity: new Prisma.Decimal(prior.quantity).plus(l.quantity).toNumber(), amount: sumMoney([prior.amount, l.amount]) } : l);
        }
        return map;
    };
    const e = aggregate(expected), a = aggregate(actual);
    const keys = basedOn === 'ESTIMATE' ? (variation === 'SHORTAGE' ? [...e.keys()] : [...new Set([...e.keys(), ...a.keys()])]) : (variation === 'EXCESS' ? [...a.keys()] : [...new Set([...a.keys(), ...e.keys()])]);
    return keys.flatMap(key => {
        const p = e.get(key), u = a.get(key);
        const qty = new Prisma.Decimal(u?.quantity ?? 0).minus(p?.quantity ?? 0).toNumber(), amount = money(new Prisma.Decimal(u?.amount ?? 0).minus(p?.amount ?? 0).toNumber());
        if (variation === 'SHORTAGE' ? qty >= 0 && amount >= 0 : qty <= 0 && amount <= 0)
            return [];
        const l = p ?? u!;
        return [{ itemType: l.type, itemCode: l.code, description: l.description, estimatedQty: p?.quantity ?? 0, estimatedAmount: p?.amount ?? 0, actualQty: u?.quantity ?? 0, actualAmount: u?.amount ?? 0, variationQty: qty, variationAmount: amount }];
    });
}
