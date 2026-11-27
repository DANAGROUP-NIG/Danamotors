import { JobCardType, Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import { notifyWorkshopEvent } from '../notification/workshop-notifications';
import { NotificationService } from '../notification/notification.service';
import { assertCampaignAttendance, completeCampaignVehiclesForJobCard } from '../campaign/campaign.hooks';
import { canonicalJobStatus, jobStatusFilter, JobCardWorkflowService } from '../service/job-card-workflow.service';
import { resolveJobComplaints } from '../service/job-card-complaints';
import { syncStage } from '../service/job-stage.writer';
import { requireMaster } from '../workshop/workshop-master.service';
import { resolveVehicleWorkshopModel } from '../workshop/service-type.repository';
import { ServiceTypeService } from '../workshop/service-type.service';
import { VehicleService } from '../vehicle/vehicle.service';
import { sumMoney } from '../finance/money';
import { requisitionFooter } from '../requisition/requisition.logic';
import { chargeTypeTotals, defectTotals, pdiBillTypeOf, pdiPrintTitle, type PdiLockedDocument } from './pdi.logic';
import { assertPdiDocumentChange, getPdiSettings } from './pdi.settings.service';
import type { PdiDocumentListQuery, PdiListQuery, PdiOpenInput, PdiUpdateInput, PdiVehicleInput } from './pdi.validation';

export interface PdiActor {
  userId: string;
  branchId?: string | null;
  allBranches: boolean;
}

type Db = Prisma.TransactionClient | typeof prisma;
const CLOSED = ['BILLED', 'DELIVERED', 'CANCELLED'];

export function assertPdiBranch(actor: PdiActor, branchId?: string | null) {
  if (!actor.allBranches && (!actor.branchId || (branchId && branchId !== actor.branchId)))
    throw new ForbiddenError('You can only access PDI documents in your branch');
}

/** Branch filter for list queries: the actor's branch unless they may see every branch. */
function branchScope(actor: PdiActor, branchId?: string) {
  assertPdiBranch(actor, branchId);
  return actor.allBranches ? branchId : actor.branchId!;
}

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00+01:00`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999+01:00`) } : {}),
  };
}

const person = { select: { id: true, firstName: true, lastName: true } } as const;
const master = { select: { id: true, code: true, description: true } } as const;

const detailInclude = {
  branch: { select: { id: true, name: true } },
  customer: { select: { id: true, firstName: true, lastName: true, companyName: true, phoneNumber: true, address: true } },
  vehicle: {
    select: {
      id: true, vin: true, registrationNumber: true, make: true, model: true, trim: true, engineNumber: true, color: true,
      pdiDone: true, pdiDate: true, tyres: true, batteryMake: true, batteryNumber: true, saleDate: true,
      catalogue: { select: { id: true, code: true, description: true, attributes: true, parent: { select: { description: true } } } },
      colour: master,
    },
  },
  serviceType: master, bay: master, team: master,
  engineer: person, serviceAdvisor: person, deliveryAdvisor: person, technician: person,
  complaints: { orderBy: { id: 'asc' }, include: { complaintCode: { select: { id: true, code: true, description: true, parent: { select: { description: true } } } } } },
  statusHistory: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { firstName: true, lastName: true } } } },
  requisitions: {
    orderBy: [{ requisitionDate: 'asc' }, { id: 'asc' }],
    include: {
      engineer: person, group: master,
      lines: { orderBy: { createdAt: 'asc' }, include: { sparePart: { select: { partNumber: true } }, returns: { select: { quantity: true, status: true } } } },
    },
  },
  returnSlips: {
    orderBy: [{ returnDate: 'asc' }, { id: 'asc' }],
    include: { requisition: { select: { requisitionNumber: true } }, lines: { include: { partIssuance: { select: { sparePart: { select: { partNumber: true, name: true } } } } } } },
  },
  labourSlips: {
    orderBy: [{ slipDate: 'asc' }, { id: 'asc' }],
    include: { engineer: person, group: master, lines: { orderBy: { createdAt: 'asc' }, include: { labourItem: { select: { code: true } }, technician: person, group: master, chargeLine: { select: { chargeType: true, amount: true } } } } },
  },
  invoices: { orderBy: { issuedDate: 'desc' }, select: { id: true, invoiceNumber: true, billType: true, status: true, total: true, issuedDate: true, cancelledAt: true, tallyVoucherNo: true, tallyPostedAt: true, printedAt: true } },
} satisfies Prisma.JobCardInclude;

