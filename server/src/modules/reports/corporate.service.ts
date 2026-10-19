import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
export class CorporateService {
    async list() { return prisma.corporateGroup.findMany({ include: { vehicles: { select: { id: true, vin: true, registrationNumber: true } } }, orderBy: { code: 'asc' } }); }
    async save(id: string | undefined, data: {
        code: string;
        name: string;
        active: boolean;
    }, actorId: string) {
        return prisma.$transaction(async (tx) => { const group = id ? await tx.corporateGroup.update({ where: { id }, data }) : await tx.corporateGroup.create({ data }); await tx.auditLog.create({ data: { userId: actorId, action: 'CORPORATE_GROUP_SAVED', details: JSON.stringify({ groupId: group.id, ...data }) } }); return group; });
    }
    async membership(id: string, data: {
        vins: string[];
        remove: boolean;
        allowMove: boolean;
    }, actorId: string) {
        return prisma.$transaction(async (tx) => {
            const group = await tx.corporateGroup.findUnique({ where: { id } });
            if (!group)
                throw new NotFoundError('Corporate group not found');
            const vins = [...new Set(data.vins.map(v => v.trim().toUpperCase()))];
            const vehicles = await tx.vehicle.findMany({ where: { OR: vins.map(v => ({ vin: { equals: v, mode: 'insensitive' as const } })) }, select: { id: true, vin: true, corporateGroupId: true } });
            const missing = vins.filter(v => !vehicles.some(r => r.vin.toUpperCase() === v));
            if (missing.length)
                throw new BadRequestError('No changes made. Unknown VINs: ' + missing.join(', '));
            if (!data.remove && !group.active)
                throw new BadRequestError('Activate the group before adding vehicles');
            const moving = vehicles.filter(v => v.corporateGroupId && v.corporateGroupId !== id);
            if (moving.length && !data.remove && !data.allowMove)
                throw new BadRequestError('No changes made. Vehicles already in another group: ' + moving.map(v => v.vin).join(', '));
            const result = await tx.vehicle.updateMany({ where: { id: { in: vehicles.map(v => v.id) }, ...(data.remove ? { corporateGroupId: id } : {}) }, data: { corporateGroupId: data.remove ? null : id } });
            await tx.auditLog.create({ data: { userId: actorId, action: 'CORPORATE_VEHICLES_CHANGED', details: JSON.stringify({ groupId: id, ...data, before: vehicles }) } });
            return { changed: result.count };
        }, { isolationLevel: 'Serializable' });
    }
}
