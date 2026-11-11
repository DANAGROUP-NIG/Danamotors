import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { money } from '../finance/money';
import { lockParty, withPartyTransaction } from '../finance/party-account.service';
import { advanceReceiptDateLimit, lockAdvanceJob, prepareJobAdvance } from '../finance/job-advance';
import { lagosDay } from '../finance/credit-terms';

export function upfrontAmount(amount: number, percent: Prisma.Decimal | number) {
  const rate = new Prisma.Decimal(percent);
  if (!rate.isFinite() || rate.lt(0) || rate.gt(100)) throw new BadRequestError('Upfront percentage must be between 0 and 100');
  return money(new Prisma.Decimal(amount).times(rate).div(100).toNumber());
}

export async function assertDepositPaid(tx: Prisma.TransactionClient, jobCardId: string) {
  // Every entry into work, including rework, requires money received. The estimate's
  // percentage is a suggestion and even a zero-percent target cannot bypass this gate.
  const receipt = await tx.receipt.findFirst({ where: {
    advanceJobCardId: jobCardId, status: 'ACTIVE', category: 'SERVICE_PARTS',
    mode: { not: 'CHEQUE' }, advanceAmount: { gte: 0.01 },
    issuedAt: { lte: advanceReceiptDateLimit() },
  }, select: { id: true } });
  if (!receipt) throw new BadRequestError('Record a positive advance payment before starting work');
}

export async function recordJobDeposit(jobCardId: string, receiptId: string, actorId: string) {
  const owner = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { customerId: true } });
  if (!owner?.customerId) throw new NotFoundError('Job customer not found');
  return withPartyTransaction(async tx => {
    await lockParty(tx, owner.customerId!);
    await lockAdvanceJob(tx, jobCardId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Receipt" WHERE id = ${receiptId} FOR UPDATE`);
    const receipt = await tx.receipt.findUnique({ where: { id: receiptId } });
    const card = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId } });
    if (!receipt || receipt.status !== 'ACTIVE' || receipt.customerId !== card.customerId || receipt.branchId !== card.branchId || receipt.category !== 'SERVICE_PARTS') throw new BadRequestError('Choose an active service receipt for this customer and branch');
    if (receipt.mode === 'CHEQUE') throw new BadRequestError('Uncleared cheques cannot be used as job advances');
    if (receipt.issuedAt && lagosDay(receipt.issuedAt) > lagosDay(new Date())) throw new BadRequestError('A future-dated receipt cannot be used as an advance');
    if (receipt.advanceJobCardId && receipt.advanceJobCardId !== jobCardId) throw new ConflictError('Receipt is reserved for another job');
    if (receipt.advanceJobCardId === jobCardId) return { receiptId };
    if (money(receipt.advanceAmount) <= 0 || money(receipt.advanceAmount) !== money(receipt.amount)) throw new BadRequestError('Choose a positive, fully unallocated receipt');
    const advanceSnapshot = await prepareJobAdvance(tx, jobCardId, receipt.customerId, card.branchId, receipt.advanceAmount);
    await tx.receipt.update({ where: { id: receiptId }, data: { advanceJobCardId: jobCardId, advanceSnapshot } });
    await tx.auditLog.create({ data: { userId: actorId, action: 'JOB_DEPOSIT_RECORDED', details: JSON.stringify({ jobCardId, receiptId, amount: receipt.amount }) } });
    return { receiptId };
  });
}
