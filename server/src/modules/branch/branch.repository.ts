import prisma from '../../prisma/client';
import { Branch } from '@prisma/client';

export class BranchRepository {
  async listBranches(params: { skip: number; take: number; search?: string }) {
    const where: Record<string, any> = { isActive: true };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { city: { contains: params.search, mode: 'insensitive' } },
        { state: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [branches, total] = await Promise.all([
      prisma.branch.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: {
          _count: { select: { users: true } },
          parentBranch: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.branch.count({ where }),
    ]);

    return { branches, total };
  }

  async findBranchById(id: string) {
    return prisma.branch.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, jobCards: true, appointments: true } },
        parentBranch: { select: { id: true, name: true, code: true } },
        subLocations: { select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } },
      },
    });
  }

  async findBranchByName(name: string): Promise<Branch | null> {
    return prisma.branch.findUnique({ where: { name } });
  }

  async findBranchByCode(code: string): Promise<Branch | null> {
    return prisma.branch.findUnique({ where: { code } });
  }

  async countSubLocations(id: string): Promise<number> {
    return prisma.branch.count({ where: { parentBranchId: id } });
  }

  async createBranch(data: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    phoneNumber?: string;
    email?: string;
    code?: string;
    parentBranchId?: string;
  }): Promise<Branch> {
    return prisma.branch.create({ data });
  }

  async updateBranch(id: string, data: Partial<{
    name: string;
    address: string;
    city: string;
    state: string;
    country: string;
    phoneNumber: string;
    email: string;
    code: string | null;
    parentBranchId: string | null;
  }>): Promise<Branch> {
    return prisma.branch.update({ where: { id }, data });
  }

  async deleteBranch(id: string): Promise<{ id: string; name: string }> {
    const branch = await prisma.branch.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!branch) throw new Error('Branch not found');
    await prisma.branch.delete({ where: { id } });
    return branch;
  }
}
