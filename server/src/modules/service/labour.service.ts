import { assertApprovedOperation } from './estimate-approval';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { canonicalJobStatus } from './job-card-workflow.service';
import { ROLES } from '../../shared/constants/roles';

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export type LabourTechnicianInput = { technicianId: string; sharePercent?: number };

const LINE_INCLUDE = {
  labourItem: true,
  technician: { select: { id: true, firstName: true, lastName: true } },
  technicians: { include: { technician: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.JobCardLabourInclude;

/** The technicians a request asks for, or undefined to keep the line's current ones. */
function requestedTechnicians(input: { technicianId?: string | null; technicians?: LabourTechnicianInput[] }): LabourTechnicianInput[] | undefined {
  if (input.technicians) return input.technicians;
  if (input.technicianId === undefined) return undefined;
  return input.technicianId ? [{ technicianId: input.technicianId }] : [];
}

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
        technicians: { include: { technician: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Every technician must be an active technician of the job card's branch. */
  private async assertTechnicians(transaction: Prisma.TransactionClient, technicians: LabourTechnicianInput[], branchId: string) {
    for (const { technicianId } of technicians) {
      const technician = await transaction.user.findUnique({ where: { id: technicianId }, include: { role: true } });
      if (!technician || !technician.isActive || technician.role.name !== ROLES.TECHNICIAN) throw new NotFoundError('Active technician not found');
      if (technician.branchId !== branchId) throw new BadRequestError('The technician must belong to the job card branch');
    }
  }

  private async saveTechnicians(transaction: Prisma.TransactionClient, jobCardLabourId: string, technicians: LabourTechnicianInput[]) {
    await transaction.jobCardLabourTechnician.deleteMany({ where: { jobCardLabourId } });
    if (technicians.length)
      await transaction.jobCardLabourTechnician.createMany({
        data: technicians.map((item) => ({ jobCardLabourId, technicianId: item.technicianId, sharePercent: item.sharePercent ?? null })),
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
    if (input.technicianId) await this.assertTechnicians(transaction, [{ technicianId: input.technicianId }], input.branchId);
    const vehicle = input.vehicleId ? await transaction.vehicle.findUnique({ where: { id: input.vehicleId }, include: { catalogue: true } }) : null;
    const modelId = vehicle?.catalogue?.parentId;
    const modelRate = modelId ? await transaction.labourRate.findFirst({ where: { labourItemId: labourItem.id, modelId, active: true } }) : null;
    const rate = input.rate ?? modelRate?.rate ?? labourItem.rate;
    const hours = modelRate?.pricing === 'FIXED' ? 1 : input.hours ?? modelRate?.hours ?? labourItem.defaultHours;
    return {
      labourItemId: labourItem.id,
      description: labourItem.description,
      hours,
      // Flat-rate hours for productivity: the model labour rate, else the labour item.
      standardHours: modelRate?.hours ?? labourItem.defaultHours,
      rate,
      amount: roundMoney(hours * rate),
      technicianId: input.technicianId ?? null,
    };
  }

  async addJobCardLine(jobCardId: string, input: { labourItemId: string; hours?: number; rate?: number; technicianId?: string; technicians?: LabourTechnicianInput[] }) {
    return prisma.$transaction(async (transaction) => {
      await this.lockJobCard(transaction, jobCardId);
      const jobCard = await this.assertJobCardOpen(jobCardId, transaction);
      const item = await transaction.labourItem.findUnique({ where: { id: input.labourItemId } });
      if (!item) throw new NotFoundError('Labour item not found');
      const technicians = requestedTechnicians(input) ?? [];
      await this.assertTechnicians(transaction, technicians, jobCard.branchId);
      const values = await this.resolveLine(transaction, {
        labourItemId: input.labourItemId,
        rate: input.rate,
        hours: input.hours,
        technicianId: technicians[0]?.technicianId ?? null,
        branchId: jobCard.branchId,
        vehicleId: jobCard.vehicleId,
      });
      const previous = await transaction.jobCardLabour.findMany({ where: { jobCardId, labourItemId: values.labourItemId } });
      await assertApprovedOperation(transaction, jobCardId, jobCard.customerId, [...previous, values].map(line => ({ type: 'LABOUR', referenceId: line.labourItemId, description: line.description, quantity: line.hours, rate: line.rate, amount: line.amount })));
      await transaction.jobCard.update({ where: { id: jobCardId }, data: { qcStatus: 'PENDING' } });
      const line = await transaction.jobCardLabour.create({ data: { jobCardId: jobCard.id, ...values } });
      await this.saveTechnicians(transaction, line.id, technicians);
      return transaction.jobCardLabour.findUniqueOrThrow({ where: { id: line.id }, include: LINE_INCLUDE });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
  }

  async updateJobCardLine(id: string, input: { labourItemId?: string; hours?: number; rate?: number; technicianId?: string | null; technicians?: LabourTechnicianInput[] }) {
    return prisma.$transaction(async (transaction) => {
      const existing = await transaction.jobCardLabour.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Job-card labour line not found');
      await this.lockJobCard(transaction, existing.jobCardId);
      const jobCard = await this.assertJobCardOpen(existing.jobCardId, transaction);
      const technicians = requestedTechnicians(input);
      if (technicians) await this.assertTechnicians(transaction, technicians, jobCard.branchId);
      const values = await this.resolveLine(transaction, {
        vehicleId: jobCard.vehicleId,
        labourItemId: input.labourItemId ?? existing.labourItemId,
        hours: input.hours ?? existing.hours,
        rate: input.rate ?? existing.rate,
        technicianId: technicians ? technicians[0]?.technicianId ?? null : existing.technicianId,
        branchId: (await transaction.jobCard.findUniqueOrThrow({ where: { id: existing.jobCardId }, select: { branchId: true } })).branchId,
      });
      const previous = await transaction.jobCardLabour.findMany({ where: { jobCardId: existing.jobCardId, labourItemId: values.labourItemId, id: { not: id } } });
      await assertApprovedOperation(transaction, existing.jobCardId, jobCard.customerId, [...previous, values].map(line => ({ type: 'LABOUR', referenceId: line.labourItemId, description: line.description, quantity: line.hours, rate: line.rate, amount: line.amount })));
      await transaction.jobCard.update({ where: { id: existing.jobCardId }, data: { qcStatus: 'PENDING' } });
      await transaction.jobCardLabour.update({ where: { id }, data: values });
      if (technicians) await this.saveTechnicians(transaction, id, technicians);
      return transaction.jobCardLabour.findUniqueOrThrow({ where: { id }, include: LINE_INCLUDE });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
  }

  async removeJobCardLine(id: string) {
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.jobCardLabour.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Job-card labour line not found');
      await this.lockJobCard(transaction, existing.jobCardId);
      await this.assertJobCardOpen(existing.jobCardId, transaction);
      await transaction.jobCard.update({ where: { id: existing.jobCardId }, data: { qcStatus: 'PENDING' } });
      await transaction.jobCardLabour.delete({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
  }
}