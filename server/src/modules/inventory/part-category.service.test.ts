jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  partCategory: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  branch: { findUnique: jest.fn() },
  partCategoryBranchSetting: { upsert: jest.fn() },
} }));
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { PartCategoryService, createPartCategorySchema, partCategoryBranchSchema } from './part-category.service';

const branchId = '00000000-0000-4000-8000-000000000001';
const service = new PartCategoryService();
const percents = { discountPercent: 50, handlingPercent: 9, directCostPercent: 1, operationalCostPercent: 1 };
beforeEach(() => jest.resetAllMocks());

it('upper-cases the code and needs a positive multiplier', () => {
  expect(createPartCategorySchema.parse({ body: { code: 'a', description: 'CO-OP PARTS', markupMultiplier: 2.07 } }).body.code).toBe('A');
  expect(createPartCategorySchema.safeParse({ body: { code: 'A', description: 'X', markupMultiplier: 0 } }).success).toBe(false);
});

it('keeps branch percentages between 0 and 100', () => {
  expect(partCategoryBranchSchema.safeParse({ params: { code: 'A', branchId }, body: { ...percents, discountPercent: 101 } }).success).toBe(false);
});

it('stores a branch percentage row per category and branch', async () => {
  (prisma.partCategory.findUnique as jest.Mock).mockResolvedValue({ code: 'A', branchSettings: [] });
  (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ id: branchId });
  await service.saveBranch('A', branchId, percents);
  expect(prisma.partCategoryBranchSetting.upsert).toHaveBeenCalledWith({
    where: { categoryCode_branchId: { categoryCode: 'A', branchId } },
    create: { categoryCode: 'A', branchId, ...percents },
    update: percents,
  });
});

it('reports a duplicate category code', async () => {
  (prisma.partCategory.create as jest.Mock).mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' }));
  await expect(service.create({ code: 'A', description: 'X', markupMultiplier: 1 })).rejects.toMatchObject({ statusCode: 409 });
});
