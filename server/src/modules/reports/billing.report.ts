import prisma from '../../prisma/client';
import { ReportInput } from './report.validation';
import { ReportResult, ReportRow } from './report.types';
import { activeInvoice, jobScope } from './report.repository';
import { dateBounds, dateKey, groups, totals } from './report.logic';
import { customerName } from './delivery-warranty.report';
import { money, sumMoney } from '../finance/money';
import { BadRequestError } from '../../shared/errors/appError';
import { Prisma } from '@prisma/client';
export function taxAnnexure(rows: Array<{
    category: string;
    rate: number;
    saleAmount: number;
    discount: number;
    taxableAmount: number;
    vat: number;
}>): ReportRow[] {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
        const k = r.category + ':' + r.rate;
        map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map].map(([, rs]) => ({ category: rs[0].category, rate: rs[0].rate, ...totals(rs as unknown as ReportRow[], ['saleAmount', 'discount', 'taxableAmount', 'vat']) }));
}
export async function taxRegister(input: ReportInput): Promise<ReportResult> {
    const bills = await prisma.invoice.findMany({ where: { ...activeInvoice, issuedDate: dateBounds(input.from!, input.to!), jobCard: { is: jobScope(input) } }, include: { customer: true, jobCard: true, vatBreakdown: true }, orderBy: input.order === 'DATE' ? [{ issuedDate: 'asc' }, { invoiceNumber: 'asc' }] : [{ invoiceNumber: 'asc' }] });
    const rows: ReportRow[] = [];
    const taxes: Array<{
        category: string;
        rate: number;
        saleAmount: number;
        discount: number;
        taxableAmount: number;
        vat: number;
    }> = [];
    let historical = 0;
    for (const i of bills) {
        const type = i.billType ?? (i.jobCard?.creditApprovedById ? 'CREDIT' : 'CASH');
        if (input.billType !== 'BOTH' && input.billType !== type)
            continue;
        const breakdown = i.vatBreakdown.map(r => ({ category: r.category, rate: Number(r.rate), saleAmount: Number(r.saleAmount), discount: Number(r.discount), taxableAmount: Number(r.taxableAmount), vat: Number(r.vat) }));
        if (!breakdown.length) {
            historical++;
            breakdown.push({ category: 'LEGACY_UNALLOCATED', rate: i.vatRate, saleAmount: i.subtotal, discount: sumMoney([i.partsDiscountAmount, i.labourDiscountAmount]), taxableAmount: money(new Prisma.Decimal(i.subtotal).minus(i.partsDiscountAmount).minus(i.labourDiscountAmount).toNumber()), vat: i.vatAmount });
        }
        taxes.push(...breakdown);
        const cat = (key: string) => sumMoney(breakdown.filter(b => b.category === key).map(b => b.saleAmount));
        const partVat = sumMoney(breakdown.filter(b => b.category !== 'LABOUR' && b.category !== 'LEGACY_UNALLOCATED').map(b => b.vat));
        rows.push({ billType: type, billNumber: i.invoiceNumber, billDate: dateKey(i.issuedDate), customer: customerName(i.customer), ...(input.printAddress === 'true' ? { address: i.customer.address, phone: i.customer.phoneNumber } : {}), taxId: null, spares: breakdown.some(b => b.category === 'SPARES') ? cat('SPARES') : null, oil: breakdown.some(b => b.category === 'OIL') ? cat('OIL') : null, accessories: breakdown.some(b => b.category === 'ACCESSORIES') ? cat('ACCESSORIES') : null, unclassifiedParts: cat('UNCLASSIFIED'), parts: i.partsTotal, discount: sumMoney([i.partsDiscountAmount, i.labourDiscountAmount]), taxableAmount: money(new Prisma.Decimal(i.subtotal).minus(i.partsDiscountAmount).minus(i.labourDiscountAmount).toNumber()), partsVat: partVat, labour: i.labourTotal, serviceCharge: i.serviceTotal, labourVat: sumMoney(breakdown.filter(b => b.category === 'LABOUR').map(b => b.vat)), legacyVat: sumMoney(breakdown.filter(b => b.category === 'LEGACY_UNALLOCATED').map(b => b.vat)), vat: i.vatAmount, roundOff: i.roundOff, billAmount: i.total });
    }
    const keys = ['spares', 'oil', 'accessories', 'unclassifiedParts', 'parts', 'discount', 'taxableAmount', 'partsVat', 'labour', 'serviceCharge', 'labourVat', 'legacyVat', 'vat', 'roundOff', 'billAmount'];
    const annexure = taxAnnexure(taxes);
    const sections = input.view === 'ANNEXURE' ? [] : groups(rows, 'billType', keys).map((g, i) => ({ ...g, pageBreak: input.pageBreak === 'true' && i > 0 }));
    if (input.view !== 'DETAIL')
        sections.push({ title: 'VAT annexure', rows: annexure, totals: totals(annexure, ['saleAmount', 'discount', 'taxableAmount', 'vat']), pageBreak: true });
    return { rows: [], groups: sections, totals: { ...totals(rows, keys), bills: rows.length }, filters: input, warnings: historical ? [`${historical} historical bills have no category breakdown. Stored VAT appears as legacy unallocated; no amounts were reconstructed.`] : [] };
}
export async function corporateBills(input: ReportInput): Promise<ReportResult> {
    const corporates = await prisma.corporateGroup.findMany({ orderBy: input.order === 'NAME' ? [{ name: 'asc' }, { code: 'asc' }] : [{ code: 'asc' }] });
    const low = input.fromCorporateId ? corporates.findIndex(g => g.id === input.fromCorporateId) : 0, high = input.toCorporateId ? corporates.findIndex(g => g.id === input.toCorporateId) : corporates.length - 1;
    if (low < 0 || high < 0 || low > high && corporates.length)
        throw new BadRequestError('Choose a valid ordered corporate range');
    const selected = corporates.slice(low, high + 1);
    const bills = await prisma.invoice.findMany({ where: { ...activeInvoice, issuedDate: dateBounds(input.from!, input.to!), jobCard: { is: { ...jobScope(input), vehicle: { corporateGroupId: { in: selected.map(g => g.id) } } } } }, include: { jobCard: { include: { vehicle: { include: { corporateGroup: true, catalogModel: true, catalogue: { include: { parent: true } } } }, serviceType: true, service: true } } }, orderBy: [{ issuedDate: 'asc' }, { invoiceNumber: 'asc' }] });
    const rows = bills.flatMap(i => {
        const j = i.jobCard!, v = j.vehicle!, g = v.corporateGroup!, billType = i.billType ?? (j.creditApprovedById ? 'CREDIT' : 'CASH');
        if (input.billType !== 'BOTH' && billType !== input.billType)
            return [];
        return [{ corporate: g.code + ' · ' + g.name, billNumber: i.invoiceNumber, billDate: dateKey(i.issuedDate), billType, jobNumber: j.jobNumber, registration: v.registrationNumber, vin: v.vin, model: v.catalogModel?.name ?? v.catalogue?.parent?.description ?? v.model, serviceType: j.serviceType?.description ?? j.service?.name ?? '', parts: i.partsTotal, labour: i.labourTotal, serviceCharge: i.serviceTotal, vat: i.vatAmount, billAmount: i.total, outstanding: i.outstandingAmount }];
    });
    rows.sort((a, b) => selected.findIndex(g => a.corporate.startsWith(g.code + ' ·')) - selected.findIndex(g => b.corporate.startsWith(g.code + ' ·')));
    const keys = ['parts', 'labour', 'serviceCharge', 'vat', 'billAmount', 'outstanding'];
    return { rows: [], groups: groups(rows, 'corporate', keys), totals: totals(rows, keys), filters: input };
}
