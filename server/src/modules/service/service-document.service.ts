import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';
import { latestEstimateQuery } from './estimate-approval';
import { ServiceDocumentActor, assertDocumentBranch, projectPickingLines, remarksChange } from './service-document.logic';
import { serviceRemarksSchema } from './service-document.validation';

export type ServiceDocumentKind = 'job' | 'estimate';
const vehicleSelect = { registrationNumber: true, vin: true, model: true, trim: true } satisfies Prisma.VehicleSelect;
const customerSelect = { companyName: true, firstName: true, lastName: true } satisfies Prisma.CustomerSelect;
const jobSelect = { id: true, jobNumber: true, createdAt: true, status: true, branchId: true, remarks: true, customerRemarks: true, mileage: true, vehicle: { select: vehicleSelect }, customer: { select: customerSelect }, serviceType: { select: { code: true, description: true } } } satisfies Prisma.JobCardSelect;
const customerName = (customer: { companyName: string | null; firstName: string; lastName: string } | null) => customer ? customer.companyName || `${customer.firstName} ${customer.lastName}`.trim() : null;

export class ServiceDocumentService {
  private async document(db: Prisma.TransactionClient, kind: ServiceDocumentKind, id: string, actor: ServiceDocumentActor) {
    if (kind === 'job') {
      const job = await db.jobCard.findUnique({ where: { id }, select: jobSelect });
      if (!job) throw new NotFoundError('Job card not found');
      assertDocumentBranch(actor, job.branchId);
      return { id: job.id, branchId: job.branchId, remarks: job.remarks, customerRemarks: job.customerRemarks, context: { documentNumber: job.jobNumber, documentDate: job.createdAt, status: job.status, jobNumber: job.jobNumber, jobDate: job.createdAt, vehicle: job.vehicle, mileage: job.mileage, service: job.serviceType, customerName: customerName(job.customer) } };
    }
    const estimate = await db.estimate.findUnique({ where: { id }, select: { id: true, estimateNumber: true, estimateDate: true, createdAt: true, status: true, remarks: true, customerRemarks: true, branchId: true, jobCard: { select: jobSelect }, vehicle: { select: vehicleSelect }, customer: { select: customerSelect } } });
    if (!estimate) throw new NotFoundError('Estimate not found');
    const branchId = estimate.jobCard?.branchId ?? estimate.branchId;
    assertDocumentBranch(actor, branchId);
    if (estimate.branchId && estimate.branchId !== branchId) throw new BadRequestError('Estimate and job branches disagree');
    return { id: estimate.id, branchId, remarks: estimate.remarks, customerRemarks: estimate.customerRemarks, context: { documentNumber: estimate.estimateNumber, documentDate: estimate.estimateDate ?? estimate.createdAt, status: estimate.status, jobNumber: estimate.jobCard?.jobNumber ?? null, jobDate: estimate.jobCard?.createdAt ?? null, vehicle: estimate.jobCard?.vehicle ?? estimate.vehicle, mileage: estimate.jobCard?.mileage ?? null, service: estimate.jobCard?.serviceType ?? null, customerName: customerName(estimate.customer ?? estimate.jobCard?.customer ?? null) } };
  }

  /** Read branch-scoped remarks with minimal document context. */
  async getRemarks(kind: ServiceDocumentKind, id: string, actor: ServiceDocumentActor) {
    return this.document(prisma, kind, id, actor);
  }

  /** Amend internal notes and explicit customer explanations with old-value audit. */
  async updateRemarks(kind: ServiceDocumentKind, id: string, input: { remarks: string | null; customerRemarks?: string | null }, actor: ServiceDocumentActor) {
    const { remarks, customerRemarks } = serviceRemarksSchema.shape.body.parse(input);
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
      const customerChange = customerRemarks === undefined ? null : remarksChange(document.customerRemarks, customerRemarks);
      if (!change.changed && !customerChange?.changed) return document;
      const data = { remarks: change.newValue, ...(customerChange ? { customerRemarks: customerChange.newValue } : {}) };
      if (kind === 'job') await tx.jobCard.update({ where: { id }, data });
      else await tx.estimate.update({ where: { id }, data });
      await tx.auditLog.create({ data: { userId: actor.userId, action: kind === 'job' ? 'JOB_REMARKS_UPDATED' : 'ESTIMATE_REMARKS_UPDATED', details: JSON.stringify({ documentId: id, branchId: document.branchId, ...change, ...(customerChange?.changed ? { customerRemarks: customerChange } : {}) }) } });
      return { ...document, ...data };
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
