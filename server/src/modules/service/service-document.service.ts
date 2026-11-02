import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { latestEstimateQuery } from './estimate-approval';
import { ServiceDocumentActor, assertDocumentBranch, projectPickingLines, remarksChange } from './service-document.logic';
import { serviceRemarksSchema } from './service-document.validation';

export type ServiceDocumentKind = 'job' | 'estimate';
const jobSelect = { id: true, jobNumber: true, createdAt: true, branchId: true, remarks: true, mileage: true, vehicle: { select: { registrationNumber: true, vin: true, model: true, trim: true } }, serviceType: { select: { code: true, description: true } } } satisfies Prisma.JobCardSelect;

export class ServiceDocumentService {
  private async document(db: Prisma.TransactionClient, kind: ServiceDocumentKind, id: string, actor: ServiceDocumentActor) {
    if (kind === 'job') {
      const job = await db.jobCard.findUnique({ where: { id }, select: jobSelect });
      if (!job) throw new NotFoundError('Job card not found');
      assertDocumentBranch(actor, job.branchId);
      return { id: job.id, branchId: job.branchId, remarks: job.remarks };
    }
    const estimate = await db.estimate.findUnique({ where: { id }, select: { id: true, remarks: true, branchId: true, jobCard: { select: { branchId: true } } } });
    if (!estimate) throw new NotFoundError('Estimate not found');
    const branchId = estimate.jobCard?.branchId ?? estimate.branchId;
    assertDocumentBranch(actor, branchId);
    if (estimate.branchId && estimate.branchId !== branchId) throw new BadRequestError('Estimate and job branches disagree');
    return { id: estimate.id, branchId, remarks: estimate.remarks };
  }

  async getRemarks(kind: ServiceDocumentKind, id: string, actor: ServiceDocumentActor) {
    return this.document(prisma, kind, id, actor);
  }

  async updateRemarks(kind: ServiceDocumentKind, id: string, input: { remarks: string | null }, actor: ServiceDocumentActor) {
    const { remarks } = serviceRemarksSchema.shape.body.parse(input);
    return prisma.$transaction(async tx => {
      // Match normal estimate writes: lock the job first, then its estimate.
      if (kind === 'job') await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`;
      else {
        const parent = await tx.estimate.findUnique({ where: { id }, select: { jobCardId: true } });
        if (parent?.jobCardId) await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${parent.jobCardId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Estimate" WHERE id = ${id} FOR UPDATE`;
      }
      const document = await this.document(tx, kind, id, actor);
      const change = remarksChange(document.remarks, remarks);
      if (!change.changed) return document;
      if (kind === 'job') await tx.jobCard.update({ where: { id }, data: { remarks: change.newValue } });
      else await tx.estimate.update({ where: { id }, data: { remarks: change.newValue } });
      await tx.auditLog.create({ data: { userId: actor.userId, action: kind === 'job' ? 'JOB_REMARKS_UPDATED' : 'ESTIMATE_REMARKS_UPDATED', details: JSON.stringify({ documentId: id, branchId: document.branchId, ...change }) } });
      return { ...document, remarks: change.newValue };
    });
  }

  async pickingPrint(kind: ServiceDocumentKind, id: string, actor: ServiceDocumentActor) {
    return prisma.$transaction(async tx => {
      const document = await this.document(tx, kind, id, actor);
      // TODO(confirm): job picking uses the latest estimate's planned parts, never issued payer shares.
      const estimate = kind === 'estimate'
        ? await tx.estimate.findUnique({ where: { id }, include: { lines: { orderBy: { id: 'asc' } } } })
        : await tx.estimate.findFirst({ where: { jobCardId: id }, orderBy: latestEstimateQuery.orderBy, include: { lines: { orderBy: { id: 'asc' } } } });
      if (!estimate) throw new BadRequestError('Create an estimate before printing a picking list');
      if (estimate.branchId && estimate.branchId !== document.branchId) throw new BadRequestError('Estimate and job branches disagree');
      const job = estimate.jobCardId ? await tx.jobCard.findUnique({ where: { id: estimate.jobCardId }, select: jobSelect }) : null;
      const vehicle = job?.vehicle ?? (estimate.vehicleId ? await tx.vehicle.findUnique({ where: { id: estimate.vehicleId }, select: { registrationNumber: true, vin: true, model: true, trim: true } }) : null);
      const parts = await tx.sparePart.findMany({ where: { id: { in: estimate.lines.filter(line => ['PART', 'INCLUDED_PART'].includes(line.type)).flatMap(line => line.referenceId ? [line.referenceId] : []) } }, select: { id: true, partNumber: true, uom: true } });
      const branch = await tx.branch.findUnique({ where: { id: document.branchId! }, select: { id: true, name: true, address: true, phoneNumber: true } });
      const print = { branch, job: job ? { id: job.id, number: job.jobNumber, date: job.createdAt, mileage: job.mileage, service: job.serviceType, remarks: job.remarks } : null, estimate: { id: estimate.id, number: estimate.estimateNumber, date: estimate.estimateDate ?? estimate.createdAt, version: estimate.version, currency: estimate.currency, status: estimate.status, remarks: estimate.remarks }, vehicle, ...projectPickingLines(estimate.lines, parts), printedAt: new Date().toISOString(), timeZone: 'Africa/Lagos' };
      await tx.auditLog.create({ data: { userId: actor.userId, action: 'PICKING_LIST_PRINTED', details: JSON.stringify({ documentId: id, kind, branchId: document.branchId, estimateId: estimate.id, estimateVersion: estimate.version }) } });
      return print;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
