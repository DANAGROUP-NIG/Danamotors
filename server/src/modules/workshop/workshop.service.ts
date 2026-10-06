import { assertRecordedScope } from '../service/estimate-approval';
import { Prisma } from '@prisma/client';
import { WorkshopRepository } from './workshop.repository';
import { NotFoundError, BadRequestError } from '../../shared/errors/appError';
import prisma from '../../prisma/client';
import { NotificationService } from '../notification/notification.service';
import { jobUpdateBody } from '../service/service.validation';
import { canonicalJobStatus } from '../service/job-card-workflow.service';
import { ServiceService } from '../service/service.service';

export class WorkshopService {
  private workshopRepository: WorkshopRepository;

  constructor() {
    this.workshopRepository = new WorkshopRepository();
  }

  async listTechnicians(params?: {
    page?: number;
    limit?: number;
    branchId?: string;
    search?: string;
  }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      role: { is: { name: 'Technician' } },
    };
    if (params?.branchId) where.branchId = params.branchId;

    if (params?.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [technicians, total] = await Promise.all([
      this.workshopRepository.listTechnicians({
        skip,
        take: limit,
        branchId: params?.branchId,
        search: params?.search,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      technicians,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async assignTechnician(id: string, technicianId: string, qualityInspectorId?: string) {
    const jobCard = await this.workshopRepository.findJobCardById(id);
    if (!jobCard) {
      throw new NotFoundError('Job card not found');
    }

    if (jobCard.billedAt) throw new BadRequestError('Billed job cards cannot be edited');
    if (['READY', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(jobCard.status))) throw new BadRequestError('This job card is no longer open');
    const technician = await prisma.user.findUnique({ where: { id: technicianId }, include: { role: true } });
    if (!technician || !technician.isActive || technician.role.name !== 'Technician') {
      throw new NotFoundError('Technician not found');
    }
    if (technician.branchId !== jobCard.branchId) throw new BadRequestError('Technician must belong to the job card branch');

    if (qualityInspectorId) {
      const inspector = await prisma.user.findUnique({ where: { id: qualityInspectorId } });
      if (!inspector || !inspector.isActive) {
        throw new NotFoundError('Quality inspector not found');
      }
      if (inspector.branchId !== jobCard.branchId) throw new BadRequestError('Quality inspector must belong to the job card branch');
    }

    const updatedJobCard = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);
      const current = await tx.jobCard.findUniqueOrThrow({ where: { id } });
      if (current.billedAt || ['READY', 'BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(current.status))) throw new BadRequestError('This job card is no longer open');
      return tx.jobCard.update({ where: { id }, data: { technicianId, qualityInspectorId } });
    });

    const notificationService = new NotificationService();
    await notificationService.notifyUsers([technicianId], {
      type: 'JOB_ASSIGNED',
      title: 'Job card assigned to you',
      message: `Job card ${updatedJobCard.jobNumber} has been assigned to you.`,
      link: `/job-cards/${updatedJobCard.id}`,
      branchId: updatedJobCard.branchId,
    });

    return updatedJobCard;
  }

  async updateProgress(id: string, _progress: number, status?: string, actorId?: string) {
    const jobCard = await this.workshopRepository.findJobCardById(id);
    if (!jobCard) {
      throw new NotFoundError('Job card not found');
    }

    if (jobCard.billedAt) throw new BadRequestError('Billed job cards cannot be edited');
    if (['READY', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(jobCard.status))) throw new BadRequestError('This job card is no longer open');
    if (!status) throw new BadRequestError('Use the job-card lifecycle instead of progress percentages');
    return new ServiceService().updateJobCard(id, jobUpdateBody.parse({ status: canonicalJobStatus(status) }), actorId);
  }

  async updateQC(id: string, qcStatus: string, qcNotes?: string) {
    const jobCard = await this.workshopRepository.findJobCardById(id);
    if (!jobCard) {
      throw new NotFoundError('Job card not found');
    }

    if (jobCard.billedAt) throw new BadRequestError('Billed job cards cannot be edited');
    if (['READY', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(jobCard.status))) throw new BadRequestError('This job card is no longer open');
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);
      const current = await tx.jobCard.findUniqueOrThrow({ where: { id } });
      if (current.billedAt || ['READY', 'BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(current.status))) throw new BadRequestError('This job card is no longer open');
      if (qcStatus === 'PASSED') await assertRecordedScope(tx, id);
      return tx.jobCard.update({ where: { id }, data: { qcStatus, qcNotes } });
    }, { maxWait: 5000, timeout: 15000 });
  }
}
