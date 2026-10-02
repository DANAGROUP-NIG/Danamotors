import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { canonicalJobStatus } from './job-card-workflow.service';
import { ROLES } from '../../shared/constants/roles';

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export class LabourService {
  async listItems(search?: string, includeInactive = false) {
    return prisma.labourItem.findMany({ where: { ...(includeInactive ? {} : { active: true }), ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { description: { contains: search, mode: 'insensitive' as const } }] } : {}) }, orderBy: [{ code: 'asc' }], take: 100 });
  }

  async createItem(input: { code: string; description: string; vehicleSystem?: string; group?: string; defaultHours: number; rate: number }) {
    return prisma.labourItem.create({
      data: { ...input, code: input.code.trim(), description: input.description.trim() },
    });
  }

  async updateItem(id: string, input: { code?: string; description?: string; vehicleSystem?: string; group?: string; defaultHours?: number; rate?: number; active?: boolean }) {
    const existing = await prisma.labourItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Labour item not found');
    return prisma.labourItem.update({
      where: { id },
      data: {
        ...input,
        code: input.code?.trim(),
        description: input.description?.trim(),
        vehicleSystem: input.vehicleSystem,
        group: input.group,
      },
    });
  }

  async listJobCardLines(jobCardId: string) {
    const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { id: true } });
    if (!jobCard) throw new NotFoundError('Job card not found');
    return prisma.jobCardLabour.findMany({
      where: { jobCardId },
      include: {
        labourItem: { select: { id: true, code: true, description: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async lockJobCard(transaction: Prisma.TransactionClient, jobCardId: string) {
    await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`);
  }

  private async assertJobCardOpen(jobCardId: string, transaction: Prisma.TransactionClient) {
    const jobCard = await transaction.jobCard.findUnique({ where: { id: jobCardId } });
    if (!jobCard) throw new NotFoundError('Job card not found');
    if (jobCard.billedAt || ['READY', 'DELIVERED', 'BILLED', 'CANCELLED'].includes(canonicalJobStatus(jobCard.status))) {
      throw new BadRequestError('Labour lines can only be changed while the job card is open');
    }
    return jobCard;
  }

  private async resolveLine(transaction: Prisma.TransactionClient, input: { labourItemId: string; hours?: number; rate?: number; technicianId?: string | null; branchId: string; vehicleId?: string | null }) {
    const labourItem = await transaction.labourItem.findFirst({ where: { id: input.labourItemId, active: true } });
    if (!labourItem) throw new NotFoundError('Active labour item not found');
    if (input.technicianId) {
      const technician = await transaction.user.findUnique({ where: { id: input.technicianId }, include: { role: true } });
      if (!technician || !technician.isActive || technician.role.name !== ROLES.TECHNICIAN) throw new NotFoundError('Active technician not found');
      if (technician.branchId !== input.branchId) throw new BadRequestError('The technician must belong to the job card branch');
    }
    const vehicle = input.vehicleId ? await transaction.vehicle.findUnique({ where: { id: input.vehicleId }, include: { catalogue: true } }) : null;
    const modelId = vehicle?.catalogue?.parentId;
    const modelRate = modelId ? await transaction.labourRate.findFirst({ where: { labourItemId: labourItem.id, modelId, active: true } }) : null;
    const rate = input.rate ?? modelRate?.rate ?? labourItem.rate;
    const hours = modelRate?.pricing === 'FIXED' ? 1 : input.hours ?? modelRate?.hours ?? labourItem.defaultHours;
    return {
      labourItemId: labourItem.id,
      description: labourItem.description,
      hours,
      rate,
      amount: roundMoney(hours * rate),
      technicianId: input.technicianId ?? null,
    };
  }

  async addJobCardLine(jobCardId: string, input: { labourItemId: string; hours?: number; rate?: number; technicianId?: string }) {
    return prisma.$transaction(async (transaction) => {
      await this.lockJobCard(transaction, jobCardId);
      const jobCard = await this.assertJobCardOpen(jobCardId, transaction);
      const item = await transaction.labourItem.findUnique({ where: { id: input.labourItemId } });
      if (!item) throw new NotFoundError('Labour item not found');
      const values = await this.resolveLine(transaction, {
        ...input,
        hours: input.hours,
        branchId: jobCard.branchId,
        vehicleId: jobCard.vehicleId,
      });
      return transaction.jobCardLabour.create({
        data: { jobCardId: jobCard.id, ...values },
        include: { labourItem: true, technician: { select: { id: true, firstName: true, lastName: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateJobCardLine(id: string, input: { labourItemId?: string; hours?: number; rate?: number; technicianId?: string | null }) {
    return prisma.$transaction(async (transaction) => {
      const existing = await transaction.jobCardLabour.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Job-card labour line not found');
      await this.lockJobCard(transaction, existing.jobCardId);
      const jobCard = await this.assertJobCardOpen(existing.jobCardId, transaction);
      const values = await this.resolveLine(transaction, {
        vehicleId: jobCard.vehicleId,
        labourItemId: input.labourItemId ?? existing.labourItemId,
        hours: input.hours ?? existing.hours,
        rate: input.rate ?? existing.rate,
        technicianId: input.technicianId === undefined ? existing.technicianId : input.technicianId,
        branchId: (await transaction.jobCard.findUniqueOrThrow({ where: { id: existing.jobCardId }, select: { branchId: true } })).branchId,
      });
      return transaction.jobCardLabour.update({
        where: { id },
        data: values,
        include: { labourItem: true, technician: { select: { id: true, firstName: true, lastName: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeJobCardLine(id: string) {
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.jobCardLabour.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Job-card labour line not found');
      await this.lockJobCard(transaction, existing.jobCardId);
      await this.assertJobCardOpen(existing.jobCardId, transaction);
      await transaction.jobCardLabour.delete({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}