import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { FIXED_PARENT_KINDS, MASTER_PARENTS, MasterKind, parseAttributes } from './master-kinds';
import { masterBody, listMasterSchema } from './workshop-master.validation';
type MasterInput = z.infer<typeof masterBody>;

const parentSelect = {
  select: {
    id: true,
    kind: true,
    code: true,
    description: true,
  },
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
      include: {
        parent: parentSelect,
      },
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

  private async validateParent(kind: MasterKind, parentId: string | null | undefined) {
    const rule = MASTER_PARENTS[kind];

    if (rule) {
      if (!parentId) {
        if (rule.required)
          throw new BadRequestError(`${kind} requires a ${rule.kind}`);
        return;
      }

      await requireMaster(prisma, parentId, rule.kind);
    } else if (parentId)
      throw new BadRequestError('This master cannot have a parent');
  }

  async create(data: MasterInput) {
    if (data.kind !== 'SERVICE_TYPE' && (data.displayOrder !== undefined || data.preDelivery !== undefined))
      throw new BadRequestError('Display order and pre-delivery apply only to service types');
    await this.validateParent(data.kind, data.parentId);
    const { attributes, ...rest } = data;

    return prisma.workshopMaster.create({
      data: {
        ...rest,
        attributes: (parseAttributes(data.kind, attributes) ?? undefined) as Prisma.InputJsonValue | undefined,
      },

      include: {
        parent: parentSelect,
      },
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

    const kind = existing.kind as MasterKind;

    if (data.parentId !== undefined && data.parentId !== existing.parentId) {
      // Reparenting would silently change the meaning of existing vehicles and rates.
      if (FIXED_PARENT_KINDS.includes(kind))
        throw new BadRequestError('Create a new catalogue entry to change its parent');
      await this.validateParent(kind, data.parentId);
    }

    const { attributes, ...rest } = data;
    const merged = attributes === undefined ? undefined : attributes === null ? null : parseAttributes(kind, {
      ...(existing.attributes && typeof existing.attributes === 'object' ? existing.attributes as Record<string, unknown> : {}),
      ...attributes,
    });

    return prisma.workshopMaster.update({
      where: {
        id,
      },

      data: {
        ...rest,
        attributes: merged === null ? Prisma.DbNull : merged as Prisma.InputJsonValue | undefined,
      },

      include: {
        parent: parentSelect,
      },
    });
  }

  private async requireDefect(id: string) {
    const defect = await prisma.workshopMaster.findFirst({
      where: {
        id,
        kind: 'COMPLAINT',
      },
    });

    if (!defect)
      throw new NotFoundError('Defect not found');
  }

  async listEstimates(defectId: string) {
    await this.requireDefect(defectId);

    return prisma.defectModelEstimate.findMany({
      where: {
        defectId,
      },

      include: {
        model: parentSelect,
      },

      orderBy: {
        model: {
          code: 'asc',
        },
      },
    });
  }

  async saveEstimate(defectId: string, modelId: string, amounts: { partAmount: number; oilAmount: number; labourAmount: number }) {
    await this.requireDefect(defectId);
    await requireMaster(prisma, modelId, 'MODEL');

    return prisma.defectModelEstimate.upsert({
      where: {
        defectId_modelId: {
          defectId,
          modelId,
        },
      },

      create: {
        defectId,
        modelId,
        ...amounts,
      },

      update: amounts,

      include: {
        model: parentSelect,
      },
    });
  }

  async removeEstimate(defectId: string, modelId: string) {
    const { count } = await prisma.defectModelEstimate.deleteMany({
      where: {
        defectId,
        modelId,
      },
    });

    if (!count)
      throw new NotFoundError('Estimate not found');
  }
}
