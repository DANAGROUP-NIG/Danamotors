import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export class LabourService {
  async listItems() {
    return prisma.labourItem.findMany({ where: { active: true }, orderBy: [{ code: 'asc' }] });
  }

  async createItem(input: { code: string; description: string; defaultHours: number; rate: number }) {
    return prisma.labourItem.create({
      data: { ...input, code: input.code.trim().toUpperCase(), description: input.description.trim() },
    });
  }

  async updateItem(id: string, input: { code?: string; description?: string; defaultHours?: number; rate?: number; active?: boolean }) {
    const existing = await prisma.labourItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Labour item not found');
    return prisma.labourItem.update({
      where: { id },
      data: {
        ...input,
        code: input.code?.trim().toUpperCase(),
        description: input.description?.trim(),
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
    if (jobCard.billedAt || ['Ready', 'Completed', 'Closed', 'Billed', 'Cancelled'].includes(jobCard.status)) {
      throw new BadRequestError('Labour lines can only be changed while the job card is open');
    }
    return jobCard;
  }

  private async resolveLine(transaction: Prisma.TransactionClient, input: { labourItemId: string; hours: number; rate?: number; technicianId?: string | null; branchId: string }) {
    const labourItem = await transaction.labourItem.findFirst({ where: { id: input.labourItemId, active: true } });
    if (!labourItem) throw new NotFoundError('Active labour item not found');
    if (input.technicianId) {
      const technician = await transaction.user.findUnique({ where: { id: input.technicianId }, include: { role: true } });
      if (!technician || !technician.isActive || technician.role.name !== ROLES.TECHNICIAN) throw new NotFoundError('Active technician not found');
      if (technician.branchId !== input.branchId) throw new BadRequestError('The technician must belong to the job card branch');
    }
    const rate = input.rate ?? labourItem.rate;
    return {
      labourItemId: labourItem.id,
      description: labourItem.description,
      hours: input.hours,
      rate,
      amount: roundMoney(input.hours * rate),
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
        hours: input.hours ?? item.defaultHours,
        branchId: jobCard.branchId,
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
      await this.assertJobCardOpen(existing.jobCardId, transaction);
      const values = await this.resolveLine(transaction, {
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