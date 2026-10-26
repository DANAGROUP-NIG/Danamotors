import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { money } from '../finance/money';

export function upfrontAmount(amount: number, percent: Prisma.Decimal | number) {
  const rate = new Prisma.Decimal(percent);
  if (!rate.isFinite() || rate.lt(0) || rate.gt(100)) throw new BadRequestError('Upfront percentage must be between 0 and 100');
  return money(new Prisma.Decimal(amount).times(rate).div(100).toNumber());
}

export async function assertDepositPaid(tx: Prisma.TransactionClient, jobCardId: string) {
  const estimate = await tx.estimate.findFirst({ where: { jobCardId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  if (!estimate) throw new BadRequestError('Prepare an estimate before starting work');
  const required = upfrontAmount(estimate.amount, estimate.upfrontPaymentPercent);
  if (required === 0) return;
  const card = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, include: { depositReceipt: true } });
  const receipt = card.depositReceipt;
  if (!receipt || receipt.status === 'CANCELLED' || money(receipt.advanceAmount) < required) throw new BadRequestError('Record the required upfront deposit before starting work');
}

export async function recordJobDeposit(jobCardId: string, receiptId: string, actorId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${jobCardId} FOR UPDATE`;
    const card = await tx.jobCard.findUnique({ where: { id: jobCardId } });
    if (!card) throw new NotFoundError('Job card not found');
    if (card.billedAt || ['BILLED', 'DELIVERED', 'CANCELLED', 'Closed', 'Cancelled'].includes(card.status)) throw new BadRequestError('This job card is closed');
    await tx.$queryRaw`SELECT id FROM "Receipt" WHERE id = ${receiptId} FOR UPDATE`;
    const receipt = await tx.receipt.findUnique({ where: { id: receiptId }, include: { depositJobCard: true } });
    if (!receipt || receipt.status === 'CANCELLED' || receipt.customerId !== card.customerId || receipt.branchId !== card.branchId || receipt.category !== 'SERVICE_PARTS') throw new BadRequestError('Choose an active service receipt for this customer and branch');
    if (receipt.depositJobCard && receipt.depositJobCard.id !== jobCardId) throw new ConflictError('Receipt is already the deposit for another job card');
    if (card.depositReceiptId && card.depositReceiptId !== receiptId) throw new ConflictError('A deposit is already recorded');
    const estimate = await tx.estimate.findFirst({ where: { jobCardId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (!estimate) throw new BadRequestError('Prepare the estimate first');
    if (money(receipt.advanceAmount) < upfrontAmount(estimate.amount, estimate.upfrontPaymentPercent)) throw new BadRequestError('Receipt has insufficient unallocated funds for the required deposit');
    await tx.jobCard.update({ where: { id: jobCardId }, data: { depositReceiptId: receiptId } });
    await tx.auditLog.create({ data: { userId: actorId, action: 'JOB_DEPOSIT_RECORDED', details: JSON.stringify({ jobCardId, receiptId }) } });
    return { receiptId };
  });
}
