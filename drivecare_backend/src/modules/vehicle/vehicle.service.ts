import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { VehicleRepository } from './vehicle.repository';
import { NotFoundError, ConflictError } from '../../shared/errors/appError';

export class VehicleService {
  private vehicleRepository: VehicleRepository;

  constructor() {
    this.vehicleRepository = new VehicleRepository();
  }

  async listVehicles(params: { page: number; limit: number; search?: string; branchId?: string }) {
    const skip = (params.page - 1) * params.limit;
    const { vehicles, total } = await this.vehicleRepository.listVehicles({
      skip,
      take: params.limit,
      search: params.search,
      branchId: params.branchId,
    });

    return {
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        trim: vehicle.trim,
        color: vehicle.color,
        warrantyProvider: vehicle.warrantyProvider,
        warrantyStatus: vehicle.warrantyStatus,
        warrantyExpiresAt: vehicle.warrantyExpiresAt,
        ownershipStatus: vehicle.ownershipStatus,
        customer: {
          id: vehicle.customer.id,
          email: vehicle.customer.email,
          firstName: vehicle.customer.firstName,
          lastName: vehicle.customer.lastName,
        },
        imagesCount: vehicle.images.length,
        ownershipsCount: vehicle.ownerships.length,
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt,
      })),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getVehicle(id: string) {
    const vehicle = await this.vehicleRepository.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return {
      id: vehicle.id,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      trim: vehicle.trim,
      color: vehicle.color,
      warrantyProvider: vehicle.warrantyProvider,
      warrantyStatus: vehicle.warrantyStatus,
      warrantyExpiresAt: vehicle.warrantyExpiresAt,
      ownershipStatus: vehicle.ownershipStatus,
      customer: {
        id: vehicle.customer.id,
        email: vehicle.customer.email,
        firstName: vehicle.customer.firstName,
        lastName: vehicle.customer.lastName,
      },
      images: vehicle.images,
      ownerships: vehicle.ownerships,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
    };
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
    warrantyExpiresAt?: string;
    ownershipStatus?: string;
  }) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const existingVehicle = await prisma.vehicle.findUnique({ where: { vin: data.vin } });
    if (existingVehicle) {
      throw new ConflictError('A vehicle with this VIN already exists');
    }

    return this.vehicleRepository.createVehicle({
      customerId: data.customerId,
      vin: data.vin,
      make: data.make,
      model: data.model,
      year: data.year,
      trim: data.trim,
      color: data.color,
      warrantyProvider: data.warrantyProvider,
      warrantyStatus: data.warrantyStatus,
      warrantyExpiresAt: data.warrantyExpiresAt ? new Date(data.warrantyExpiresAt) : undefined,
      ownershipStatus: data.ownershipStatus,
    });
  }

  async updateVehicle(id: string, data: {
    make?: string;
    model?: string;
    year?: number;
    trim?: string;
    color?: string;
    warrantyProvider?: string;
    warrantyStatus?: string;
    warrantyExpiresAt?: string;
    ownershipStatus?: string;
  }) {
    const vehicle = await this.vehicleRepository.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return this.vehicleRepository.updateVehicle(id, {
      make: data.make,
      model: data.model,
      year: data.year,
      trim: data.trim,
      color: data.color,
      warrantyProvider: data.warrantyProvider,
      warrantyStatus: data.warrantyStatus,
      warrantyExpiresAt: data.warrantyExpiresAt ? new Date(data.warrantyExpiresAt) : undefined,
      ownershipStatus: data.ownershipStatus,
    });
  }

  async deleteVehicle(id: string) {
    const vehicle = await this.vehicleRepository.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    await this.vehicleRepository.deleteVehicle(id);
  }

  async addVehicleImage(vehicleId: string, data: { url: string; type?: string; metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput }) {
    const vehicle = await this.vehicleRepository.findVehicleById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return this.vehicleRepository.addImage({
      vehicleId,
      url: data.url,
      type: data.type,
      metadata: data.metadata,
    });
  }

  async getVehicleImages(vehicleId: string) {
    const vehicle = await this.vehicleRepository.findVehicleById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return this.vehicleRepository.listImages(vehicleId);
  }

  async addVehicleOwnership(vehicleId: string, data: { customerId: string; ownershipType?: string; purchaseDate: string; saleDate?: string; status?: string }) {
    const vehicle = await this.vehicleRepository.findVehicleById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return this.vehicleRepository.addOwnership({
      vehicleId,
      customerId: data.customerId,
      ownershipType: data.ownershipType,
      purchaseDate: new Date(data.purchaseDate),
      saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
      status: data.status,
    });
  }

  async getVehicleOwnerships(vehicleId: string) {
    const vehicle = await this.vehicleRepository.findVehicleById(vehicleId);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return this.vehicleRepository.listOwnerships(vehicleId);
  }
}
