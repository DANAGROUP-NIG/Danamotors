import { MrnDiscrepancyStatus, MrnSource } from '@prisma/client';
import prisma from '../../prisma/client';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { NotificationService } from '../notification/notification.service';
import { holdsPermission } from '../../shared/effectivePermissions';

/**
 * Legacy S/E approval ("Can Approve Shortage/Excess in MIT/BIT"). A Mobis (MIT) or branch transfer (STN)
 * receipt that records damaged or short units waits for a user with `stock:discrepancy:approve` to approve
 * it. Stock is posted at receipt either way, as in legacy: the approval accepts the shortage, it does not
 * hold the goods. Receipts cannot exceed what was invoiced or sent, so there is no excess to approve.
 */
export const DISCREPANCY_NOTIFICATION = 'STOCK_DISCREPANCY_PENDING';

/** The status a new receipt starts with: pending when anything was damaged or short. */
export function discrepancyStatusFor(totals: { damaged: number; short: number }): MrnDiscrepancyStatus | null {
  return totals.damaged > 0 || totals.short > 0 ? MrnDiscrepancyStatus.PENDING : null;
}

/** Active users who may approve a discrepancy at this branch: holders of the permission there, holders
 *  with cross-branch inventory access, and super admins. */
export async function discrepancyApproverIds(branchId: string): Promise<string[]> {
  const holders = holdsPermission(PERMISSIONS.STOCK_DISCREPANCY_APPROVE);
  const crossBranch = holdsPermission(PERMISSIONS.INVENTORY_CROSS_BRANCH);
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { name: ROLES.SUPER_ADMIN } },
        { AND: [holders], branchId },
        { AND: [holders, crossBranch] },
      ],
    },
    select: { id: true },
  });
  return users.map(user => user.id);
}

/** Tells the approvers that a receipt is waiting. Call after the receipt's transaction commits. */
export async function notifyDiscrepancyPending(mrn: {
  mrnNumber: string;
  receivingBranchId: string;
  totalDamaged: number;
  totalShort: number;
  document: string;
  link: string;
}): Promise<void> {
  const approvers = await discrepancyApproverIds(mrn.receivingBranchId);
  await new NotificationService().notifyUsers(approvers, {
    type: DISCREPANCY_NOTIFICATION,
    title: 'Shortage / damage awaiting approval',
    message: `MRN ${mrn.mrnNumber} (${mrn.document}) recorded ${mrn.totalDamaged} damaged and ${mrn.totalShort} short unit(s). Please review and approve.`,
    link: mrn.link,
    branchId: mrn.receivingBranchId,
  });
}

/**
 * Approves a pending discrepancy. The update only succeeds while the receipt is still pending, so two
 * approvers at the same time cannot both approve it. The caller checks branch access first.
 */
export async function approveDiscrepancy(mrnId: string, actorId: string, remark?: string) {
  const mrn = await prisma.materialReceiptNote.findUnique({
    where: { id: mrnId },
    select: { id: true, mrnNumber: true, source: true, discrepancyStatus: true, totalDamaged: true, totalShort: true },
  });
  if (!mrn) throw new NotFoundError('MRN not found');
  if (mrn.source === MrnSource.VENDOR || !mrn.discrepancyStatus)
    throw new BadRequestError('This MRN has no shortage or damage to approve');

  const approvedAt = new Date();
  return prisma.$transaction(async tx => {
    const updated = await tx.materialReceiptNote.updateMany({
      where: { id: mrnId, discrepancyStatus: MrnDiscrepancyStatus.PENDING },
      data: {
        discrepancyStatus: MrnDiscrepancyStatus.APPROVED,
        discrepancyApprovedById: actorId,
        discrepancyApprovedAt: approvedAt,
        discrepancyRemark: remark?.trim() || null,
      },
    });
    if (updated.count === 0) throw new ConflictError('This shortage has already been approved');
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'STOCK_DISCREPANCY_APPROVED',
        details: JSON.stringify({ mrnId, mrnNumber: mrn.mrnNumber, damaged: mrn.totalDamaged, short: mrn.totalShort, remark: remark?.trim() || null }),
      },
    });
    return { id: mrnId, discrepancyStatus: MrnDiscrepancyStatus.APPROVED, discrepancyApprovedAt: approvedAt };
  });
}

/** Receipts still waiting for approval, newest first, for the branches the caller may see. */
export async function pendingDiscrepancies(branchIds?: string[]) {
  return prisma.materialReceiptNote.findMany({
    where: {
      discrepancyStatus: MrnDiscrepancyStatus.PENDING,
      ...(branchIds ? { receivingBranchId: { in: branchIds } } : {}),
    },
    orderBy: { receiptDate: 'desc' },
    take: 200,
    select: {
      id: true,
      mrnNumber: true,
      source: true,
      receiptDate: true,
      totalReceived: true,
      totalDamaged: true,
      totalShort: true,
      mitId: true,
      stnId: true,
      mit: { select: { mitNumber: true, invoiceNumber: true } },
      stn: { select: { stnNumber: true } },
      receivingBranch: { select: { id: true, name: true } },
      sourceBranch: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}
