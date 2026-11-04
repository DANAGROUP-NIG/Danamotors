import { notifyWorkshopEvent } from '../notification/workshop-notifications';
import { assertRecordedScope } from '../service/estimate-approval';
import { Prisma } from '@prisma/client';
import { WorkshopRepository } from './workshop.repository';
import { NotFoundError, BadRequestError } from '../../shared/errors/appError';
import prisma from '../../prisma/client';
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
      technicians: await this.withJobCounts(technicians),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async withJobCounts<T extends { id: string }>(technicians: T[]) {
    const counts = await prisma.jobCard.groupBy({ by: ['technicianId', 'status'], where: { technicianId: { in: technicians.map(technician => technician.id) } }, _count: { _all: true } });
    return technicians.map(technician => {
      const rows = counts.filter(row => row.technicianId === technician.id);
      const closed = (status: string) => ['BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(status));
      return { ...technician, openJobs: rows.filter(row => !closed(row.status)).reduce((sum, row) => sum + row._count._all, 0), closedJobs: rows.filter(row => closed(row.status)).reduce((sum, row) => sum + row._count._all, 0) };
    });
  }

  async receiveParts(id: string, actorId: string) {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "PartIssuance" WHERE id = ${id} FOR UPDATE`;
      const issue = await tx.partIssuance.findUnique({ where: { id }, include: { jobCard: true, requisitionLine: { include: { requisition: true } } } });
      if (!issue?.jobCard) throw new NotFoundError('Job part issuance not found');
      if (issue.requisitionLine?.requisition.status === 'CANCELLED') throw new BadRequestError('This requisition is cancelled');
      const actor = await tx.user.findUnique({ where: { id: actorId }, include: { role: true } });
      if (!actor?.isActive || actor.role.name !== 'Technician' || issue.jobCard.technicianId !== actorId) throw new BadRequestError('Only the assigned technician may confirm part collection');
      if (issue.receivedAt) return issue;
      const received = await tx.partIssuance.update({ where: { id }, data: { receivedById: actorId, receivedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: actorId, action: 'PART_RECEIVED', details: JSON.stringify({ partIssuanceId: id, jobCardId: issue.jobCard.id }) } });
      return received;
    });
    if (result?.jobCardId) await notifyWorkshopEvent('PART_RECEIVED', result.jobCardId, id);
    return result;
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

    await notifyWorkshopEvent('TECHNICIAN_ASSIGNED', id, technicianId);

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
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);
      const current = await tx.jobCard.findUniqueOrThrow({ where: { id } });
      if (current.billedAt || ['READY', 'BILLED', 'DELIVERED', 'CANCELLED'].includes(canonicalJobStatus(current.status))) throw new BadRequestError('This job card is no longer open');
      if (canonicalJobStatus(current.status) !== 'QC') throw new BadRequestError('Send this job for QC before recording a review');
      if (current.qcStatus === qcStatus && (current.qcNotes ?? '') === (qcNotes ?? '')) return current;
      if (qcStatus === 'PASSED') await assertRecordedScope(tx, id);
      return tx.jobCard.update({ where: { id }, data: { qcStatus, qcNotes } });
    }, { maxWait: 5000, timeout: 15000 });
    if (qcStatus !== 'PENDING') await notifyWorkshopEvent(qcStatus === 'PASSED' ? 'QC_PASSED' : 'QC_FAILED', id, result.updatedAt.toISOString());
    return result;
  }
}
