import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ReportInput } from './report.validation';
import { dateBounds } from './report.logic';
import { BadRequestError } from '../../shared/errors/appError';
export const inactiveStatuses = ['Cancelled', 'CANCELLED', 'Canceled', 'CANCELED', 'VOID', 'Void', 'cancelled', 'canceled', 'void'];
export const activeInvoice = { cancelledAt: null, status: { notIn: inactiveStatuses } } satisfies Prisma.InvoiceWhereInput;
export function jobScope(input: ReportInput): Prisma.JobCardWhereInput {
    return { branchId: input.branchId, status: { notIn: inactiveStatuses }, ...(input.includePdi === 'true' ? {} : { AND: [{ OR: [{ serviceTypeId: null }, { serviceType: { preDelivery: false } }] }, { OR: [{ serviceTypeId: null }, { serviceType: { code: { notIn: ['PDI', 'pdi'] } } }] }] }) };
}
export const vehicleInclude = { customer: true, vehicleModel: true, catalogModel: true, catalogue: { include: { parent: { include: { parent: true } } } }, colour: true } satisfies Prisma.VehicleInclude;
export const jobInclude = {
    vehicle: { include: vehicleInclude }, customer: true, serviceType: true, service: true, team: true, engineer: { select: { firstName: true, lastName: true } }, serviceAdvisor: { select: { firstName: true, lastName: true } }, deliveryAdvisor: { select: { firstName: true, lastName: true } },
    invoices: { where: activeInvoice, include: { lines: true } }, complaints: true,
    lines: { include: { sparePart: true, partIssuance: { include: { returns: true } }, jobCardLabour: { include: { labourItem: true } }, warrantyCaseLines: { include: { case: { include: { statusHistory: true } } } } } },
} satisfies Prisma.JobCardInclude;
export type ReportJob = Prisma.JobCardGetPayload<{
    include: typeof jobInclude;
}>;
export class ReportRepository {
    async jobs(input: ReportInput, field: 'createdAt' | 'deliveredAt' = 'createdAt', extra: Prisma.JobCardWhereInput = {}) {
        const rows = await prisma.jobCard.findMany({ where: { ...jobScope(input), ...extra, ...(input.vehicleId ? { vehicleId: String(input.vehicleId) } : {}), ...(input.from && input.to ? { [field]: dateBounds(input.from, input.to) } : {}) }, include: jobInclude, orderBy: { createdAt: 'desc' }, take: 10001 });
        if (rows.length > 10000)
            throw new BadRequestError('More than 10,000 jobs match. Narrow the report filters.');
        return rows;
    }
    async vehicles(input: ReportInput) {
        const contains = (v: unknown) => v ? { contains: String(v), mode: 'insensitive' as const } : undefined;
        return prisma.vehicle.findMany({ where: { ...(input.vehicleId ? { id: String(input.vehicleId) } : {}), AND: [
                    { OR: [{ jobCards: { some: jobScope(input) } }, ...(input.branchId ? [{ customer: { branchId: input.branchId } }] : [])] },
                    ...(input.customerName ? [{ customer: { AND: String(input.customerName).split(/\s+/).filter(Boolean).map(term => ({ OR: [{ companyName: contains(term) }, { firstName: contains(term) }, { lastName: contains(term) }] })) } }] : []),
                    ...(input.registration ? [{ registrationNumber: contains(input.registration) }] : []), ...(input.vin ? [{ vin: contains(input.vin) }] : []),
                    ...(input.product ? [{ OR: [{ make: contains(input.product) }, { customMake: contains(input.product) }] }] : []),
                    ...(input.model ? [{ OR: [{ model: contains(input.model) }, { customModel: contains(input.model) }, { catalogModel: { name: contains(input.model) } }, { catalogue: { parent: { description: contains(input.model) } } }] }] : []),
                    ...(input.variant ? [{ OR: [{ trim: contains(input.variant) }, { catalogue: { description: contains(input.variant) } }] }] : []),
                ] }, include: { ...vehicleInclude, _count: { select: { jobCards: { where: jobScope(input) } } }, ownerships: { include: { customer: true } }, jobCards: { where: jobScope(input), include: jobInclude, orderBy: { createdAt: 'desc' }, ...(input.vehicleId ? {} : { take: 0 }) } }, orderBy: { vin: 'asc' }, take: input.vehicleId ? 1 : 101 });
    }
}
