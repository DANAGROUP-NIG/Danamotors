import { z } from 'zod';
import prisma from '../../prisma/client';
import { jobScope } from './report.repository';

export const vehicleOptionsQuery = z.object({
    branchId: z.string().uuid().optional(),
    q: z.string().trim().max(100).default(''),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    selectedIds: z.string().max(4000).transform(s => s.split(',')).pipe(z.array(z.string().uuid()).max(100)).optional(),
}).strict();

export async function vehicleOptions(input: z.infer<typeof vehicleOptionsQuery>) {
    const scope = { OR: [{ jobCards: { some: jobScope({ branchId: input.branchId }) } }, ...(input.branchId ? [{ customer: { branchId: input.branchId } }] : [{}])] };
    const select = { id: true, vin: true, registrationNumber: true } as const;
    const [found, selected] = await Promise.all([
        prisma.vehicle.findMany({ where: { AND: [scope, { ...(input.cursor ? { id: { gt: input.cursor } } : {}), ...(input.q ? { OR: [{ vin: { contains: input.q, mode: 'insensitive' as const } }, { registrationNumber: { contains: input.q, mode: 'insensitive' as const } }] } : {}) }] }, select, orderBy: { id: 'asc' }, take: input.limit + 1 }),
        input.selectedIds?.length ? prisma.vehicle.findMany({ where: { AND: [scope, { id: { in: input.selectedIds } }] }, select }) : Promise.resolve([]),
    ]);
    const vehicles = found.slice(0, input.limit);
    return { vehicles, selected, nextCursor: found.length > input.limit ? vehicles[vehicles.length - 1].id : null };
}
