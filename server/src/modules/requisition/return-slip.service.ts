import { ChargeType, Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { nextSequenceNumber } from '../../shared/db/documentSequence';
import { assertRequisitionBranch, assertRequisitionJob, RequisitionActor, requisitionWorkUpdate } from './requisition.logic';
import { assertReturnQuantity, effectiveReturnedQuantity, remainingReturnCharges, returnSlipFooter, returnSnapshot } from './return-slip.logic';
import { ReturnSlipInput, ReturnSlipQuery, returnSlipBody } from './return-slip.validation';

const lineInclude = {
  partIssuance: { include: { returns: true } },
  jobCardLines: { include: { warrantyCaseLines: { select: { id: true } }, invoiceLines: { select: { id: true } } } },
} satisfies Prisma.PartRequisitionLineInclude;
type IssuedLine = Prisma.PartRequisitionLineGetPayload<{ include: typeof lineInclude }>;

const include = {
  requisition: { select: { requisitionNumber: true, requisitionDate: true, chargeType: true } },
  branch: { select: { id: true, name: true } },
  jobCard: { select: { jobNumber: true, createdAt: true, mileage: true, vehicle: { select: { registrationNumber: true, vin: true, model: true, trim: true } } } },
  lines: { include: { requisitionLine: { include: { sparePart: { select: { partNumber: true } } } } } },
} satisfies Prisma.PartReturnSlipInclude;

export class ReturnSlipService {
  async list(query: ReturnSlipQuery, actor: RequisitionActor) {
    assertRequisitionBranch(actor, query.branchId);
    if (query.jobCardId) {
      const job = await prisma.jobCard.findUnique({ where: { id: query.jobCardId }, select: { branchId: true } });
      if (!job) throw new NotFoundError('Job card not found');
      assertRequisitionBranch(actor, job.branchId);
    }
    if (query.requisitionId) {
      const requisition = await prisma.partRequisition.findUnique({ where: { id: query.requisitionId }, select: { branchId: true } });
      if (!requisition) throw new NotFoundError('Requisition not found');
      assertRequisitionBranch(actor, requisition.branchId);
    }
    return prisma.partReturnSlip.findMany({
      where: { branchId: actor.allBranches ? query.branchId : actor.branchId!, jobCardId: query.jobCardId, requisitionId: query.requisitionId, requisition: query.chargeType ? { chargeType: query.chargeType } : undefined },
      include: { requisition: { select: { requisitionNumber: true, chargeType: true } } },
      orderBy: [{ returnDate: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit,
    });
  }

  async get(id: string, actor: RequisitionActor, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const slip = await db.partReturnSlip.findUnique({ where: { id }, include });
    if (!slip) throw new NotFoundError('Return slip not found');
    assertRequisitionBranch(actor, slip.branchId);
    return { ...slip, lines: slip.lines.map(line => ({ ...line, partNumber: line.requisitionLine?.sparePart.partNumber ?? null, description: line.requisitionLine?.description ?? null, partSource: line.requisitionLine?.partSource ?? null, uom: line.requisitionLine?.uom ?? null })), totals: returnSlipFooter(slip.lines) };
  }

  private assertIssuedLine(line: IssuedLine, requisition: { id: string; branchId: string; jobCardId: string }) {
    if (line.requisitionId !== requisition.id || !line.partIssuance || line.partIssuance.branchId !== requisition.branchId ||
        line.partIssuance.jobCardId !== requisition.jobCardId || line.partIssuance.sparePartId !== line.sparePartId ||
        line.partIssuance.quantity !== line.quantityIssued) throw new BadRequestError('Only issued parts of this requisition can be returned');
    // TODO(confirm): adjust claims first; do not silently invalidate claim/bill history.
    if (line.jobCardLines.some(charge => charge.warrantyCaseLines.length || charge.invoiceLines.length)) throw new ConflictError('Remove the returned charges from claims or bills first');
  }

  private async updateCharges(tx: Prisma.TransactionClient, line: IssuedLine, type: ChargeType, returned: number) {
    const remaining = remainingReturnCharges(line, type, returned);
    const expected = new Map(remaining.charges.map(charge => [charge.chargeType, charge]));
    for (const charge of line.jobCardLines) {
      const next = expected.get(charge.chargeType);
      // Preserve snapshots (including tax/campaign/primary issuance link) at zero
      // after a full return, so cancelling restores the exact original allocation.
      await tx.jobCardLine.update({ where: { id: charge.id }, data: { quantity: next?.quantity ?? 0, amount: next?.amount ?? 0 } });
      expected.delete(charge.chargeType);
    }
    if (expected.size) throw new ConflictError('Requisition charge lines are incomplete');
  }

  async create(input: ReturnSlipInput, actor: RequisitionActor) {
    const validated = returnSlipBody.safeParse(input);
    if (!validated.success) throw new BadRequestError(validated.error.issues.map(issue => issue.message).join('; '));
    input = validated.data;
    return prisma.$transaction(async tx => {
      const initial = await tx.partRequisition.findUnique({ where: { id: input.requisitionId } });
      if (!initial) throw new NotFoundError('Requisition not found');
      assertRequisitionBranch(actor, initial.branchId);
      await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${initial.jobCardId} FOR UPDATE`;
      const job = await tx.jobCard.findUniqueOrThrow({ where: { id: initial.jobCardId }, include: { invoices: { select: { status: true } } } });
      assertRequisitionJob(job);
      const requisition = await tx.partRequisition.findUniqueOrThrow({ where: { id: initial.id }, include: { lines: { include: lineInclude } } });
      if (requisition.status !== 'ISSUED') throw new ConflictError('Cannot return parts of a cancelled requisition');
      const rows = input.lines.map(request => {
        const line = requisition.lines.find(row => row.id === request.requisitionLineId);
        if (!line) throw new BadRequestError('Return line does not belong to this requisition');
        this.assertIssuedLine(line, requisition);
        const returned = effectiveReturnedQuantity(line.partIssuance!.returns);
        assertReturnQuantity(line.quantityIssued, returned, request.quantity);
        return { line, request, returned };
      }).sort((a, b) => a.line.sparePartId.localeCompare(b.line.sparePartId));
      for (const { line } of rows) await tx.$queryRaw`SELECT id FROM "InventoryStock" WHERE "branchId" = ${requisition.branchId} AND "partId" = ${line.sparePartId} FOR UPDATE`;
      const now = new Date();
      const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Lagos', year: 'numeric' }).format(now));
      const returnNumber = await nextSequenceNumber(tx, `RETURN_${requisition.branchId}`, new Date(year, 6, 1));
      const slip = await tx.partReturnSlip.create({ data: { returnNumber, returnDate: now, branchId: requisition.branchId, jobCardId: job.id, requisitionId: requisition.id, createdById: actor.userId } });
      for (const { line, request, returned } of rows) {
        const returnedLine = await tx.partReturn.create({ data: { returnSlipId: slip.id, requisitionLineId: line.id, partIssuanceId: line.partIssuanceId!, returnedById: actor.userId, quantity: request.quantity, status: 'Completed', ...returnSnapshot(request.quantity, line.rate) } });
        await tx.inventoryStock.upsert({ where: { branchId_partId: { branchId: requisition.branchId, partId: line.sparePartId } }, create: { branchId: requisition.branchId, partId: line.sparePartId, quantity: request.quantity }, update: { quantity: { increment: request.quantity } } });
        await tx.stockTransaction.create({ data: { branchId: requisition.branchId, partId: line.sparePartId, type: 'RETURNED', quantity: request.quantity, referenceId: returnedLine.id, recordedById: actor.userId, notes: `Return slip ${returnNumber}` } });
        await this.updateCharges(tx, line, requisition.chargeType, returned + request.quantity);
      }
      await tx.jobCard.update({ where: { id: job.id }, data: requisitionWorkUpdate(job.status, actor.userId) });
      await tx.auditLog.create({ data: { userId: actor.userId, action: 'RETURN_SLIP_CREATED', details: JSON.stringify({ returnSlipId: slip.id, returnNumber, branchId: requisition.branchId, requisitionId: requisition.id, jobCardId: job.id, lines: rows.map(({ line, request, returned }) => ({ requisitionLineId: line.id, quantity: request.quantity, oldReturnedQuantity: returned, oldCharges: line.jobCardLines.map(charge => ({ id: charge.id, amount: charge.amount, quantity: charge.quantity })) })) }) } });
      return this.get(slip.id, actor, tx);
    }, { maxWait: 5000, timeout: 20000 });
  }

  async cancel(id: string, reason: string, actor: RequisitionActor) {
    if (!reason.trim()) throw new BadRequestError('Cancellation requires a reason');
    return prisma.$transaction(async tx => {
      const initial = await tx.partReturnSlip.findUnique({ where: { id } });
      if (!initial) throw new NotFoundError('Return slip not found');
      assertRequisitionBranch(actor, initial.branchId);
      await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${initial.jobCardId} FOR UPDATE`;
      const job = await tx.jobCard.findUniqueOrThrow({ where: { id: initial.jobCardId }, include: { invoices: { select: { status: true } } } });
      assertRequisitionJob(job);
      const slip = await tx.partReturnSlip.findUniqueOrThrow({ where: { id }, include: { requisition: true, lines: { include: { requisitionLine: { include: lineInclude } } } } });
      if (slip.status === 'CANCELLED') throw new ConflictError('Return slip is already cancelled');
      if (slip.requisition.status !== 'ISSUED') throw new ConflictError('Cannot cancel a return of a cancelled requisition');
      const rows = [...slip.lines].sort((a, b) => (a.requisitionLine?.sparePartId ?? '').localeCompare(b.requisitionLine?.sparePartId ?? ''));
      for (const row of rows) {
        const line = row.requisitionLine;
        if (!line) throw new ConflictError('Return is missing its requisition line');
        this.assertIssuedLine(line, slip.requisition);
        await tx.$queryRaw`SELECT id FROM "InventoryStock" WHERE "branchId" = ${slip.branchId} AND "partId" = ${line.sparePartId} FOR UPDATE`;
        const stock = await tx.inventoryStock.findUnique({ where: { branchId_partId: { branchId: slip.branchId, partId: line.sparePartId } } });
        if (!stock || stock.quantity - stock.reservedQuantity < row.quantity) throw new ConflictError('Insufficient available stock to cancel this return');
      }
      for (const row of rows) {
        const line = row.requisitionLine!;
        const returned = effectiveReturnedQuantity(line.partIssuance!.returns) - row.quantity;
        await this.updateCharges(tx, line, slip.requisition.chargeType, returned);
        await tx.inventoryStock.update({ where: { branchId_partId: { branchId: slip.branchId, partId: line.sparePartId } }, data: { quantity: { decrement: row.quantity } } });
        await tx.stockTransaction.create({ data: { branchId: slip.branchId, partId: line.sparePartId, type: 'ISSUED', quantity: -row.quantity, referenceId: row.id, recordedById: actor.userId, notes: `Cancel return slip ${slip.returnNumber}: ${reason.trim()}` } });
      }
      await tx.partReturn.updateMany({ where: { returnSlipId: id }, data: { status: 'CANCELLED' } });
      await tx.partReturnSlip.update({ where: { id }, data: { status: 'CANCELLED', cancelledById: actor.userId, cancelledAt: new Date(), cancelReason: reason.trim() } });
      await tx.jobCard.update({ where: { id: job.id }, data: requisitionWorkUpdate(job.status, actor.userId) });
      await tx.auditLog.create({ data: { userId: actor.userId, action: 'RETURN_SLIP_CANCELLED', details: JSON.stringify({ returnSlipId: id, branchId: slip.branchId, jobCardId: job.id, oldStatus: slip.status, reason: reason.trim(), lines: rows.map(row => ({ id: row.id, quantity: row.quantity, amount: row.amount?.toString() })) }) } });
      return this.get(id, actor, tx);
    }, { maxWait: 5000, timeout: 20000 });
  }
}
