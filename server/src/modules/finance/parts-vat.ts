import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { calculateJobBillTotals, JobBillTotalsInput } from './job-bill-calculator';
import { money, sumMoney } from './money';
import { BadRequestError } from '../../shared/errors/appError';
export const partsVatRatesSchema = z.object({ SPARES: z.number().min(0).max(100).multipleOf(0.01), OIL: z.number().min(0).max(100).multipleOf(0.01), ACCESSORIES: z.number().min(0).max(100).multipleOf(0.01) }).strict();
export type PartsVatRates = z.infer<typeof partsVatRatesSchema>;
export const defaultPartsVatRates: PartsVatRates = { SPARES: 7.5, OIL: 7.5, ACCESSORIES: 7.5 };
export interface TaxPart {
    amount: number;
    category: string;
    taxable: boolean;
    customerPaid: boolean;
}
export interface VatRow {
    category: string;
    rate: number;
    saleAmount: number;
    discount: number;
    taxableAmount: number;
    vat: number;
}
export function calculateBillWithPartsVat(input: JobBillTotalsInput, parts: TaxPart[], enabled: boolean, rates = defaultPartsVatRates) {
    const base = calculateJobBillTotals(input);
    if (enabled) partsVatRatesSchema.parse(rates);
    let incomplete = false;
    const grouped = new Map<string, {
        category: string;
        rate: number;
        sale: Prisma.Decimal;
    }>();
    for (const p of parts) {
        if (!p.customerPaid)
            continue;
        if (!Number.isFinite(p.amount) || p.amount < 0) {
            if (enabled) throw new BadRequestError('Invalid part amount');
            incomplete = true;
            continue;
        }
        if (enabled && !Object.prototype.hasOwnProperty.call(rates, p.category))
            throw new BadRequestError('Classify every customer-paid part as spares, oil or accessories before enabling parts VAT');
        const rate = enabled && p.taxable ? rates[p.category as keyof PartsVatRates] : 0;
        const key = p.category + ':' + rate;
        const prior = grouped.get(key);
        grouped.set(key, { category: p.category, rate, sale: (prior?.sale ?? new Prisma.Decimal(0)).plus(p.amount) });
    }
    if (incomplete || sumMoney([...grouped.values()].map(g => money(g.sale.toNumber()))) !== base.partsTotal) {
        if (enabled) throw new BadRequestError('Part tax amounts do not reconcile with the bill');
        // OFF must accept exactly the old calculator's inputs. Missing category
        // metadata affects only the new breakdown, never the original totals.
        grouped.clear();
        grouped.set('UNCLASSIFIED:0', { category: 'UNCLASSIFIED', rate: 0, sale: new Prisma.Decimal(base.partsTotal) });
    }
    const breakdown: VatRow[] = [];
    const taxGroups=[...grouped.values()];
    const discountKobo=new Prisma.Decimal(base.partsDiscountAmount).times(100);
    // Allocate whole kobo by largest remainder. Rounding every category up and
    // correcting only the final category can produce a negative discount there.
    const allocations=taxGroups.map((g,index)=>{
        const exact=base.partsTotal?g.sale.div(base.partsTotal).times(discountKobo):new Prisma.Decimal(0);
        return {index,kobo:exact.floor(),fraction:exact.minus(exact.floor())};
    });
    const remaining=discountKobo.minus(allocations.reduce((sum,a)=>sum.plus(a.kobo),new Prisma.Decimal(0))).toNumber();
    const ranked=[...allocations].sort((a,b)=>b.fraction.comparedTo(a.fraction)||a.index-b.index);
    for(let i=0;i<remaining;i++)ranked[i].kobo=ranked[i].kobo.plus(1);
    for (const [index,g] of taxGroups.entries()) {
        const saleAmount = money(g.sale.toNumber());
        const discount = money(allocations[index].kobo.div(100).toNumber());
        const taxableAmount = money(g.sale.minus(discount).toNumber());
        const vat = money(new Prisma.Decimal(taxableAmount).times(g.rate).div(100).toNumber());
        breakdown.push({ category: g.category, rate: g.rate, saleAmount, discount, taxableAmount, vat });
    }
    const labourTaxable = money(new Prisma.Decimal(base.labourTotal).minus(base.labourDiscountAmount).plus(base.serviceTotal).toNumber());
    breakdown.push({ category: 'LABOUR', rate: base.vatRate, saleAmount: sumMoney([base.labourTotal, base.serviceTotal]), discount: base.labourDiscountAmount, taxableAmount: labourTaxable, vat: base.vatAmount });
    // Return the original object without adding fields or changing any arithmetic when OFF.
    if (!enabled)
        return { totals: base, breakdown };
    const vatAmount = sumMoney(breakdown.map(r => r.vat));
    const beforeRound = money(new Prisma.Decimal(base.partsTotal).minus(base.partsDiscountAmount).plus(base.labourTotal).minus(base.labourDiscountAmount).plus(base.serviceTotal).plus(vatAmount).toNumber());
    const total = Math.round(beforeRound);
    return { totals: { ...base, vatAmount, total, roundOff: money(new Prisma.Decimal(total).minus(beforeRound).toNumber()) }, breakdown };
}
export async function partsVatSettings(db: Prisma.TransactionClient) {
    // TODO(confirm): business approval is required before enabling parts VAT; default is OFF.
    const [flag, rates] = await Promise.all([db.financeSetting.findUnique({ where: { key: 'JOB_BILL_PARTS_VAT_ENABLED' } }), db.financeSetting.findUnique({ where: { key: 'partsVatRates' } })]);
    // An explicit true is required; legacy or unrelated values never enable billing changes.
    const enabled = process.env.JOB_BILL_PARTS_VAT_ENABLED === 'true' || flag?.value === true;
    const saved = partsVatRatesSchema.safeParse(rates?.value);
    if (enabled && rates?.value && !saved.success) throw new BadRequestError('Review the stored parts VAT rates before enabling parts VAT');
    return { enabled, rates: saved.success ? saved.data : defaultPartsVatRates };
}
