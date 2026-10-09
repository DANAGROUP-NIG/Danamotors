import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { masterBody, listMasterSchema } from './workshop-master.validation';
type MasterInput = z.infer<typeof masterBody>;

const parents: Record<string, string> = {
  PRODUCT: 'MAKE',
  MODEL: 'PRODUCT',
  VARIANT: 'MODEL',
  COLOUR: 'MODEL',
};

export async function requireMaster(tx: Prisma.TransactionClient, id: string, kind: string) {
  const master = await tx.workshopMaster.findFirst({
    where: {
      id,
      kind,
      active: true,
    },
  });

  if (!master)
    throw new BadRequestError(`Select an active ${kind.toLowerCase().replace('_', ' ')}`);

  return master;
}

export class WorkshopMasterService {
  async list(query: z.infer<typeof listMasterSchema>['query']) {
    const where: Prisma.WorkshopMasterWhereInput = {
      kind: query.kind,
      parentId: query.parentId,

      ...(query.includeInactive === 'true' ? {} : {
        active: true,
      }),

      ...(query.search ? {
        OR: ['code', 'description'].map(key => ({
          [key]: {
            contains: query.search,
            mode: 'insensitive',
          },
        })),
      } : {}),
    };

    const [items, total] = await Promise.all([prisma.workshopMaster.findMany({
      where,

      orderBy: [{
        kind: 'asc',
      }, {
        code: 'asc',
      }],

      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }), prisma.workshopMaster.count({
      where,
    })]);

    return {
      items,

      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private async validateParent(data: MasterInput) {
    if (parents[data.kind]) {
      if (!data.parentId)
        throw new BadRequestError(`${data.kind} requires a ${parents[data.kind]}`);

      await requireMaster(prisma, data.parentId, parents[data.kind]);
    } else if (data.parentId)
      throw new BadRequestError('This master cannot have a parent');
  }

  async create(data: MasterInput) {
    if (data.kind !== 'SERVICE_TYPE' && (data.displayOrder !== undefined || data.preDelivery !== undefined))
      throw new BadRequestError('Display order and pre-delivery apply only to service types');
    await this.validateParent(data);

    return prisma.workshopMaster.create({
      data,
    });
  }

  async update(id: string, data: Partial<Omit<MasterInput, 'kind'>>) {
    const existing = await prisma.workshopMaster.findUnique({
      where: {
        id,
      },
    });

    if (!existing)
      throw new NotFoundError('Master not found');
    if (existing.kind !== 'SERVICE_TYPE' && (data.displayOrder !== undefined || data.preDelivery !== undefined))
      throw new BadRequestError('Display order and pre-delivery apply only to service types');

    // Reparenting would silently change the meaning of existing vehicles and rates.
    if (data.parentId !== undefined && data.parentId !== existing.parentId)
      throw new BadRequestError('Create a new catalogue entry to change its parent');

    return prisma.workshopMaster.update({
      where: {
        id,
      },

      data,
    });
  }
}
