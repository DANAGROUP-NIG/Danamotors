import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';

export class EnquiryRepository {
  async create(data: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    vehicleRegNumber?: string;
    serviceDescription: string;
    preferredDate?: Date;
    branchId: string;
  }) {
    return prisma.enquiry.create({
      data,
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async findById(id: string) {
    return prisma.enquiry.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            vehicle: { select: { id: true, make: true, model: true, registrationNumber: true } },
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async list(params: {
    skip: number;
    take: number;
    status?: string;
    branchId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Prisma.EnquiryWhereInput = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.branchId) {
      where.branchId = params.branchId;
    }

    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { phoneNumber: { contains: params.search, mode: 'insensitive' } },
        { serviceDescription: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (params.dateFrom) createdAtFilter.gte = new Date(params.dateFrom);
    if (params.dateTo) createdAtFilter.lte = new Date(params.dateTo);
    if (Object.keys(createdAtFilter).length > 0) where.createdAt = createdAtFilter;

    const [enquiries, total] = await Promise.all([
      prisma.enquiry.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: {
          branch: { select: { id: true, name: true } },
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.enquiry.count({ where }),
    ]);

    return { enquiries, total };
  }

  async updateStatus(id: string, data: {
    status: string;
    reviewedById?: string;
    reviewNotes?: string;
    reviewedAt?: Date;
    appointmentId?: string;
  }) {
    return prisma.enquiry.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, name: true } },
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
