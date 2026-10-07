import { EstimateCloseReason, EstimateStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { nextDocumentNumber } from '../finance/document-number';
import { lineAmount, money, sumMoney } from '../finance/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';

/**
 * Estimates prepared before a job card exists (legacy job estimate register). They are priced
 * like job estimate revisions, receive one customer decision, and are closed when a job is
 * opened from them, when the customer declines, or when they are cancelled.
 */
export const preJobEstimateBody = z
  .object({
    customerId: z.string().uuid('Select a customer'),
    vehicleId: z.string().uuid('Select a vehicle'),
    description: z.string().trim().min(1, 'Describe the work').max(2000),
    discountAmount: z.number().min(0).max(1e12).multipleOf(0.01).default(0),
    lines: z
      .array(
        z
          .object({
            type: z.enum(['PART', 'LABOUR', 'SERVICE']),
            referenceId: z.string().uuid(),
            quantity: z.number().finite().positive().max(1e6).default(1),
          })
          .strict(),
      )
      .min(1, 'Add at least one part, labour operation or service')
      .max(200),
  })
  .strict();

export type PreJobEstimateInput = z.infer<typeof preJobEstimateBody>;

export const createPreJobEstimateSchema = z.object({
  body: preJobEstimateBody.extend({ branchId: z.string().uuid().optional() }),
});

export const cancelEstimateSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid estimate ID') }),
  body: z.object({ reason: z.string().trim().min(1, 'Give a reason').max(500) }).strict(),
});

const ESTIMATE_INCLUDE = {
  lines: true,
  approvals: true,
  customer: { select: { id: true, firstName: true, lastName: true, companyName: true } },
  vehicle: { select: { id: true, make: true, model: true, registrationNumber: true, vin: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.EstimateInclude;

export async function createPreJobEstimate(input: PreJobEstimateInput, branchId: string, actorId: string) {
  const data = preJobEstimateBody.parse(input);
  if (new Set(data.lines.map((line) => `${line.type}:${line.referenceId}`)).size !== data.lines.length)
    throw new BadRequestError('Each service, part or labour operation can appear only once per estimate');

  return prisma.$transaction(
    async (tx) => {
      const [customer, vehicle, branch] = await Promise.all([
        tx.customer.findUnique({ where: { id: data.customerId }, select: { id: true } }),
        tx.vehicle.findUnique({ where: { id: data.vehicleId }, include: { catalogue: true } }),
        tx.branch.findUnique({ where: { id: branchId }, select: { id: true } }),
      ]);
      if (!customer) throw new NotFoundError('Customer not found');
      if (!vehicle) throw new NotFoundError('Vehicle not found');
      if (!branch) throw new NotFoundError('Branch not found');
      if (vehicle.customerId && vehicle.customerId !== customer.id) throw new BadRequestError('The vehicle belongs to another customer');

      const modelId = vehicle.catalogue?.parentId;
      const lines: Prisma.EstimateLineCreateWithoutEstimateInput[] = [];
      for (const line of data.lines) {
        let description: string;
        let rate: number;
        let quantity = line.quantity;
        if (line.type === 'PART') {
          const part = await tx.sparePart.findUnique({ where: { id: line.referenceId } });
          if (!part) throw new BadRequestError('Select a part');
          if (part.retailRate == null) throw new BadRequestError(`Retail rate is not set for ${part.partNumber}`);
          description = part.name;
          rate = part.retailRate;
        } else if (line.type === 'LABOUR') {
          const item = await tx.labourItem.findFirst({ where: { id: line.referenceId, active: true } });
          if (!item) throw new BadRequestError('Select an active labour operation');
          const modelRate = modelId ? await tx.labourRate.findFirst({ where: { labourItemId: item.id, modelId, active: true } }) : null;
          description = item.description;
          rate = modelRate?.rate ?? item.rate;
          quantity = modelRate?.pricing === 'FIXED' ? 1 : line.quantity;
        } else {
          const service = await tx.service.findFirst({ where: { id: line.referenceId, isActive: true } });
          if (!service) throw new BadRequestError('Select an active service');
          description = service.name;
          rate = service.price;
        }
        lines.push({ type: line.type, referenceId: line.referenceId, description, quantity, rate, amount: lineAmount(quantity, rate) });
      }

      const amount = sumMoney(lines.map((line) => line.amount ?? 0));
      if (money(data.discountAmount) > amount) throw new BadRequestError('The discount cannot be more than the estimate amount');
      const estimate = await tx.estimate.create({
        data: {
          branchId,
          customerId: customer.id,
          vehicleId: vehicle.id,
          estimateNumber: await nextDocumentNumber(tx, 'ESTIMATE'),
          estimateDate: new Date(),
          description: data.description,
          amount,
          discountAmount: money(data.discountAmount),
          currency: 'NGN',
          status: 'Pending',
          estimateStatus: EstimateStatus.PENDING_APPROVAL,
          lines: { create: lines },
        },
        include: ESTIMATE_INCLUDE,
      });
      await tx.auditLog.create({ data: { userId: actorId, action: 'ESTIMATE_CREATED', details: JSON.stringify({ estimateId: estimate.id, estimateNumber: estimate.estimateNumber, vehicleId: vehicle.id }) } });
      return estimate;
    },
    { maxWait: 5000, timeout: 15000 },
  );
}

/** The customer's single decision on a pre-job estimate: approved stays active until a job is opened. */
export async function decidePreJobEstimate(estimateId: string, data: { customerId: string; approved?: boolean; comments?: string }, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Estimate" WHERE id = ${estimateId} FOR UPDATE`);
    const estimate = await tx.estimate.findUnique({ where: { id: estimateId }, include: { approvals: true } });
    if (!estimate || estimate.jobCardId) throw new NotFoundError('Estimate not found');
    if (estimate.estimateStatus !== EstimateStatus.PENDING_APPROVAL || estimate.approvals.length)
      throw new ConflictError('This estimate already has a decision or is closed');
    if (estimate.customerId !== data.customerId) throw new BadRequestError('Approval must be from the estimate customer');
    const status = data.approved ? 'Approved' : 'Declined';
    await tx.estimate.update({
      where: { id: estimateId },
      data: data.approved
        ? { status, estimateStatus: EstimateStatus.ACTIVE }
        : { status, estimateStatus: EstimateStatus.CLOSED, closedReason: EstimateCloseReason.DECLINED },
    });
    if (actorId)
      await tx.auditLog.create({ data: { userId: actorId, action: 'ESTIMATE_DECISION_RECORDED', details: JSON.stringify({ estimateId, customerId: data.customerId, status, comments: data.comments }) } });
    return tx.customerApproval.create({ data: { estimateId, customerId: data.customerId, approved: data.approved, decisionDate: new Date(), comments: data.comments, status } });
  });
}

export async function cancelPreJobEstimate(estimateId: string, reason: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Estimate" WHERE id = ${estimateId} FOR UPDATE`);
    const estimate = await tx.estimate.findUnique({ where: { id: estimateId } });
    if (!estimate) throw new NotFoundError('Estimate not found');
    if (estimate.jobCardId) throw new BadRequestError('Revise the job card estimate instead of cancelling it');
    if (estimate.estimateStatus === EstimateStatus.CLOSED) throw new ConflictError('This estimate is already closed');
    await tx.auditLog.create({ data: { userId: actorId, action: 'ESTIMATE_CANCELLED', details: JSON.stringify({ estimateId, reason }) } });
    return tx.estimate.update({
      where: { id: estimateId },
      data: { estimateStatus: EstimateStatus.CLOSED, closedReason: EstimateCloseReason.CANCELLED },
      include: ESTIMATE_INCLUDE,
    });
  });
}

