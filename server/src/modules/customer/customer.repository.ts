import prisma from '../../prisma/client';
import { Customer, CustomerDocument, ServiceHistory, Prisma } from '@prisma/client';

export class CustomerRepository {
  async listCustomers(params: { skip: number; take: number; search?: string; branchId?: string; createdById?: string }) {
    const where: Record<string, any> = {};

    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { phoneNumber: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.branchId) {
      where.branchId = params.branchId;
    }

    if (params.createdById) {
      where.createdById = params.createdById;
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return { customers, total };
  }

  async findCustomerById(id: string) {
    return prisma.customer.findUnique({
      where: { id },
      include: {
        documents: true,
        serviceHistory: true,
        account: {
          select: {
            id: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async createCustomerProfile(data: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    dateOfBirth?: Date;
    driverLicenseNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    preferredContactMethod?: string;
    branchId: string;
    createdById?: string;
  }): Promise<Customer> {
    return prisma.customer.create({
      data,
    });
  }

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    return prisma.customer.update({
      where: { id },
      data,
    });
  }

  async addDocument(data: {
    customerId: string;
    type: string;
    url: string;
    metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  }): Promise<CustomerDocument> {
    return prisma.customerDocument.create({
      data,
    });
  }

  async listDocuments(customerId: string): Promise<CustomerDocument[]> {
    return prisma.customerDocument.findMany({
      where: { customerId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async addServiceHistory(data: {
    customerId: string;
    serviceDate: Date;
    description: string;
    vehicleInfo?: string;
    status: string;
    amount?: number;
  }): Promise<ServiceHistory> {
    return prisma.serviceHistory.create({
      data,
    });
  }

  async listServiceHistory(customerId: string): Promise<ServiceHistory[]> {
    return prisma.serviceHistory.findMany({
      where: { customerId },
      orderBy: { serviceDate: 'desc' },
    });
  }
}