export type PdiJobDetail = Prisma.JobCardGetPayload<{ include: typeof detailInclude }>;

function customerName(customer: { firstName: string; lastName: string; companyName: string | null } | null) {
  if (!customer) return null;
  return customer.companyName || `${customer.firstName} ${customer.lastName}`.trim();
}

/** A PDI job, locked for update, that can still take work. */
export async function lockOpenPdiJob(tx: Prisma.TransactionClient, id: string, actor: PdiActor) {
  await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`;
  const job = await tx.jobCard.findUnique({ where: { id }, include: { invoices: { select: { status: true } } } });
  if (!job || job.jobType !== JobCardType.PDI) throw new NotFoundError('PDI job card not found');
  assertPdiBranch(actor, job.branchId);
  if (job.billedAt || CLOSED.includes(canonicalJobStatus(job.status)))
    throw new BadRequestError('This PDI job card is billed, delivered or cancelled');
  return job;
}

async function requireStaff(tx: Prisma.TransactionClient, id: string, branchId: string, role: string, field: string) {
  const user = await tx.user.findFirst({ where: { id, branchId, isActive: true, role: { name: role } }, select: { id: true } });
  if (!user) throw new BadRequestError('Select an active staff member with the required role in this branch').withCode('FIELD_VALIDATION', { field });
}

async function resolveTyres(tx: Prisma.TransactionClient, tyres: { makeId?: string; number?: string }[]) {
  const padded = [...tyres, ...Array.from({ length: 5 - tyres.length }, () => ({}))] as { makeId?: string; number?: string }[];
  return Promise.all(padded.map(async tyre => ({
    makeId: tyre.makeId ?? '',
    make: tyre.makeId ? (await requireMaster(tx, tyre.makeId, 'TYRE_MAKE')).description : '',
    number: tyre.number ?? '',
  })));
}

export class PdiService {
  /** PDI service types (pre-delivery) with the model charge, for the vehicle. */
  serviceTypes(vehicleId: string, date?: string) {
    return new ServiceTypeService().options(vehicleId, date ? new Date(`${date}T00:00:00Z`) : new Date(), prisma, JobCardType.PDI);
  }

  /** Active PDI defects with their group and the vehicle model's estimate. */
  async defects(query: { search?: string; vehicleId?: string; limit: number }) {
    const [defects, modelId] = await Promise.all([
      prisma.workshopMaster.findMany({
        where: { kind: 'PDI_DEFECT', active: true, ...(query.search ? { OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ] } : {}) },
        select: { id: true, code: true, description: true, parent: { select: { description: true } } },
        orderBy: { code: 'asc' }, take: query.limit,
      }),
      query.vehicleId ? resolveVehicleWorkshopModel(query.vehicleId) : null,
    ]);
    const estimates = modelId && defects.length ? await prisma.defectModelEstimate.findMany({
      where: { modelId, defectId: { in: defects.map(defect => defect.id) } },
      select: { defectId: true, partAmount: true, oilAmount: true, labourAmount: true },
    }) : [];
    const byDefect = new Map(estimates.map(({ defectId, ...amounts }) => [defectId, amounts]));
    return defects.map(({ parent, ...defect }) => ({ ...defect, group: parent?.description ?? null, estimate: byDefect.get(defect.id) ?? null }));
  }

  /** Finds a vehicle by VIN (exact, or by its ending) for the PDI opening screen. */
  async findVehicles(vin: string) {
    const vehicles = await prisma.vehicle.findMany({
      where: { OR: [{ vin }, { vin: { endsWith: vin, mode: 'insensitive' } }] },
      select: {
        id: true, vin: true, registrationNumber: true, make: true, model: true, trim: true, engineNumber: true, color: true,
        pdiDone: true, pdiDate: true, saleDate: true, tyres: true, batteryMake: true, batteryNumber: true, lastRecordedMileage: true,
        catalogue: { select: { id: true, description: true, attributes: true } }, colour: master,
        customer: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        jobCards: { where: { jobType: JobCardType.PDI }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, jobNumber: true, status: true, createdAt: true } },
      },
      take: 10, orderBy: { vin: 'asc' },
    });
    return vehicles.map(({ jobCards, ...vehicle }) => ({ ...vehicle, pdiJobs: jobCards }));
  }

  /** A new vehicle from the catalogue (variant, colour) for a PDI. It has no plate yet. */
  async createVehicle(input: PdiVehicleInput, actorId: string) {
    if (await prisma.vehicle.findUnique({ where: { vin: input.vin }, select: { id: true } }))
      throw new ConflictError('A vehicle with this VIN already exists. Search for it instead.');
    return new VehicleService().createVehicle({
      vin: input.vin, catalogueId: input.catalogueId, colourId: input.colourId, engineNumber: input.engineNumber,
      keyNumber: input.keyNumber, manufactureMonth: input.manufactureMonth, manufactureYear: input.manufactureYear,
      parkedAt: 'STOCKYARD', createdById: actorId,
    }, { requireRegistration: false });
  }

  async open(input: PdiOpenInput, actor: PdiActor) {
    assertPdiBranch(actor, input.branchId);
    const settings = await getPdiSettings();
    const customerId = input.customerId ?? settings.defaultCustomerId;
    if (!customerId) throw new BadRequestError('Choose the PDI customer, or set the default PDI customer in PDI settings').withCode('FIELD_VALIDATION', { field: 'customerId' });
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, isActive: true }, select: { name: true } });
    if (!branch) throw new NotFoundError('Active branch not found');
    const { branchId: _branchId, defects, pdiRegistration, tyres, ...fields } = input;
    const card = await new JobCardWorkflowService().open({
      ...fields,
      customerId,
      branchName: branch.name,
      description: input.description?.trim() || 'Pre-delivery inspection',
      complaints: defects.map(({ defectId, ...line }) => ({ ...line, complaintCodeId: defectId })),
      tyres: tyres ? [...tyres, ...Array.from({ length: 5 - tyres.length }, () => ({}))] : undefined,
      createdById: actor.userId,
    }, { jobType: JobCardType.PDI, pdiRegistration });
    return this.get(card.id, actor);
  }

  async list(query: PdiListQuery, actor: PdiActor) {
    const branchId = branchScope(actor, query.branchId);
    const where: Prisma.JobCardWhereInput = {
      jobType: JobCardType.PDI,
      branchId,
      ...(query.status ? { status: jobStatusFilter(query.status) } : {}),
      ...(query.vin ? { vehicle: { vin: { contains: query.vin, mode: 'insensitive' } } } : {}),
      ...(dateRange(query.dateFrom, query.dateTo) ? { createdAt: dateRange(query.dateFrom, query.dateTo) } : {}),
      ...(query.search ? { OR: [
        { jobNumber: { contains: query.search, mode: 'insensitive' } },
        { pdiRegistration: { contains: query.search, mode: 'insensitive' } },
        { vehicle: { vin: { contains: query.search, mode: 'insensitive' } } },
        { vehicle: { model: { contains: query.search, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [rows, total, counts] = await Promise.all([
      prisma.jobCard.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit,
        select: {
          id: true, jobNumber: true, pdiRegistration: true, status: true, createdAt: true, promisedAt: true, readyAt: true, billedAt: true, mileage: true,
          branch: { select: { name: true } }, serviceType: master, engineer: person,
          customer: { select: { firstName: true, lastName: true, companyName: true } },
          vehicle: { select: { id: true, vin: true, model: true, trim: true, color: true, pdiDone: true, catalogue: { select: { description: true } } } },
          _count: { select: { complaints: true, requisitions: true, labourSlips: true } },
        },
      }),
      prisma.jobCard.count({ where }),
      prisma.jobCard.groupBy({ by: ['status'], where: { jobType: JobCardType.PDI, branchId }, _count: { _all: true } }),
    ]);
    const statusCounts: Record<string, number> = {};
    for (const row of counts) {
      const status = canonicalJobStatus(row.status);
      statusCounts[status] = (statusCounts[status] ?? 0) + row._count._all;
    }
    return {
      items: rows.map(row => ({ ...row, status: canonicalJobStatus(row.status), customerName: customerName(row.customer) })),
      statusCounts,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async get(id: string, actor: PdiActor, db: Db = prisma) {
    const job = await db.jobCard.findUnique({ where: { id }, include: detailInclude });
    if (!job || job.jobType !== JobCardType.PDI) throw new NotFoundError('PDI job card not found');
    assertPdiBranch(actor, job.branchId);
    const settings = await getPdiSettings(db);
    const status = canonicalJobStatus(job.status);
    const activeBill = job.invoices.find(invoice => !/cancel|void/i.test(invoice.status));
    const activeRequisitions = job.requisitions.filter(row => row.status !== 'CANCELLED');
    const activeReturns = job.returnSlips.filter(row => row.status !== 'CANCELLED');
    const labourLines = job.labourSlips.flatMap(slip => slip.lines.map(line => ({ chargeType: line.chargeLine?.chargeType ?? 'CUSTOMER', amount: line.amount })));
    const open = !job.billedAt && !CLOSED.includes(status);
    return {
      ...job,
      // Money as numbers for the PDI screens.
      serviceCharge: job.serviceCharge?.toNumber() ?? null,
      complaints: job.complaints.map(line => ({ ...line, spare: line.spare.toNumber(), oil: line.oil.toNumber(), labour: line.labour.toNumber() })),
      status,
      customerName: customerName(job.customer),
      defectTotals: defectTotals(job.complaints),
      requisitions: job.requisitions.map(row => ({ ...row, totals: requisitionFooter(row.lines) })),
      returnSlips: job.returnSlips.map(row => ({
        ...row,
        totals: {
          numberOfItems: row.lines.length,
          netQuantityReturned: row.lines.reduce((sum, line) => sum + line.quantity, 0),
          totalAmount: sumMoney(row.lines.map(line => line.amount?.toNumber() ?? 0)),
        },
      })),
      labourSlips: job.labourSlips.map(slip => ({ ...slip, totals: chargeTypeTotals(slip.lines.map(line => ({ chargeType: line.chargeLine?.chargeType ?? 'CUSTOMER', amount: line.amount }))) })),
      invoices: job.invoices.map(invoice => ({ ...invoice, pdiBillType: pdiBillTypeOf(invoice.billType), printTitle: pdiPrintTitle(pdiBillTypeOf(invoice.billType), settings) })),
      summary: {
        requisitions: activeRequisitions.length,
        partsIssuedAmount: sumMoney(activeRequisitions.map(row => requisitionFooter(row.lines).totalAmount)),
        returnsAmount: sumMoney(activeReturns.flatMap(row => row.lines.map(line => line.amount?.toNumber() ?? 0))),
        labour: chargeTypeTotals(labourLines),
        billId: activeBill?.id ?? null,
      },
      actions: {
        canEdit: open,
        canWork: open,
        canMarkWorkDone: ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS'].includes(status),
        canMarkReady: ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'QC'].includes(status),
        canBill: status === 'READY' && !activeBill,
        canCancel: open,
      },
    };
  }

  async update(id: string, input: PdiUpdateInput, actor: PdiActor) {
    await prisma.$transaction(async tx => {
      const job = await lockOpenPdiJob(tx, id, actor);
      await assertPdiDocumentChange(tx, 'job', job.createdAt, { printedAt: job.printedAt });
      if (input.bayId) await requireMaster(tx, input.bayId, 'BAY');
      if (input.teamId) await requireMaster(tx, input.teamId, 'TEAM');
      if (input.engineerId) await requireStaff(tx, input.engineerId, job.branchId, ROLES.ENGINEER, 'engineerId');
      if (input.technicianId) await requireStaff(tx, input.technicianId, job.branchId, ROLES.TECHNICIAN, 'technicianId');
      if ((input.teamId === null && !(input.technicianId ?? job.technicianId)) || (input.technicianId === null && !(input.teamId ?? job.teamId)))
        throw new BadRequestError('Select a group or a technician');
      if (input.mileage !== undefined && input.mileage < (job.mileage ?? 0)) throw new BadRequestError('Mileage cannot go below the reading at opening');
      const data: Prisma.JobCardUncheckedUpdateInput = {
        pdiRegistration: input.pdiRegistration, mileage: input.mileage, bayId: input.bayId, engineerId: input.engineerId,
        teamId: input.teamId, technicianId: input.technicianId, remarks: input.remarks,
        promisedAt: input.promisedAt ? new Date(input.promisedAt) : undefined,
        batteryNumber: input.batteryNumber,
      };
      if (input.batteryMakeId !== undefined) data.batteryMake = input.batteryMakeId ? (await requireMaster(tx, input.batteryMakeId, 'BATTERY_MAKE')).description : null;
      if (input.tyres) data.tyres = await resolveTyres(tx, input.tyres) as unknown as Prisma.InputJsonValue;
      if (input.defects) {
        const lines = await resolveJobComplaints(tx, input.defects.map(({ defectId, ...line }) => ({ ...line, complaintCodeId: defectId })), 'PDI_DEFECT');
        await tx.jobComplaint.deleteMany({ where: { jobCardId: id } });
        await tx.jobComplaint.createMany({ data: lines.map(line => ({ ...line, jobCardId: id })) });
      }
      await tx.jobCard.update({ where: { id }, data });
      if (job.vehicleId && (input.tyres || input.batteryMakeId !== undefined || input.batteryNumber !== undefined))
        await tx.vehicle.update({ where: { id: job.vehicleId }, data: { tyres: data.tyres, batteryMake: data.batteryMake as string | null | undefined, batteryNumber: input.batteryNumber } });
      if (input.mileage !== undefined && job.vehicleId)
        await tx.vehicle.updateMany({ where: { id: job.vehicleId, OR: [{ lastRecordedMileage: null }, { lastRecordedMileage: { lt: input.mileage } }] }, data: { lastRecordedMileage: input.mileage, lastMileageAt: new Date() } });
      await tx.auditLog.create({ data: { userId: actor.userId, action: 'PDI_JOB_UPDATED', details: JSON.stringify({ jobCardId: id, fields: Object.keys(input) }) } });
    }, { maxWait: 5000, timeout: 15000 });
    return this.get(id, actor);
  }

  /** Work done: the work is recorded and the job goes to QC (through IN_PROGRESS when still open). */
  async workDone(id: string, workDone: string | undefined, actor: PdiActor) {
    const transitionId = await prisma.$transaction(async tx => {
      const job = await lockOpenPdiJob(tx, id, actor);
      await assertPdiDocumentChange(tx, 'job', job.createdAt, { printedAt: job.printedAt });
      return this.moveToQc(tx, job, actor.userId, workDone);
    }, { maxWait: 5000, timeout: 15000 });
    if (transitionId) await notifyWorkshopEvent('JOB_SENT_FOR_QC', id, transitionId);
    return this.get(id, actor);
  }

  private async moveToQc(tx: Prisma.TransactionClient, job: { id: string; status: string; workDone: string | null }, actorId: string, workDone?: string) {
    const from = canonicalJobStatus(job.status);
    if (!['OPEN', 'IN_PROGRESS', 'WAITING_PARTS'].includes(from)) {
      if (from === 'QC') return null;
      throw new BadRequestError(`Work done cannot be recorded on a ${from} PDI job`);
    }
    const history: Prisma.JobCardStatusHistoryCreateManyInput[] = [];
    if (from === 'OPEN') history.push({ jobCardId: job.id, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', actorId, remarks: 'PDI work started' });
    history.push({ jobCardId: job.id, fromStatus: from === 'OPEN' ? 'IN_PROGRESS' : from, toStatus: 'QC', actorId, remarks: 'PDI work done' });
    await tx.jobCardStatusHistory.createMany({ data: history });
    await tx.jobCard.update({ where: { id: job.id }, data: { status: 'QC', qcStatus: 'PENDING', workDone: workDone?.trim() || job.workDone || 'PDI work done', completedAt: new Date() } });
    // PDI keeps its own screens; its stage still follows its status.
    await syncStage(tx, job.id, actorId);
    const last = await tx.jobCardStatusHistory.findFirst({ where: { jobCardId: job.id, toStatus: 'QC' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    return last?.id ?? null;
  }

  /** Vehicle ready: the PDI is the inspection, so QC is recorded as passed and the job is READY. */
  async vehicleReady(id: string, remarks: string | undefined, actor: PdiActor) {
    const card = await prisma.$transaction(async tx => {
      const job = await lockOpenPdiJob(tx, id, actor);
      await assertPdiDocumentChange(tx, 'job', job.createdAt, { printedAt: job.printedAt });
      await this.moveToQc(tx, job, actor.userId);
      await assertCampaignAttendance(tx, id, actor.userId);
      await completeCampaignVehiclesForJobCard(tx, id);
      const now = new Date();
      await tx.jobCardStatusHistory.create({ data: { jobCardId: id, fromStatus: 'QC', toStatus: 'READY', actorId: actor.userId, remarks: remarks?.trim() || 'PDI vehicle ready' } });
      const ready = await tx.jobCard.update({ where: { id }, data: { status: 'READY', qcStatus: 'PASSED', qcNotes: remarks?.trim() || 'PDI inspection passed', readyAt: now } });
      await syncStage(tx, id, actor.userId);
      return ready;
    }, { maxWait: 5000, timeout: 15000 });
    const last = await prisma.jobCardStatusHistory.findFirst({ where: { jobCardId: id, toStatus: 'READY' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (last) await notifyWorkshopEvent('JOB_READY', id, last.id);
    await new NotificationService().notifyRole(ROLES.BILLING_OFFICER, card.branchId, {
      type: 'JOB_CARD_READY_FOR_BILLING', title: 'PDI ready for billing',
      message: `PDI job card ${card.jobNumber} is ready to be billed.`, link: `/pdi/${card.id}/bill`, branchId: card.branchId,
    });
    return this.get(id, actor);
  }

  /** Cancels a PDI job with no issued parts or labour left on it. */
  async cancel(id: string, reason: string, actor: PdiActor) {
    await prisma.$transaction(async tx => {
      const job = await lockOpenPdiJob(tx, id, actor);
      await assertPdiDocumentChange(tx, 'job', job.createdAt, { printedAt: job.printedAt });
      const [requisitions, labour] = await Promise.all([
        tx.partRequisition.count({ where: { jobCardId: id, status: { not: 'CANCELLED' }, lines: { some: { quantityIssued: { gt: 0 } } } } }),
        tx.jobCardLabour.count({ where: { jobCardId: id } }),
      ]);
      if (requisitions || labour) throw new ConflictError('Cancel the PDI requisitions and remove the labour before cancelling the PDI job card');
      const from = canonicalJobStatus(job.status);
      await tx.jobCardStatusHistory.create({ data: { jobCardId: id, fromStatus: from, toStatus: 'CANCELLED', actorId: actor.userId, remarks: reason.trim() } });
      await tx.jobCard.update({ where: { id }, data: { status: 'CANCELLED' } });
      await syncStage(tx, id, actor.userId, { note: reason });
      await tx.auditLog.create({ data: { userId: actor.userId, action: 'PDI_JOB_CANCELLED', details: JSON.stringify({ jobCardId: id, from, reason: reason.trim() }) } });
    }, { maxWait: 5000, timeout: 15000 });
    return this.get(id, actor);
  }

  /** Records the first print of a PDI document; edit-after-print rules apply from then. */
  async markPrinted(kind: PdiLockedDocument, id: string, actor: PdiActor) {
    const now = new Date();
    const jobOf = async (jobCardId: string) => {
      const job = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { jobType: true, branchId: true } });
      if (!job || job.jobType !== JobCardType.PDI) throw new NotFoundError('PDI document not found');
      assertPdiBranch(actor, job.branchId);
    };
    if (kind === 'job') {
      await jobOf(id);
      await prisma.jobCard.updateMany({ where: { id, printedAt: null }, data: { printedAt: now } });
    } else if (kind === 'requisition') {
      const row = await prisma.partRequisition.findUnique({ where: { id }, select: { jobCardId: true } });
      if (!row) throw new NotFoundError('PDI requisition not found');
      await jobOf(row.jobCardId);
      await prisma.partRequisition.updateMany({ where: { id, printedAt: null }, data: { printedAt: now } });
    } else if (kind === 'return') {
      const row = await prisma.partReturnSlip.findUnique({ where: { id }, select: { jobCardId: true } });
      if (!row) throw new NotFoundError('PDI return not found');
      await jobOf(row.jobCardId);
      await prisma.partReturnSlip.updateMany({ where: { id, printedAt: null }, data: { printedAt: now } });
    } else if (kind === 'labour') {
      const row = await prisma.labourSlip.findUnique({ where: { id }, select: { jobCardId: true } });
      if (!row) throw new NotFoundError('PDI labour slip not found');
      await jobOf(row.jobCardId);
      await prisma.labourSlip.updateMany({ where: { id, printedAt: null }, data: { printedAt: now } });
    } else {
      const row = await prisma.invoice.findUnique({ where: { id }, select: { jobCardId: true } });
      if (!row?.jobCardId) throw new NotFoundError('PDI bill not found');
      await jobOf(row.jobCardId);
      await prisma.invoice.updateMany({ where: { id, printedAt: null }, data: { printedAt: now } });
    }
    return { kind, id, printedAt: now };
  }

  /** PDI registers: requisitions, returns and labour slips of PDI jobs. */
  async requisitions(query: PdiDocumentListQuery, actor: PdiActor) {
    const branchId = branchScope(actor, query.branchId);
    const where: Prisma.PartRequisitionWhereInput = {
      branchId, jobCardId: query.jobCardId, jobCard: { jobType: JobCardType.PDI },
      ...(dateRange(query.dateFrom, query.dateTo) ? { requisitionDate: dateRange(query.dateFrom, query.dateTo) } : {}),
      ...(query.search ? { OR: [{ requisitionNumber: { contains: query.search, mode: 'insensitive' } }, { jobCard: { jobNumber: { contains: query.search, mode: 'insensitive' } } }, { jobCard: { vehicle: { vin: { contains: query.search, mode: 'insensitive' } } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.partRequisition.findMany({
        where, orderBy: [{ requisitionDate: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit,
        include: { jobCard: { select: { id: true, jobNumber: true, pdiRegistration: true, vehicle: { select: { vin: true, model: true } } } }, engineer: person, lines: { include: { returns: { select: { quantity: true, status: true } } } } },
      }),
      prisma.partRequisition.count({ where }),
    ]);
    return { items: rows.map(({ lines, ...row }) => ({ ...row, totals: requisitionFooter(lines) })), meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
  }

  async returns(query: PdiDocumentListQuery, actor: PdiActor) {
    const branchId = branchScope(actor, query.branchId);
    const where: Prisma.PartReturnSlipWhereInput = {
      branchId, jobCardId: query.jobCardId, jobCard: { jobType: JobCardType.PDI },
      ...(dateRange(query.dateFrom, query.dateTo) ? { returnDate: dateRange(query.dateFrom, query.dateTo) } : {}),
      ...(query.search ? { OR: [{ returnNumber: { contains: query.search, mode: 'insensitive' } }, { jobCard: { jobNumber: { contains: query.search, mode: 'insensitive' } } }, { requisition: { requisitionNumber: { contains: query.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.partReturnSlip.findMany({
        where, orderBy: [{ returnDate: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit,
        include: { jobCard: { select: { id: true, jobNumber: true, pdiRegistration: true, vehicle: { select: { vin: true, model: true } } } }, requisition: { select: { requisitionNumber: true, chargeType: true } }, lines: { select: { quantity: true, amount: true } } },
      }),
      prisma.partReturnSlip.count({ where }),
    ]);
    return {
      items: rows.map(({ lines, ...row }) => ({ ...row, totals: { numberOfItems: lines.length, netQuantityReturned: lines.reduce((sum, line) => sum + line.quantity, 0), totalAmount: sumMoney(lines.map(line => line.amount?.toNumber() ?? 0)) } })),
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async labourSlips(query: PdiDocumentListQuery, actor: PdiActor) {
    const branchId = branchScope(actor, query.branchId);
    const where: Prisma.LabourSlipWhereInput = {
      branchId, jobCardId: query.jobCardId, jobCard: { jobType: JobCardType.PDI },
      ...(dateRange(query.dateFrom, query.dateTo) ? { slipDate: dateRange(query.dateFrom, query.dateTo) } : {}),
      ...(query.search ? { OR: [{ slipNumber: { contains: query.search, mode: 'insensitive' } }, { jobCard: { jobNumber: { contains: query.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.labourSlip.findMany({
        where, orderBy: [{ slipDate: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit,
        include: { jobCard: { select: { id: true, jobNumber: true, pdiRegistration: true, status: true, vehicle: { select: { vin: true, model: true } } } }, engineer: person, group: master, lines: { select: { amount: true, chargeLine: { select: { chargeType: true } } } } },
      }),
      prisma.labourSlip.count({ where }),
    ]);
    return {
      items: rows.map(({ lines, ...row }) => ({ ...row, lineCount: lines.length, totals: chargeTypeTotals(lines.map(line => ({ chargeType: line.chargeLine?.chargeType ?? 'CUSTOMER', amount: line.amount }))) })),
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  /** A vehicle's PDI jobs, for the PDI tab of the vehicle page (pdi:read). */
  async vehiclePdiJobs(vehicleId: string, actor: PdiActor) {
    const rows = await prisma.jobCard.findMany({
      where: { vehicleId, jobType: JobCardType.PDI, ...(actor.allBranches ? {} : { branchId: actor.branchId ?? '' }) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, jobNumber: true, pdiRegistration: true, status: true, createdAt: true, readyAt: true, billedAt: true, mileage: true,
        branch: { select: { name: true } }, serviceType: master, engineer: person,
        complaints: { select: { description: true, spare: true, oil: true, labour: true } },
        invoices: { select: { invoiceNumber: true, billType: true, total: true, status: true } },
      },
    });
    return rows.map(row => ({ ...row, status: canonicalJobStatus(row.status), defectTotals: defectTotals(row.complaints) }));
  }
}