/** Called inside job opening: the job was opened from this estimate. */
export async function linkEstimateToOpenedJob(tx: Prisma.TransactionClient, estimateId: string, job: { id: string; vehicleId: string; branchId: string }) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Estimate" WHERE id = ${estimateId} FOR UPDATE`);
  const estimate = await tx.estimate.findUnique({ where: { id: estimateId } });
  if (!estimate || estimate.jobCardId) throw new BadRequestError('Select an estimate prepared before the job');
  if (estimate.vehicleId !== job.vehicleId || estimate.branchId !== job.branchId) throw new BadRequestError('The estimate must be for the same vehicle and branch');
  if (estimate.estimateStatus === EstimateStatus.CLOSED) throw new BadRequestError('This estimate is closed');
  await tx.estimate.update({
    where: { id: estimateId },
    data: { openedJobCardId: job.id, estimateStatus: EstimateStatus.CLOSED, closedReason: EstimateCloseReason.CONVERTED },
  });
}

/** Filter for the estimates list: job revisions and pre-job estimates of a branch, latest revisions only. */
export function estimateListWhere(params: { branchId?: string; status?: string; search?: string }): Prisma.EstimateWhereInput {
  const and: Prisma.EstimateWhereInput[] = [{ OR: [{ closedReason: null }, { closedReason: { not: EstimateCloseReason.SUPERSEDED } }] }];
  if (params.branchId) and.push({ OR: [{ branchId: params.branchId }, { jobCard: { branchId: params.branchId } }] });
  if (params.status) and.push({ status: params.status });
  if (params.search) {
    const contains = { contains: params.search, mode: 'insensitive' as const };
    and.push({
      OR: [
        { description: contains },
        { estimateNumber: contains },
        { jobCard: { jobNumber: contains } },
        { customer: { firstName: contains } },
        { customer: { lastName: contains } },
        { customer: { companyName: contains } },
        { vehicle: { registrationNumber: contains } },
      ],
    });
  }
  return { AND: and };
}

export { ESTIMATE_INCLUDE };
