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

  /** A free service number only makes sense on a service type flagged as a free service. */
  private validateFreeServiceNo(kind: string, freeService: boolean, freeServiceNo: number | null | undefined) {
    if (freeServiceNo == null) return;
    if (kind !== 'SERVICE_TYPE' || !freeService)
      throw new BadRequestError('Only service types flagged as free service can have a free service number');
  }

  async create(data: MasterInput) {
    await this.validateParent(data);
    this.validateFreeServiceNo(data.kind, Boolean(data.freeService), data.freeServiceNo);

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

    // Reparenting would silently change the meaning of existing vehicles and rates.
    if (data.parentId !== undefined && data.parentId !== existing.parentId)
      throw new BadRequestError('Create a new catalogue entry to change its parent');

    const freeService = data.freeService ?? existing.freeService;
    this.validateFreeServiceNo(existing.kind, freeService, data.freeServiceNo === undefined ? existing.freeServiceNo : data.freeServiceNo);
    // Turning off "free service" clears the number with it.
    if (!freeService) data = { ...data, freeServiceNo: null };

    return prisma.workshopMaster.update({
      where: {
        id,
      },

      data,
    });
  }
}
