import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ReportRepository, jobScope, jobInclude, inactiveStatuses } from './report.repository';
import { ReportInput } from './report.validation';
import { ReportResult, ReportRow } from './report.types';
import { categoryOf, compareEstimate, dateBounds, dateKey, daysLate, groups, netIssued, totals, allocateUnbilled, availedJob, bookingSummary, actualLineAmount } from './report.logic';
import { customerName, identity, modelName } from './delivery-warranty.report';
import { money } from '../finance/money';
export async function unbilledParts(input: ReportInput): Promise<ReportResult> {
    const bounds = dateBounds(input.from!, input.to!);
    const jobs = await new ReportRepository().jobs({ ...input, from: undefined, to: undefined }, 'createdAt', { lines: { some: { kind: 'PART', OR: [{ partIssuance: { issuedAt: bounds } }, { partIssuanceId: null, createdAt: bounds }] } } });
    const rows: ReportRow[] = [];
    for (const j of jobs) {
        const allocations = new Map(allocateUnbilled(j.lines.filter(l => l.kind === 'PART'), j.invoices).map(a => [a.lineId, a]));
        for (const l of j.lines) {
            if (l.kind !== 'PART') continue;
            const { issued, returned, billed: allocated, netQty: quantity } = allocations.get(l.id)!;
            const date = l.partIssuance?.issuedAt ?? l.createdAt, category = categoryOf(l.sparePart);
            if (quantity <= 0 || date < bounds.gte || date >= bounds.lt || input.chargeType !== 'ALL' && l.chargeType !== input.chargeType)
                continue;
            if (input.category === 'OIL' && category !== 'OIL' || input.category === 'SPARES' && !['SPARES', 'ACCESSORIES'].includes(category))
                continue;
            rows.push({ ...identity(j), jobStatus: j.status, issueDate: dateKey(date), partNumber: l.sparePart?.partNumber ?? '', description: l.description, category, chargeType: l.chargeType, quantityIssued: issued, quantityReturned: returned, quantityBilled: allocated, netQty: quantity, rate: l.rate, amount: money(new Prisma.Decimal(quantity).times(l.rate).toNumber()), daysSinceIssue: daysLate(date, new Date()) });
        }
    }
    const summary = [...groups(rows, 'jobNumber', ['amount', 'netQty']), ...groups(rows, 'chargeType', ['amount', 'netQty'])].map(g => ({ ...g, rows: [], totals: { ...g.totals, lineCount: g.rows.length } }));
    return { rows: input.view === 'SUMMARY' ? [] : rows, groups: input.view === 'DETAIL' ? [] : summary, totals: { ...totals(rows, ['amount', 'netQty']), lineCount: rows.length }, filters: input };
}
export async function bookedVsAvailed(input: ReportInput): Promise<ReportResult> {
    const bounds = dateBounds(input.from!, input.to!);
    const extended = { gte: bounds.gte, lt: new Date(bounds.lt.getTime() + Number(input.graceDays) * 86400000) };
    const [bookings, jobs] = await Promise.all([prisma.serviceAppointment.findMany({ where: { branchId: input.branchId, scheduledAt: bounds, status: { notIn: inactiveStatuses, mode: 'insensitive' } }, include: { vehicle: { include: { catalogModel: true } }, customer: true, service: true, serviceType: true }, orderBy: { scheduledAt: 'asc' } }), prisma.jobCard.findMany({ where: { ...jobScope(input), createdAt: extended }, include: jobInclude, orderBy: { createdAt: 'asc' } })]);
    const rows: ReportRow[] = bookings.filter(b => !b.serviceType?.preDelivery && b.serviceType?.code.toUpperCase() !== 'PDI').map(b => {
        const job = availedJob(b, jobs, Number(input.graceDays));
        return { section: job ? 'Booked and availed' : 'Booked but not availed', bookingNumber: b.id, bookedFor: dateKey(b.scheduledAt), registration: b.vehicle.registrationNumber, customer: customerName(b.customer), phone: b.customer?.phoneNumber ?? '', serviceType: b.serviceType?.description ?? b.service?.name ?? 'Not recorded', jobNumber: job?.jobNumber ?? null, jobDate: job ? dateKey(job.createdAt) : null, daysLate: job ? daysLate(b.scheduledAt, job.createdAt) : null };
    });
    const walks = jobs.filter(j => !j.appointmentId && j.createdAt < bounds.lt).map(j => ({ ...identity(j), section: 'Walk-ins', bookingNumber: null, bookedFor: null, phone: j.customer?.phoneNumber ?? null, daysLate: null }));
    const all = [...rows, ...walks];
    return { rows: [], groups: [...groups(all, 'section', []), { title: 'Summary by service type', rows: groups(all, 'serviceType', []).map(g => ({ serviceType: g.title, ...bookingSummary(g.rows) })) }], totals: bookingSummary(all), filters: input };
}
export async function estimateVsJob(input: ReportInput): Promise<ReportResult> {
    const bounds = dateBounds(input.from!, input.to!);
    const scope = jobScope(input);
    const estimates = await prisma.estimate.findMany({ where: { status: { notIn: inactiveStatuses, mode: 'insensitive' }, AND: [{ OR: [{ jobCard: { is: scope } }, { jobCardId: null, branchId: input.branchId }] }, input.basedOn === 'JOB' ? { jobCard: { is: { ...scope, createdAt: bounds } } } : { OR: [{ estimateDate: bounds }, { estimateDate: null, createdAt: bounds }] }] }, include: { jobCard: { include: jobInclude }, lines: true, vehicle: true, customer: true }, orderBy: { createdAt: 'asc' } });
    const refs = [...new Set(estimates.flatMap(e => e.lines.flatMap(l => l.referenceId ? [l.referenceId] : [])))];
    const [parts, operations] = refs.length ? await Promise.all([prisma.sparePart.findMany({ where: { id: { in: refs } }, select: { id: true, partNumber: true } }), prisma.labourItem.findMany({ where: { id: { in: refs } }, select: { id: true, code: true } })]) : [[], []];
    const codes = new Map([...parts.map(p => [p.id, p.partNumber] as const), ...operations.map(p => [p.id, p.code] as const)]);
    const rows: ReportRow[] = [];
    for (const e of estimates) {
        const j = e.jobCard;
        if (!j && (input.basedOn !== 'ESTIMATE' || input.variation !== 'SHORTAGE'))
            continue;
        const expected = e.lines.filter(l => ['PART', 'LABOUR', 'INCLUDED_PART', 'INCLUDED_LABOUR'].includes(l.type)).map(l => { const type = l.type.replace('INCLUDED_', ''); const match = j?.lines.find(a => type === a.kind && (type === 'PART' ? a.sparePartId === l.referenceId : a.jobCardLabour?.labourItemId === l.referenceId || a.operationCode === l.referenceId)); return { key: type + ':' + (type === 'LABOUR' ? codes.get(l.referenceId ?? '') ?? match?.jobCardLabour?.labourItem.code ?? match?.operationCode ?? l.referenceId ?? l.description : l.referenceId ?? l.description), type, code: codes.get(l.referenceId ?? '') ?? match?.sparePart?.partNumber ?? match?.jobCardLabour?.labourItem.code ?? match?.operationCode ?? '', description: l.description, quantity: l.quantity, amount: l.amount }; });
        const actual = (j?.lines ?? []).map(l => { const qty = l.partIssuance ? netIssued(l.partIssuance.quantity, l.partIssuance.returns) : l.quantity; const ref = l.kind === 'PART' ? l.sparePartId : l.jobCardLabour?.labourItem.code ?? codes.get(l.operationCode ?? '') ?? l.operationCode; return { key: l.kind + ':' + (ref ?? l.description), type: l.kind, code: l.sparePart?.partNumber ?? l.jobCardLabour?.labourItem.code ?? l.operationCode ?? '', description: l.description, quantity: qty, amount: actualLineAmount(l) }; });
        const variations = compareEstimate(expected, actual, String(input.basedOn), String(input.variation));
        rows.push(...variations.map(l => ({ ...(j ? identity(j) : { jobNumber: null, jobDate: null, registration: e.vehicle?.registrationNumber ?? '', customer: customerName(e.customer), model: modelName(e.vehicle as Parameters<typeof modelName>[0]) }), estimateNumber: e.estimateNumber ?? e.id, estimateDate: dateKey(e.estimateDate ?? e.createdAt), ...l })));
    }
    const keys = ['estimatedAmount', 'actualAmount', 'variationAmount'];
    return { rows, groups: groups(rows.map(r => ({ ...r, reportGroup: r.jobNumber ?? 'Estimate ' + r.estimateNumber })), 'reportGroup', keys).map(g => ({ ...g, rows: [] })), totals: totals(rows, keys), filters: input };
}
