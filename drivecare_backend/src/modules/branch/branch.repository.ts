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
      },
    });
  }

  async findBranchByName(name: string): Promise<Branch | null> {
    return prisma.branch.findUnique({ where: { name } });
  }

  async createBranch(data: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    phoneNumber?: string;
    email?: string;
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
  }>): Promise<Branch> {
    return prisma.branch.update({ where: { id }, data });
  }

  async deleteBranch(id: string): Promise<Branch> {
    return prisma.branch.delete({ where: { id } });
  }
}
