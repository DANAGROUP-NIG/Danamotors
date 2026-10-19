import { ReportRepository } from './report.repository';
import { ReportInput } from './report.validation';
import { ReportResult, ReportRow, ReportSection } from './report.types';
import { customerName, identity, modelName } from './delivery-warranty.report';
import { dateKey, groups, netIssued, totals } from './report.logic';
import { coverageFor } from '../warranty/warranty.coverage';
import { Prisma } from '@prisma/client';
import { money, sumMoney } from '../finance/money';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
export async function history(input: ReportInput): Promise<ReportResult> {
    const vehicles = await new ReportRepository().vehicles(input);
    if (!input.vehicleId) {
        if (vehicles.length > 100)
            throw new BadRequestError('More than 100 vehicles match. Narrow the search.');
        return { rows: vehicles.map(v => ({ vehicleId: v.id, customer: customerName(v.customer), registration: v.registrationNumber, model: modelName(v), variant: v.catalogue?.description ?? v.trim, vin: v.vin, visits: v._count.jobCards })), groups: [], totals: { vehicles: vehicles.length }, filters: input };
    }
    const v = vehicles[0];
    if (!v)
        throw new NotFoundError('Vehicle not found in the authorized branch');
    const coverage = coverageFor(v);
    const jobs = v.jobCards;
    const sections: ReportSection[] = [];
    sections.push({ title: 'Vehicle and warranty', rows: [{ registration: v.registrationNumber, vin: v.vin, engineNumber: v.engineNumber, model: modelName(v), variant: v.catalogue?.description ?? v.trim, colour: v.colour?.description ?? v.color, saleDate: v.saleDate ? dateKey(v.saleDate) : null, warrantyDays: v.vehicleModel?.warrantyDays ?? null, warrantyKm: v.vehicleModel?.warrantyKm ?? null, coverage: coverage.status, expiryDate: coverage.expiresOn, remainingDays: coverage.remainingDays, remainingKm: coverage.remainingKm }] });
    sections.push({ title: 'Current owner', rows: [{ customer: customerName(v.customer), address: v.customer?.address ?? '', phone: v.customer?.phoneNumber ?? '' }] });
    sections.push({ title: 'Ownership history', rows: v.ownerships.map(o => ({ customer: customerName(o.customer), address: o.customer.address, purchaseDate: dateKey(o.purchaseDate), saleDate: o.saleDate ? dateKey(o.saleDate) : null })) });
    sections.push({ title: 'Selling dealer', rows: [{ dealer: v.sellingDealer }] });
    sections.push({ title: 'Free services', rows: jobs.filter(j => j.serviceType?.freeService).map(j => ({ ...identity(j), mileage: j.mileage, freeServiceNumber: null })) });
    const expenses = jobs.map(j => ({ ...identity(j), amount: sumMoney(j.invoices.map(i => i.total)) }));
    sections.push({ title: 'Job visits', rows: jobs.map(j => ({ ...identity(j), mileage: j.mileage, status: j.status, advisor: [j.serviceAdvisor?.firstName, j.serviceAdvisor?.lastName].filter(Boolean).join(' '), engineer: [j.engineer?.firstName, j.engineer?.lastName].filter(Boolean).join(' '), billNumber: j.invoices.map(i => i.invoiceNumber).join(', '), billAmount: sumMoney(j.invoices.map(i => i.total)) })), totals: { billAmount: sumMoney(expenses.map(r => r.amount as number)) }, pageBreak: true });
    if (input.demands === 'true')
        sections.push({ title: 'Customer requests', rows: jobs.flatMap(j => j.complaints.map(c => ({ jobNumber: j.jobNumber, description: c.description, defectCode: c.defectCode }))), pageBreak: true });
    const lines: ReportRow[] = jobs.flatMap(j => j.lines.flatMap(l => {
        const quantity = l.partIssuance ? netIssued(l.partIssuance.quantity, l.partIssuance.returns) : l.quantity;
        if (quantity <= 0)
            return [];
        return [{ jobNumber: j.jobNumber, date: dateKey(j.createdAt), kind: l.kind, itemCode: l.sparePart?.partNumber ?? l.operationCode ?? l.jobCardLabour?.labourItem.code ?? '', description: l.description, quantity, rate: l.rate, amount: money(new Prisma.Decimal(quantity).times(l.rate).toNumber()), chargeType: l.chargeType, caseNumber: l.warrantyCaseLines.map(c => c.case.caseNumber).join(', ') }];
    }));
    if (input.parts === 'true')
        sections.push({ title: 'Parts and oil', rows: lines.filter(l => l.kind === 'PART'), totals: totals(lines.filter(l => l.kind === 'PART'), ['amount']), pageBreak: true });
    if (input.labour === 'true') {
        const labour = lines.filter(l => l.kind === 'LABOUR');
        const charges = jobs.filter(j => j.serviceCharge != null).map(j => ({ jobNumber: j.jobNumber, description: 'Service charge', amount: j.serviceCharge! }));
        sections.push({ title: 'Labour and service charges', rows: [...labour, ...charges], totals: totals([...labour, ...charges], ['amount']), pageBreak: true });
    }
    sections.push({ title: 'Expenses by service type', rows: groups(expenses, 'serviceType', ['amount']).map(g => ({ serviceType: g.title, ...g.totals })), totals: totals(expenses, ['amount']), pageBreak: true });
    const nonCustomer = lines.filter(l => l.chargeType !== 'CUSTOMER');
    sections.push({ title: 'Warranty, FOC and goodwill', rows: nonCustomer, totals: totals(nonCustomer, ['amount']) });
    const readings = jobs.map(j => j.mileage).filter((n): n is number => n != null);
    const distance = readings.length > 1 ? Math.max(...readings) - Math.min(...readings) : 0;
    const total = sumMoney(expenses.map(r => r.amount as number));
    sections.push({ title: 'Repair cost per km', rows: [{ totalExpenses: total, recordedDistanceKm: distance, averageCostPerKm: distance > 0 ? money(new Prisma.Decimal(total).div(distance).toNumber()) : null }] });
    sections.push({ title: 'Repeat jobs', rows: jobs.filter(j => j.isRepeat).map(j => ({ ...identity(j), previousJob: j.previousJobId, reason: j.repeatReason })) });
    return { rows: [], groups: sections, totals: { visits: jobs.length, billAmount: total }, filters: input, warnings: ['Legacy SQL parity pending: vehicle_history_card.sql unavailable. Free-service sequence is not recorded; it is left blank.'] };
}
