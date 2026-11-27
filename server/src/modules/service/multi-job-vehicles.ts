import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { isGeneralDepartmentManager } from '../../middleware/authorize';
import { ForbiddenError } from '../../shared/errors/appError';
import type { Request } from 'express';

const dayMs = 86_400_000;
const closedStatuses = ['DELIVERED', 'Delivered', 'CLOSED', 'Closed'];
const excludedOpenStatuses = ['BILLED', 'Billed', ...closedStatuses, 'CANCELLED', 'Cancelled', 'CANCELED', 'Canceled'];
const customerNameSelect = { firstName: true, lastName: true, companyName: true } as const;

export const multiJobVehiclesQuery = z.object({
  branchId: z.string().uuid().optional(),
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  closedFrom: z.string().date().optional(),
  closedTo: z.string().date().optional(),
}).strict().superRefine(({ closedFrom, closedTo }, context) => {
  if (!closedFrom && !closedTo) return;
  if (!closedFrom || !closedTo || closedFrom > closedTo ||
    Date.parse(closedTo) - Date.parse(closedFrom) >= 366 * dayMs) {
    context.addIssue({ code: 'custom', path: ['closedTo'], message: 'Enter a closed date range of up to 366 days with the end on or after the start' });
  }
});

type Query = z.infer<typeof multiJobVehiclesQuery>;

export function multiJobBranch(user: Request['user'], requested?: string) {
  if (isGeneralDepartmentManager(user)) return requested;
  if (!user?.branchId || (requested && requested !== user.branchId)) {
    throw new ForbiddenError('Choose a branch you can access');
  }
  return user.branchId;
}

export function multiJobVehicleWhere(query: Query, branchId?: string): Prisma.JobCardWhereInput {
  const open: Prisma.JobCardWhereInput = {
    billedAt: null,
    deliveredAt: null,
    status: { notIn: excludedOpenStatuses },
  };
  const where: Prisma.JobCardWhereInput = { branchId, vehicleId: { not: null } };
  if (query.closedFrom && query.closedTo) {
    const start = new Date(`${query.closedFrom}T00:00:00+01:00`);
    const end = new Date(Date.parse(`${query.closedTo}T00:00:00+01:00`) + dayMs);
    return { ...where, OR: [open, { status: { in: closedStatuses }, deliveredAt: { gte: start, lt: end } }] };
  }
  return { ...where, ...open };
}

export async function listMultiJobVehicles(query: Query, branchId?: string) {
  const where = multiJobVehicleWhere(query, branchId);
  return prisma.$transaction(async (tx) => {
    const groups = await tx.jobCard.groupBy({
      by: ['vehicleId'],
      where: query.after ? { ...where, vehicleId: { gt: query.after } } : where,
      having: { vehicleId: { _count: { gt: 1 } } },
      orderBy: { vehicleId: 'asc' },
      take: query.limit + 1,
    });
    const ids = groups.slice(0, query.limit).flatMap(group => group.vehicleId ? [group.vehicleId] : []);
    if (ids.length === 0) return { vehicles: [], nextCursor: null };

    const cards = await tx.jobCard.findMany({
      where: { ...where, vehicleId: { in: ids } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, vehicleId: true, jobNumber: true, createdAt: true, status: true,
        branch: { select: { name: true } },
        vehicle: { select: { id: true, registrationNumber: true, vin: true } },
        customer: { select: customerNameSelect },
        appointment: { select: { customer: { select: customerNameSelect } } },
        service: { select: { name: true } },
        serviceType: { select: { description: true, chargedTo: true } },
      },
    });
    const charges = await tx.jobCardLine.groupBy({
      by: ['jobCardId', 'chargeType'],
      where: { jobCardId: { in: cards.map(card => card.id) } },
      orderBy: { chargeType: 'asc' },
    });
    const chargesByJob = new Map<string, string[]>();
    for (const charge of charges) {
      const payers = chargesByJob.get(charge.jobCardId) ?? [];
      payers.push(charge.chargeType);
      chargesByJob.set(charge.jobCardId, payers);
    }

    const vehicles = new Map<string, {
      id: string; registrationNumber: string | null; vin: string;
      jobs: Array<{ id: string; number: string; date: Date; customer: string | null; branch: string; serviceType: string | null; status: string; payers: string[] }>;
    }>();
    for (const card of cards) {
      if (!card.vehicle) continue;
      const vehicle = vehicles.get(card.vehicle.id) ?? { ...card.vehicle, jobs: [] };
      const assignedPayers = chargesByJob.get(card.id) ?? [];
      const servicePayer = card.serviceType?.chargedTo;
      // TODO(confirm): Insurance has no recorded payer field in the current job model.
      const payers = servicePayer === 'COMPANY'
        ? [...new Set(['COMPANY', ...assignedPayers.filter(payer => payer !== 'CUSTOMER')])]
        : assignedPayers.length > 0 ? assignedPayers : servicePayer === 'CUSTOMER' ? ['CUSTOMER'] : [];
      const customer = card.customer ?? card.appointment?.customer;
      const person = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
      vehicle.jobs.push({
        id: card.id, number: card.jobNumber, date: card.createdAt, status: card.status,
        customer: customer?.companyName?.trim() || person || null, branch: card.branch.name,
        serviceType: card.serviceType?.description ?? card.service?.name ?? null,
        payers,
      });
      vehicles.set(vehicle.id, vehicle);
    }
    return {
      vehicles: ids.flatMap(id => {
        const vehicle = vehicles.get(id);
        return vehicle ? [vehicle] : [];
      }),
      nextCursor: groups.length > query.limit ? ids.at(-1) ?? null : null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
