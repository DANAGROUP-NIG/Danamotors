import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/appError';
import { nextSequenceNumber } from '../../shared/db/documentSequence';
import { assertChargeChange } from '../job-card-line/jobCardLine.logic';
import { assertRequisitionBranch, assertRequisitionJob, requisitionWorkUpdate } from '../requisition/requisition.logic';
import { assertApprovedOperation } from './estimate-approval';
import { LabourService } from './labour.service';
import { LabourSlipActor, labourSlipFooter } from './labour-slip.logic';
import { LabourSlipInput, LabourSlipLineInput, LabourSlipQuery, labourSlipBody, labourSlipLineBody } from './labour-slip.validation';

const include = {
  branch: { select: { id: true, name: true } },
  group: { select: { id: true, code: true, description: true } },
  engineer: { select: { id: true, firstName: true, lastName: true } },
  jobCard: { select: { id: true, jobNumber: true, createdAt: true, mileage: true, status: true, qcStatus: true, workDone: true, vehicle: { select: { registrationNumber: true, vin: true, model: true, trim: true } } } },
  lines: { include: { labourItem: { select: { code: true } }, technician: { select: { id: true, firstName: true, lastName: true } }, mechanic: { select: { id: true, code: true, name: true } }, group: { select: { id: true, code: true, description: true } }, chargeLine: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.LabourSlipInclude;
const jobInclude = { invoices: { select: { status: true } }, warrantyCase: { select: { id: true } }, campaigns: { select: { campaignId: true } } } satisfies Prisma.JobCardInclude;
type Job = Prisma.JobCardGetPayload<{ include: typeof jobInclude }>;

export class LabourSlipService {
  private labour = new LabourService();

  async list(query: LabourSlipQuery, actor: LabourSlipActor) {
    assertRequisitionBranch(actor, query.branchId, 'labour slips');
    if (query.jobCardId) {
      const job = await prisma.jobCard.findUnique({ where: { id: query.jobCardId }, select: { branchId: true } });
      if (!job) throw new NotFoundError('Job card not found');
      assertRequisitionBranch(actor, job.branchId, 'labour slips');
    }
    return prisma.labourSlip.findMany({ where: { branchId: actor.allBranches ? query.branchId : actor.branchId!, jobCardId: query.jobCardId }, include: { jobCard: { select: { jobNumber: true } } }, orderBy: [{ slipDate: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit });
  }

  async get(id: string, actor: LabourSlipActor, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const slip = await db.labourSlip.findUnique({ where: { id }, include });
    if (!slip) throw new NotFoundError('Labour slip not found');
    assertRequisitionBranch(actor, slip.branchId, 'labour slips');
    return { ...slip, lines: slip.lines.map(line => ({ ...line, chargedHours: line.hours })), totals: labourSlipFooter(slip.lines) };
  }

  private async lockJob(tx: Prisma.TransactionClient, id: string, actor: LabourSlipActor) {
    await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`;
    const job = await tx.jobCard.findUnique({ where: { id }, include: jobInclude });
    if (!job) throw new NotFoundError('Job card not found');
    assertRequisitionBranch(actor, job.branchId, 'labour slips');
    assertRequisitionJob(job, 'Labour slips');
    return job;
  }

  private async validateGroup(tx: Prisma.TransactionClient, id?: string | null) {
    if (id && !await tx.workshopMaster.findFirst({ where: { id, kind: 'TEAM', active: true } })) throw new BadRequestError('Choose an active workshop group');
  }

  private async saveLine(tx: Prisma.TransactionClient, slip: { id: string; groupId: string | null }, job: Job, input: LabourSlipLineInput, actor: LabourSlipActor, lineId?: string) {
    const existing = lineId ? await tx.jobCardLabour.findFirst({ where: { id: lineId, labourSlipId: slip.id }, include: { chargeLine: { include: { warrantyCaseLines: { select: { id: true } }, invoiceLines: { select: { id: true } } } } } }) : null;
    if (lineId && !existing) throw new NotFoundError('Labour line not found on this slip');
    if (existing && (!existing.chargeLine || existing.chargeLine.warrantyCaseLines.length || existing.chargeLine.invoiceLines.length)) throw new ConflictError('Resolve claim or bill references before editing this labour line');
    const reason = input.reason ?? existing?.chargeLine?.chargeTypeReason ?? undefined;
    if (input.chargeType === 'GOODWILL') {
      if (!actor.goodwill) throw new ForbiddenError('Goodwill labour requires warranty:update');
      if (!reason?.trim()) throw new BadRequestError('Goodwill labour requires a reason');
    }
    const { campaignId } = assertChargeChange({ to: input.chargeType, campaignId: input.campaignId, kind: 'LABOUR', coverageAtCreation: job.warrantyStatusAtCreation, hasWarrantyCase: !!job.warrantyCase, partWarrantyApplicable: null, linkedCampaignIds: job.campaigns.map(row => row.campaignId), canChargeGoodwill: actor.goodwill });
    const groupId = input.groupId ?? slip.groupId;
    await this.validateGroup(tx, groupId);
    const sameItem = existing?.labourItemId === input.labourItemId;
    const values = await this.labour.resolveLine(tx, {
      labourItemId: input.labourItemId, hours: input.chargedHours ?? (sameItem ? existing.hours : undefined),
      rate: sameItem ? existing.rate : undefined, standardHours: sameItem ? existing.standardHours ?? undefined : undefined,
      pricing: sameItem ? existing.pricing ?? undefined : undefined, storeChargedHours: true,
      technicianId: input.technicianId, mechanicId: input.mechanicId, branchId: job.branchId, vehicleId: job.vehicleId,
    });
    const quantity = values.pricing === 'FIXED' ? 1 : values.hours;
    const previous = await tx.jobCardLabour.findMany({ where: { jobCardId: job.id, labourItemId: input.labourItemId, id: lineId ? { not: lineId } : undefined }, include: { chargeLine: true } });
    await assertApprovedOperation(tx, job.id, job.customerId, [
      ...previous.map(row => ({ type: 'LABOUR', referenceId: row.labourItemId, description: row.description, quantity: row.labourSlipId ? row.chargeLine?.quantity ?? row.hours : row.hours, rate: row.rate, amount: row.amount })),
      { type: 'LABOUR', referenceId: values.labourItemId, description: values.description, quantity, rate: values.rate, amount: values.amount },
    ]);
    const line = existing ? await tx.jobCardLabour.update({ where: { id: existing.id }, data: { ...values, groupId } }) : await tx.jobCardLabour.create({ data: { ...values, groupId, labourSlipId: slip.id, jobCardId: job.id } });
    const item = await tx.labourItem.findUniqueOrThrow({ where: { id: input.labourItemId }, select: { code: true } });
    const charge = { description: values.description, operationCode: item.code, quantity, rate: values.rate, amount: values.amount, chargeType: input.chargeType, campaignId, chargeTypeReason: reason, chargeTypeChangedById: actor.userId, chargeTypeChangedAt: new Date() };
    if (existing?.chargeLine) await tx.jobCardLine.update({ where: { id: existing.chargeLine.id }, data: charge });
    else await tx.jobCardLine.create({ data: { ...charge, jobCardId: job.id, jobCardLabourId: line.id, kind: 'LABOUR', createdById: actor.userId } });
    await tx.auditLog.create({ data: { userId: actor.userId, action: existing ? 'LABOUR_SLIP_LINE_UPDATED' : 'LABOUR_SLIP_LINE_ADDED', details: JSON.stringify({ labourSlipId: slip.id, lineId: line.id, branchId: job.branchId, oldValue: existing ? { hours: existing.hours, standardHours: existing.standardHours, pricing: existing.pricing, rate: existing.rate, amount: existing.amount, technicianId: existing.technicianId, mechanicId: existing.mechanicId, chargeType: existing.chargeLine?.chargeType } : null, newValue: { ...values, chargeType: input.chargeType, campaignId, reason } }) } });
  }

  async create(input: LabourSlipInput, actor: LabourSlipActor) {
    assertRequisitionBranch(actor, input.branchId, 'labour slips');
    const parsed = labourSlipBody.safeParse(input);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map(issue => issue.message).join('; '));
    input = parsed.data;
    return prisma.$transaction(async tx => {
      const job = await this.lockJob(tx, input.jobCardId, actor);
      if (job.branchId !== input.branchId) throw new BadRequestError('Job card must belong to the labour slip branch');
      await this.validateGroup(tx, input.groupId);
      if (input.engineerId && !await tx.user.findFirst({ where: { id: input.engineerId, branchId: input.branchId, isActive: true } })) throw new BadRequestError('Engineer must be active in this branch');
      const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Lagos', year: 'numeric' }).format(new Date()));
      const slipNumber = await nextSequenceNumber(tx, `LABOUR_SLIP_${input.branchId}`, new Date(year, 6, 1));
      const slip = await tx.labourSlip.create({ data: { branchId: input.branchId, jobCardId: job.id, groupId: input.groupId, engineerId: input.engineerId, createdById: actor.userId, slipNumber } });
      for (const line of input.lines) await this.saveLine(tx, slip, job, line, actor);
      await tx.jobCard.update({ where: { id: job.id }, data: requisitionWorkUpdate(job.status, actor.userId, 'Labour slip') });
      await tx.auditLog.create({ data: { userId: actor.userId, action: 'LABOUR_SLIP_CREATED', details: JSON.stringify({ labourSlipId: slip.id, slipNumber, branchId: job.branchId, jobCardId: job.id }) } });
      return this.get(slip.id, actor, tx);
    }, { maxWait: 5000, timeout: 20000 });
  }

  async save(id: string, input: LabourSlipLineInput, actor: LabourSlipActor, lineId?: string) {
    const parsed = labourSlipLineBody.safeParse(input);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map(issue => issue.message).join('; '));
    return prisma.$transaction(async tx => {
      const slip = await tx.labourSlip.findUnique({ where: { id } });
      if (!slip) throw new NotFoundError('Labour slip not found');
      assertRequisitionBranch(actor, slip.branchId, 'labour slips');
      const job = await this.lockJob(tx, slip.jobCardId, actor);
      await this.saveLine(tx, slip, job, parsed.data, actor, lineId);
      await tx.labourSlip.update({ where: { id }, data: { updatedAt: new Date() } });
      await tx.jobCard.update({ where: { id: job.id }, data: requisitionWorkUpdate(job.status, actor.userId, 'Labour slip') });
      return this.get(id, actor, tx);
    }, { maxWait: 5000, timeout: 20000 });
  }
}
