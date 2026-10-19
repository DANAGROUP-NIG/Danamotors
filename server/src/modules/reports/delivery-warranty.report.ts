import { ReportRepository, ReportJob } from './report.repository';
import { ReportInput } from './report.validation';
import { ReportResult, ReportRow } from './report.types';
import { categoryOf, claimGenerated, dateKey, deliveryGrid, groups, netIssued, totals, dateBounds } from './report.logic';
import { coverageFor } from '../warranty/warranty.coverage';
import { money } from '../finance/money';
import { Prisma } from '@prisma/client';
export const customerName = (c: {
    firstName: string;
    lastName: string;
    companyName: string | null;
} | null | undefined) => c?.companyName || [c?.firstName, c?.lastName].filter(Boolean).join(' ');
export const modelName = (v: ReportJob['vehicle']) => v?.catalogModel?.name || v?.catalogue?.parent?.description || v?.customModel || v?.model || 'Not recorded';
export const serviceName = (j: ReportJob) => j.serviceType?.description || j.service?.name || 'Not recorded';
export const identity = (j: ReportJob): ReportRow => ({ jobNumber: j.jobNumber, jobDate: dateKey(j.createdAt), registration: j.vehicle?.registrationNumber ?? '', vin: j.vehicle?.vin ?? '', model: modelName(j.vehicle), customer: customerName(j.customer ?? j.vehicle?.customer), serviceType: serviceName(j) });
export function warrantyRow(j: ReportJob): ReportRow {
    const fallback = !j.warrantyStatusAtCreation && j.vehicle ? coverageFor(j.vehicle, j.mileage ?? null, j.createdAt) : null;
    // coverageFor's default vehicle mileage is inappropriate for an old job with no odometer.
    const coverage = !j.warrantyStatusAtCreation && j.vehicle && j.mileage == null ? coverageFor({ ...j.vehicle, lastRecordedMileage: null }, null, j.createdAt) : fallback;
    const status = j.warrantyStatusAtCreation ?? coverage?.status ?? 'UNKNOWN';
    return { ...identity(j), saleDate: j.vehicle?.saleDate ? dateKey(j.vehicle.saleDate) : null, mileage: j.mileage, expiryDate: j.warrantyStatusAtCreation ? (j.warrantyExpiresOnAtCreation ? dateKey(j.warrantyExpiresOnAtCreation) : null) : coverage?.expiresOn ?? null, kmLimit: j.warrantyStatusAtCreation ? j.warrantyKmLimitAtCreation : coverage?.kmLimit ?? null, warranty: status === 'ACTIVE' ? 'UNDER' : status === 'UNKNOWN' ? 'UNKNOWN' : 'BEYOND', reason: status, source: j.warrantyStatusAtCreation ? 'snapshot' : 'calculated' };
}
const selected = (input: ReportInput, key: string, value: string | null | undefined) => !input[key] || (input[key] as string[]).includes(value ?? '');
export async function delivered(input: ReportInput, byModel: boolean): Promise<ReportResult> {
    const jobs = await new ReportRepository().jobs(input, 'deliveredAt');
    const detail = jobs.filter(j => !byModel || selected(input, 'modelIds', j.vehicle?.catalogue?.parentId)).map(j => ({ ...identity(j), deliveryDate: dateKey(j.deliveredAt!), deliveredBy: [j.deliveryAdvisor?.firstName, j.deliveryAdvisor?.lastName].filter(Boolean).join(' ') }));
    const grid = deliveryGrid(detail, byModel ? 'model' : 'serviceType');
    return { ...grid, groups: input.detail === 'true' ? [{ title: 'Delivery details', rows: detail }] : [], filters: input };
}
export async function warrantyAttended(input: ReportInput): Promise<ReportResult> {
    const jobs = await new ReportRepository().jobs(input);
    let rows: ReportRow[] = jobs.map(j => ({ ...warrantyRow(j), ...(input.printAddress === 'true' ? { address: j.customer?.address ?? j.vehicle?.customer?.address ?? '', phone: j.customer?.phoneNumber ?? j.vehicle?.customer?.phoneNumber ?? '' } : {}) }));
    rows = rows.filter(r => input.warranty === 'BOTH' || r.warranty === input.warranty);
    const counts = (rows: ReportRow[]) => ({ under: rows.filter(r => r.warranty === 'UNDER').length, beyond: rows.filter(r => r.warranty === 'BEYOND').length, unknown: rows.filter(r => r.warranty === 'UNKNOWN').length, attended: rows.length });
    return { rows, groups: groups(rows, 'model', []).map(g => ({ ...g, rows: [], totals: counts(g.rows) })), totals: counts(rows), filters: input };
}
export async function warrantyParts(input: ReportInput): Promise<ReportResult> {
    const bounds = dateBounds(input.from!, input.to!);
    const jobs = await new ReportRepository().jobs({ ...input, from: undefined, to: undefined }, 'createdAt', { lines: { some: { kind: 'PART', chargeType: 'WARRANTY', OR: [{ partIssuance: { issuedAt: bounds } }, { partIssuanceId: null, createdAt: bounds }] } } });
    const rows: ReportRow[] = [];
    for (const j of jobs) {
        if (!selected(input, 'modelIds', j.vehicle?.catalogue?.parentId) || !selected(input, 'variantIds', j.vehicle?.catalogueId) || !selected(input, 'serviceTypeIds', j.serviceTypeId) || !selected(input, 'teamIds', j.teamId) || !selected(input, 'engineerIds', j.engineerId) || !selected(input, 'vehicleIds', j.vehicleId))
            continue;
        if (input.technicianIds && !j.lines.some(l => selected(input, 'technicianIds', l.jobCardLabour?.technicianId)))
            continue;
        if (input.billedOnly === 'true' && !j.invoices.length)
            continue;
        for (const l of j.lines) {
            const issuedAt = l.partIssuance?.issuedAt ?? l.createdAt;
            if (l.kind !== 'PART' || l.chargeType !== 'WARRANTY' || issuedAt < bounds.gte || issuedAt >= bounds.lt)
                continue;
            const category = categoryOf(l.sparePart);
            if (input.category !== 'ALL' && category !== input.category)
                continue;
            const generated = claimGenerated(l.warrantyCaseLines);
            if (input.claims === 'GENERATED' && !generated || input.claims === 'NOT_GENERATED' && generated)
                continue;
            const quantity = l.partIssuance ? netIssued(l.partIssuance.quantity, l.partIssuance.returns) : l.quantity;
            if (quantity <= 0)
                continue;
            rows.push({ ...identity(j), issueDate: dateKey(issuedAt), partNumber: l.sparePart?.partNumber ?? '', description: l.description, category, quantity, rate: l.rate, amount: money(new Prisma.Decimal(quantity).times(l.rate).toNumber()), caseNumber: l.warrantyCaseLines.map(c => c.case.caseNumber).join(', '), manufacturerClaim: l.warrantyCaseLines.map(c => c.case.manufacturerClaimNo ?? '').join(', '), claimStatus: l.warrantyCaseLines.map(c => c.case.status).join(', ') });
        }
    }
    rows.sort((a, b) => String(a.vin).localeCompare(String(b.vin)));
    return { rows, groups: groups(rows, 'vin', ['quantity', 'amount']).map(g => ({ ...g, rows: [] })), totals: totals(rows, ['quantity', 'amount']), filters: input };
}
