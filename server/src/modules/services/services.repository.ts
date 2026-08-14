import prisma from '../../prisma/client';
import { Service } from '@prisma/client';

export class ServicesRepository {
  async listServices(params: {
    skip: number;
    take: number;
    search?: string;
    category?: string;
    isActive?: boolean;
  }) {
    const where: Record<string, any> = {};

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }
    if (params.category) {
      where.category = params.category;
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { category: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: {
          _count: { select: { appointments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.service.count({ where }),
    ]);

    return { services, total };
  }

  async findServiceById(id: string) {
    return prisma.service.findUnique({
      where: { id },
      include: {
        _count: { select: { appointments: true } },
      },
    });
  }

  async findServiceByName(name: string): Promise<Service | null> {
    return prisma.service.findUnique({ where: { name } });
  }

  async createService(data: {
    name: string;
    description?: string;
    category?: string;
    durationMins?: number;
    price?: number;
    isActive?: boolean;
  }): Promise<Service> {
    return prisma.service.create({ data });
  }

  async updateService(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      category: string;
      durationMins: number;
      price: number;
      isActive: boolean;
    }>
  ): Promise<Service> {
    return prisma.service.update({ where: { id }, data });
  }

  async deleteService(id: string): Promise<{ id: string; name: string }> {
    const service = await prisma.service.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!service) throw new Error('Service not found');
    await prisma.service.delete({ where: { id } });
    return service;
  }
}
