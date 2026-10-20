import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { requireMaster } from './workshop-master.service';
import { CreateChecklistLine, CreateChecklistMileage } from './service-checklist.validation';

const master = {
  select: {
    id: true,
    code: true,
    description: true,
  },
};

const lineInclude = {
  variant: master,

  sparePart: {
    select: {
      id: true,
      partNumber: true,
      name: true,
      partType: true,
      unitPrice: true,
      retailRate: true,
    },
  },

  labourItem: {
    select: {
      id: true,
      code: true,
      description: true,
    },
  },
} satisfies Prisma.ServiceChecklistLineInclude;

type Line = Prisma.ServiceChecklistLineGetPayload<{ include: typeof lineInclude }>;

const cents = (value: number) => Math.round(value * 100);

// Legacy Estimated Part / Oil / Labour Amount: parts at their current retail rate, oils
// (part type O) apart from spares, labour at the amount on the line.
export function checklistTotals(lines: Line[]) {
  let part = 0;
  let oil = 0;
  let labour = 0;

  for (const line of lines) {
    if (line.kind === 'LABOUR')
      labour += cents(line.amount);
    else if (line.sparePart) {
      const value = cents(line.quantity * (line.sparePart.retailRate ?? line.sparePart.unitPrice));
      if (line.sparePart.partType === 'O')
        oil += value;
      else
        part += value;
    }
  }

  return {
    part: part / 100,
    oil: oil / 100,
    labour: labour / 100,
    total: (part + oil + labour) / 100,
  };
}

// A specific variant follows its own lines plus the lines for all variants.
const variantWhere = (variantId?: string | null) => variantId ? {
  OR: [{
    variantId,
  }, {
    variantId: null,
  }],
} : {
  variantId: null,
};

function duplicate(message: string) {
  return (error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictError(message);
    throw error;
  };
}

export class ServiceChecklistService {
  private async validateTarget(checklistId: string, modelId: string, variantId?: string | null) {
    await requireMaster(prisma, checklistId, 'CHECKLIST');
    await requireMaster(prisma, modelId, 'MODEL');

    if (variantId) {
      const variant = await requireMaster(prisma, variantId, 'VARIANT');
      if (variant.parentId !== modelId)
        throw new BadRequestError('The variant does not belong to the model');
    }
  }

  async listLines(checklistId: string, modelId: string, variantId?: string) {
    const lines = await prisma.serviceChecklistLine.findMany({
      where: {
        checklistId,
        modelId,
        ...variantWhere(variantId),
      },

      include: lineInclude,

      orderBy: [{
        kind: 'desc',
      }, {
        createdAt: 'asc',
      }],
    });

    return {
      items: lines,
      totals: checklistTotals(lines),
    };
  }

  async createLine(data: CreateChecklistLine) {
    await this.validateTarget(data.checklistId, data.modelId, data.variantId);

    if (data.kind === 'PART') {
      const part = await prisma.sparePart.findUnique({
        where: {
          id: data.sparePartId,
        },
      });

      if (!part || part.partStatus !== 'ACTIVE')
        throw new BadRequestError('Select an active part');
    } else {
      const labour = await prisma.labourItem.findFirst({
        where: {
          id: data.labourItemId,
          active: true,
        },
      });

      if (!labour)
        throw new BadRequestError('Select an active labour');
    }

    return prisma.serviceChecklistLine.create({
      data: {
        ...data,
        variantId: data.variantId ?? null,
      },

      include: lineInclude,
    }).catch(duplicate('This item is already on the checklist for that model and variant'));
  }

  async updateLine(id: string, data: { quantity?: number; amount?: number }) {
    const line = await prisma.serviceChecklistLine.findUnique({
      where: {
        id,
      },
    });

    if (!line)
      throw new NotFoundError('Checklist line not found');
    if (line.kind === 'PART' && data.amount !== undefined)
      throw new BadRequestError('Part lines are priced from the part rate; change the quantity');
    if (line.kind === 'LABOUR' && data.quantity !== undefined)
      throw new BadRequestError('Labour lines have an amount, not a quantity');

    return prisma.serviceChecklistLine.update({
      where: {
        id,
      },

      data,
      include: lineInclude,
    });
  }

  async removeLine(id: string) {
    const { count } = await prisma.serviceChecklistLine.deleteMany({
      where: {
        id,
      },
    });

    if (!count)
      throw new NotFoundError('Checklist line not found');
  }

  async listMileages(modelId: string, variantId?: string) {
    const rows = await prisma.serviceChecklistMileage.findMany({
      where: {
        modelId,
        ...variantWhere(variantId),
      },

      include: {
        checklist: master,
        variant: master,
      },

      orderBy: {
        mileage: 'asc',
      },
    });

    const lines = rows.length ? await prisma.serviceChecklistLine.findMany({
      where: {
        modelId,
        checklistId: {
          in: [...new Set(rows.map(row => row.checklistId))],
        },
        ...variantWhere(variantId),
      },

      include: lineInclude,
    }) : [];

    return rows.map(row => ({
      ...row,
      totals: checklistTotals(lines.filter(line => line.checklistId === row.checklistId)),
    }));
  }

  async createMileage(data: CreateChecklistMileage) {
    await this.validateTarget(data.checklistId, data.modelId, data.variantId);

    return prisma.serviceChecklistMileage.create({
      data: {
        ...data,
        variantId: data.variantId ?? null,
      },

      include: {
        checklist: master,
        variant: master,
      },
    }).catch(duplicate('A checklist is already set at this mileage for that model and variant'));
  }

  async removeMileage(id: string) {
    const { count } = await prisma.serviceChecklistMileage.deleteMany({
      where: {
        id,
      },
    });

    if (!count)
      throw new NotFoundError('Mileage checklist not found');
  }
}
