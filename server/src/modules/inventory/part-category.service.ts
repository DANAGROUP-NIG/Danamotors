import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors/appError';

const percent = z.number().min(0).max(100);

export const partCategoryBody = z.object({
  code: z.string().trim().toUpperCase().min(1).max(2),
  description: z.string().trim().min(1).max(100),
  // Legacy multiply: retail rate = dealer rate x multiplier.
  markupMultiplier: z.number().positive().max(1000),
  isActive: z.boolean().optional(),
}).strict();

export const createPartCategorySchema = z.object({
  body: partCategoryBody,
});

export const updatePartCategorySchema = z.object({
  params: z.object({
    code: z.string().trim().min(1).max(2),
  }),

  body: partCategoryBody.omit({
    code: true,
  }).partial().strict(),
});

export const partCategoryCodeSchema = z.object({
  params: z.object({
    code: z.string().trim().min(1).max(2),
  }),
});

export const partCategoryBranchSchema = z.object({
  params: z.object({
    code: z.string().trim().min(1).max(2),
    branchId: z.string().uuid(),
  }),

  body: z.object({
    discountPercent: percent,
    handlingPercent: percent,
    directCostPercent: percent,
    operationalCostPercent: percent,
  }).strict(),
});

type BranchPercents = z.infer<typeof partCategoryBranchSchema>['body'];

// Legacy Part Category Master: code, description and retail multiplier, plus each
// branch's discount, handling, direct cost and operational cost %.
export class PartCategoryService {
  async get(code: string) {
    const category = await prisma.partCategory.findUnique({
      where: {
        code,
      },

      include: {
        branchSettings: {
          include: {
            branch: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },

          orderBy: {
            branch: {
              name: 'asc',
            },
          },
        },
      },
    });

    if (!category)
      throw new NotFoundError('Part category not found');

    return category;
  }

  async create(data: z.infer<typeof partCategoryBody>) {
    try {
      return await prisma.partCategory.create({
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictError(`Part category ${data.code} already exists`);
      throw error;
    }
  }

  // Changing the multiplier does not reprice parts; a part's retail rate is set when its
  // dealer rate or category changes.
  async update(code: string, data: Partial<Omit<z.infer<typeof partCategoryBody>, 'code'>>) {
    await this.get(code);

    return prisma.partCategory.update({
      where: {
        code,
      },

      data,
    });
  }

  async saveBranch(code: string, branchId: string, percents: BranchPercents) {
    await this.get(code);
    const branch = await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

    if (!branch)
      throw new NotFoundError('Branch not found');

    return prisma.partCategoryBranchSetting.upsert({
      where: {
        categoryCode_branchId: {
          categoryCode: code,
          branchId,
        },
      },

      create: {
        categoryCode: code,
        branchId,
        ...percents,
      },

      update: percents,
    });
  }
}
