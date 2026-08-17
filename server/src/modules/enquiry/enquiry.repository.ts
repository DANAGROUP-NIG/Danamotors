import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';

export interface CreateEnquiryData {
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
}

const ENQUIRY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  vehicleMake: true,
  vehicleModel: true,
  vehicleYear: true,
  vehicleRegNumber: true,
  serviceDescription: true,
  preferredDate: true,
  status: true,
  reviewNotes: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  appointment: { select: { id: true, status: true, scheduledAt: true } },
} satisfies Prisma.EnquirySelect;

export class EnquiryRepository {
  async create(data: CreateEnquiryData) {
    return prisma.enquiry.create({ data, select: ENQUIRY_SELECT });
  }

  async findById(id: string) {
    return prisma.enquiry.findUnique({ where: { id }, select: ENQUIRY_SELECT });
  }

  async list(params: {
    skip: number;
    take: number;
    branchId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Prisma.EnquiryWhereInput = {};
    if (params.branchId) where.branchId = params.branchId;
    if (params.status)   where.status = params.status;
    if (params.search) {
      where.OR = [
        { firstName:          { contains: params.search, mode: 'insensitive' } },
        { lastName:           { contains: params.search, mode: 'insensitive' } },
        { email:              { contains: params.search, mode: 'insensitive' } },
        { vehicleRegNumber:   { contains: params.search, mode: 'insensitive' } },
        { serviceDescription: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
        ...(params.dateTo   ? { lte: new Date(params.dateTo)   } : {}),
      };
    }

    const [enquiries, total] = await Promise.all([
      prisma.enquiry.findMany({ where, skip: params.skip, take: params.take,
        orderBy: { createdAt: 'desc' }, select: ENQUIRY_SELECT }),
      prisma.enquiry.count({ where }),
    ]);

    return { enquiries, total };
  }

  async update(id: string, data: Prisma.EnquiryUpdateInput) {
    return prisma.enquiry.update({ where: { id }, data, select: ENQUIRY_SELECT });
  }

  async delete(id: string) {
    return prisma.enquiry.delete({ where: { id } });
  }
}
