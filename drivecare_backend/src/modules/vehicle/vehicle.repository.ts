import prisma from '../../prisma/client';
import { Prisma, Vehicle, VehicleImage, VehicleOwnership } from '@prisma/client';

export class VehicleRepository {
  async listVehicles(params: { skip: number; take: number; search?: string; branchId?: string }) {
    const where: Record<string, any> = {};

    if (params.search) {
      where.OR = [
        { vin: { contains: params.search, mode: 'insensitive' } },
        { make: { contains: params.search, mode: 'insensitive' } },
        { model: { contains: params.search, mode: 'insensitive' } },
        { color: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.branchId) {
      where.customer = {
        OR: [
          { jobCards: { some: { branchId: params.branchId } } },
          { appointments: { some: { branchId: params.branchId } } },
        ],
      };
    }

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: {
          customer: {
            select: {
              id: true,
              user: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          images: true,
          ownerships: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vehicle.count({ where }),
    ]);

    return { vehicles, total };
  }

  async findVehicleById(id: string) {
    return prisma.vehicle.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        images: true,
        ownerships: true,
      },
    });
  }

  async createVehicle(data: {
    customerId: string;
    vin: string;
    make?: string;
    model?: string;
    year?: number;
    trim?: string;
    color?: string;
    warrantyProvider?: string;
    warrantyStatus?: string;
    warrantyExpiresAt?: Date;
    ownershipStatus?: string;
  }): Promise<Vehicle> {
    return prisma.vehicle.create({
      data,
    });
  }

  async updateVehicle(id: string, data: Partial<Vehicle>): Promise<Vehicle> {
    return prisma.vehicle.update({
      where: { id },
      data,
    });
  }

  async deleteVehicle(id: string): Promise<void> {
    await prisma.vehicle.delete({ where: { id } });
  }

  async addImage(data: {
    vehicleId: string;
    url: string;
    type?: string;
    metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  }): Promise<VehicleImage> {
    return prisma.vehicleImage.create({
      data,
    });
  }

  async listImages(vehicleId: string): Promise<VehicleImage[]> {
    return prisma.vehicleImage.findMany({
      where: { vehicleId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async addOwnership(data: {
    vehicleId: string;
    customerId: string;
    ownershipType?: string;
    purchaseDate: Date;
    saleDate?: Date;
    status?: string;
  }): Promise<VehicleOwnership> {
    return prisma.vehicleOwnership.create({
      data,
    });
  }

  async listOwnerships(vehicleId: string): Promise<VehicleOwnership[]> {
    return prisma.vehicleOwnership.findMany({
      where: { vehicleId },
      orderBy: { purchaseDate: 'desc' },
    });
  }
}
