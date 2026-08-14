import { ServicesRepository } from './services.repository';
import { NotFoundError, ConflictError } from '../../shared/errors/appError';

interface ServiceShape {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMins: number | null;
  price: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ServicesService {
  private servicesRepository: ServicesRepository;

  constructor() {
    this.servicesRepository = new ServicesRepository();
  }

  private toDto(service: ServiceShape) {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      durationMins: service.durationMins,
      price: service.price,
      isActive: service.isActive,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  }

  async listServices(params: {
    page: number;
    limit: number;
    search?: string;
    category?: string;
    isActive?: boolean;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { services, total } = await this.servicesRepository.listServices({
      skip,
      take: params.limit,
      search: params.search,
      category: params.category,
      isActive: params.isActive,
    });

    return {
      services: services.map((service) => ({
        ...this.toDto(service),
        appointmentsCount: service._count.appointments,
      })),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getService(id: string) {
    const service = await this.servicesRepository.findServiceById(id);
    if (!service) {
      throw new NotFoundError('Service not found');
    }

    return {
      ...this.toDto(service),
      appointmentsCount: service._count.appointments,
    };
  }

  async createService(data: {
    name: string;
    description?: string;
    category?: string;
    durationMins?: number;
    price?: number;
    isActive?: boolean;
  }) {
    const existing = await this.servicesRepository.findServiceByName(data.name);
    if (existing) {
      throw new ConflictError('A service with this name already exists');
    }

    const service = await this.servicesRepository.createService(data);
    return this.toDto(service);
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
  ) {
    const service = await this.servicesRepository.findServiceById(id);
    if (!service) {
      throw new NotFoundError('Service not found');
    }

    if (data.name && data.name !== service.name) {
      const existing = await this.servicesRepository.findServiceByName(data.name);
      if (existing) {
        throw new ConflictError('A service with this name already exists');
      }
    }

    const updated = await this.servicesRepository.updateService(id, data);
    return this.toDto(updated);
  }

  async deleteService(id: string) {
    const service = await this.servicesRepository.findServiceById(id);
    if (!service) {
      throw new NotFoundError('Service not found');
    }

    return this.servicesRepository.deleteService(id);
  }
}
