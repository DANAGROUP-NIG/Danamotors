import { z } from 'zod';
import { vehicleBody } from './vehicle.validation';
import { resolveVehicleIdentity } from '../vehicle-catalog/vehicle-identity';
import { requireMaster } from '../workshop/workshop-master.service';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { VehicleRepository } from './vehicle.repository';
import { NotFoundError, BadRequestError } from '../../shared/errors/appError';
import { linkCampaignVehiclesByVin } from '../campaign/campaign.hooks';

export class VehicleService {
  private vehicleRepository: VehicleRepository;

  constructor() {
    this.vehicleRepository = new VehicleRepository();
  }

  async listVehicles(
    params: {
      page: number;
      limit: number;
      search?: string;
      branchId?: string;
      createdById?: string;
      customerId?: string;
    },
  ) {
    const skip = (params.page - 1) * params.limit;

    const {
      vehicles,
      total,
    } = await this.vehicleRepository.listVehicles({
      skip,
      take: params.limit,
      search: params.search,
      branchId: params.branchId,
      createdById: params.createdById,
      customerId: params.customerId,
    });

    return {
      vehicles: vehicles.map(vehicle => ({
        ...vehicle,
        id: vehicle.id,
        vin: vehicle.vin,
        registrationNumber: vehicle.registrationNumber,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        trim: vehicle.trim,
        color: vehicle.color,
        vehicleModelId: vehicle.vehicleModelId,
        lastRecordedMileage: vehicle.lastRecordedMileage,
        ownershipStatus: vehicle.ownershipStatus,

        customer: vehicle.customer ? {
          id: vehicle.customer.id,
          email: vehicle.customer.email,
          firstName: vehicle.customer.firstName,
          lastName: vehicle.customer.lastName,
        } : null,

        createdBy: (vehicle as any).createdBy ?? null,
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
      ...vehicle,
      id: vehicle.id,
      vin: vehicle.vin,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      trim: vehicle.trim,
      color: vehicle.color,
      vehicleModelId: vehicle.vehicleModelId,
      vehicleModel: vehicle.vehicleModel,
      lastRecordedMileage: vehicle.lastRecordedMileage,
      lastMileageAt: vehicle.lastMileageAt,
      warrantyOverrideType: vehicle.warrantyOverrideType,
      warrantyOverrideUntil: vehicle.warrantyOverrideUntil,
      warrantyOverrideKm: vehicle.warrantyOverrideKm,
      warrantyOverrideReason: vehicle.warrantyOverrideReason,
      ownershipStatus: vehicle.ownershipStatus,

      customer: vehicle.customer ? {
        id: vehicle.customer.id,
        email: vehicle.customer.email,
        firstName: vehicle.customer.firstName,
        lastName: vehicle.customer.lastName,
        phoneNumber: vehicle.customer.phoneNumber,
        branchId: vehicle.customer.branchId,
      } : null,

      images: vehicle.images,
      ownerships: vehicle.ownerships,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
    };
  }

  private async catalogue(tx: Prisma.TransactionClient, catalogueId: string, colourId: string) {
    const variant = await requireMaster(tx, catalogueId, 'VARIANT');
    const model = await requireMaster(tx, variant.parentId!, 'MODEL');
    const product = await requireMaster(tx, model.parentId!, 'PRODUCT');
    const make = await requireMaster(tx, product.parentId!, 'MAKE');
    const colour = await requireMaster(tx, colourId, 'COLOUR');

    if (colour.parentId !== model.id)
      throw new BadRequestError('Colour must belong to the selected model');

    return {
      catalogueId,
      colourId,
      make: make.description,
      model: model.description,
      trim: variant.description,
      color: colour.description,
    };
  }

  private async legacyIdentity(tx: Prisma.TransactionClient, catalogueId: string, colourId?: string | null) {
    if (!colourId) throw new BadRequestError('Select a catalogue colour');
    const legacy = await this.catalogue(tx, catalogueId, colourId);
    return { ...legacy, customMake: legacy.make, customModel: legacy.model };
  }

  async createVehicle(
    input: z.infer<typeof vehicleBody> & {
      createdById?: string;
    },
  ) {
    const {
      createdById,
      ...body
    } = input;

    const data = vehicleBody.parse(body);

    return prisma.$transaction(async tx => {
      if (data.customerId && !(await tx.customer.findFirst({
        where: {
          id: data.customerId,
          mergedIntoId: null,
        },
      })))
        throw new NotFoundError('Customer not found');

      if (data.pdiDone && !data.pdiDate)
        throw new BadRequestError('PDI date is required');

      if (!data.modelId && (data.generationId || data.engineId))
        throw new BadRequestError('Catalog generation and engine selections require a model');

      await this.assertWarrantyModel(tx, data.vehicleModelId);

      const identity = data.modelId || data.customModel || !data.catalogueId
        ? await resolveVehicleIdentity(tx, data)
        : await this.legacyIdentity(tx, data.catalogueId, data.colourId);

      const vehicle = await tx.vehicle.create({
        data: {
          ...data,
          ...identity,
          createdById,
          saleDate: data.saleDate ? new Date(data.saleDate) : null,
          pdiDate: data.pdiDate ? new Date(data.pdiDate) : null,
        },
      });

      if (data.customerId) await tx.vehicleOwnership.create({
        data: {
          vehicleId: vehicle.id,
          customerId: data.customerId,
          purchaseDate: data.saleDate ? new Date(data.saleDate) : new Date(),
          status: 'Current',
        },
      });

      // Campaign rows added by VIN before the vehicle was registered now point to it.
      await linkCampaignVehiclesByVin(tx, vehicle);

      return vehicle;
    });
  }

  async updateVehicle(id: string, input: Partial<Omit<z.infer<typeof vehicleBody>, 'vin' | 'customerId'>>) {
    const data = vehicleBody.omit({ vin: true, customerId: true }).partial().parse(input);
    return prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Vehicle" WHERE id = ${id} FOR UPDATE`);

      const vehicle = await tx.vehicle.findUnique({
        where: {
          id,
        },
      });

      if (!vehicle)
        throw new NotFoundError('Vehicle not found');

      const identityChanged = ['modelId', 'customModel', 'customMake', 'generationId', 'engineId'].some(key => Object.prototype.hasOwnProperty.call(data, key));
      let identity: Prisma.VehicleUncheckedUpdateInput = {};
      if (identityChanged) {
        if (data.modelId && data.customModel) throw new BadRequestError('Choose either a catalog model or a custom model');
        if (data.customModel && (data.generationId || data.engineId)) throw new BadRequestError('Custom vehicles cannot have catalog generation or engine selections');
        const modelChanged = data.modelId !== undefined && data.modelId !== vehicle.modelId;
        const customSelected = !!data.customModel;
        const generationChanged = data.generationId !== undefined && data.generationId !== vehicle.generationId;
        identity = await resolveVehicleIdentity(tx, {
          modelId: customSelected ? null : data.modelId === undefined ? vehicle.modelId : data.modelId,
          customModel: data.modelId ? null : data.customModel === undefined ? vehicle.customModel : data.customModel,
          customMake: data.customMake === undefined ? vehicle.customMake : data.customMake,
          generationId: customSelected ? null : data.generationId === undefined ? modelChanged ? null : vehicle.generationId : data.generationId,
          engineId: customSelected ? null : data.engineId === undefined ? modelChanged || generationChanged ? null : vehicle.engineId : data.engineId,
        });
      } else if (data.catalogueId || data.colourId) {
        const catalogueId = data.catalogueId ?? vehicle.catalogueId;
        const colourId = data.colourId ?? vehicle.colourId;
        if (!catalogueId || !colourId) throw new BadRequestError('Select catalogue variant and colour');
        const legacy = await this.catalogue(tx, catalogueId, colourId);
        identity = { ...legacy, modelId: null, generationId: null, engineId: null, customMake: legacy.make, customModel: legacy.model };
      }

      if ((data.pdiDone ?? vehicle.pdiDone) && !(data.pdiDate ?? vehicle.pdiDate))
        throw new BadRequestError('PDI date is required');

      if (data.vehicleModelId !== undefined && data.vehicleModelId !== vehicle.vehicleModelId)
        await this.assertWarrantyModel(tx, data.vehicleModelId);

      return tx.vehicle.update({
        where: {
          id,
        },

        data: {
          ...data,
          ...identity,
          saleDate: data.saleDate === undefined ? undefined : data.saleDate ? new Date(data.saleDate) : null,
          pdiDate: data.pdiDate === undefined ? undefined : data.pdiDate ? new Date(data.pdiDate) : null,
        },
      });
    });
  }

  /** The warranty policy model (VehicleModel) must exist and be active when one is chosen. */
  private async assertWarrantyModel(tx: Prisma.TransactionClient, vehicleModelId?: string | null) {
    if (!vehicleModelId) return;
    const model = await tx.vehicleModel.findUnique({ where: { id: vehicleModelId }, select: { isActive: true } });
    if (!model?.isActive) throw new BadRequestError('Choose an active vehicle model');
  }

  async deleteVehicle(id: string) {
    const vehicle = await this.vehicleRepository.findVehicleById(id);

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    await this.vehicleRepository.deleteVehicle(id);
  }

  async addVehicleImage(
    vehicleId: string,
    data: {
      url: string;
      type?: string;
      metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    },
  ) {
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

  async addVehicleOwnership(
    vehicleId: string,
    data: {
      customerId: string;
      ownershipType?: string;
      purchaseDate: string;
    },
  ) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`);

      const vehicle = await tx.vehicle.findUnique({
        where: {
          id: vehicleId,
        },
      });

      if (!vehicle)
        throw new NotFoundError('Vehicle not found');

      if (!(await tx.customer.findFirst({
        where: {
          id: data.customerId,
          mergedIntoId: null,
        },
      })))
        throw new NotFoundError('Customer not found');

      const effectiveAt = new Date(data.purchaseDate);

      if (!Number.isFinite(effectiveAt.getTime()) || effectiveAt > new Date())
        throw new BadRequestError('Owner change must take effect on or before today');

      const current = await tx.vehicleOwnership.findFirst({
        where: {
          vehicleId,
        },

        orderBy: {
          purchaseDate: 'desc',
        },
      });

      if (current && effectiveAt <= current.purchaseDate)
        throw new BadRequestError('Effective date must follow the latest ownership');

      if (vehicle.customerId === data.customerId)
        throw new BadRequestError('This customer already owns the vehicle');

      if (vehicle.customerId && !current) {
        if (effectiveAt < vehicle.createdAt)
          throw new BadRequestError('Effective date precedes the recorded vehicle');

        await tx.vehicleOwnership.create({
          data: {
            vehicleId,
            customerId: vehicle.customerId,
            purchaseDate: vehicle.createdAt,
            saleDate: effectiveAt,
            status: 'Previous',
          },
        });
      }

      await tx.vehicleOwnership.updateMany({
        where: {
          vehicleId,
          saleDate: null,
        },

        data: {
          saleDate: effectiveAt,
          status: 'Previous',
        },
      });

      const ownership = await tx.vehicleOwnership.create({
        data: {
          vehicleId,
          customerId: data.customerId,
          purchaseDate: effectiveAt,
          ownershipType: data.ownershipType,
          status: 'Current',
        },
      });

      await tx.vehicle.update({
        where: {
          id: vehicleId,
        },

        data: {
          customerId: data.customerId,
        },
      });

      return ownership;
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
