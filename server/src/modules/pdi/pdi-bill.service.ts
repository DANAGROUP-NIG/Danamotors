import { ChargeType, JobCardType, Prisma } from '@prisma/client';
import { syncStage } from '../service/job-stage.writer';
import prisma from '../../prisma/client';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import { nextSequenceNumber } from '../../shared/db/documentSequence';
import { getBranchSettings } from '../company-settings/company-settings.service';
import { creditDueDate, defaultCreditDays } from '../finance/credit-terms';
import { JobBillingService } from '../finance/job-billing.service';
import { money } from '../finance/money';
import { calculateBillWithPartsVat, partsVatSettings } from '../finance/parts-vat';
import { categoryOf } from '../reports/report.logic';
import { taxRegisterValues } from '../reports/tax-register-layout';
import { canonicalJobStatus } from '../service/job-card-workflow.service';
import { assertPdiBillType, pdiBillLines, pdiBillSplit, pdiBillTypeOf, pdiDocumentNumber, pdiPrintTitle, pdiSequenceKey, withoutRoundOff } from './pdi.logic';
import { assertPdiBranch, type PdiActor } from './pdi.service';
import { assertPdiDocumentChange, getPdiSettings } from './pdi.settings.service';
import type { PdiBillInput, PdiBillPreviewInput, PdiDocumentListQuery } from './pdi.validation';

type Db = Prisma.TransactionClient | typeof prisma;
const activeBill = (status: string) => !/cancel|void/i.test(status);

const billJobInclude = {
  branch: { select: { id: true, name: true } },
  customer: { select: { id: true, firstName: true, lastName: true, companyName: true, address: true, creditDays: true } },
  vehicle: { select: { id: true, vin: true, model: true, trim: true, registrationNumber: true, catalogue: { select: { description: true } } } },
  serviceType: { select: { id: true, code: true, description: true, chargedTo: true } },
  engineer: { select: { id: true, firstName: true, lastName: true } },
  bay: { select: { id: true, code: true, description: true } },
  lines: {
    where: { kind: 'PART', requisitionLine: { requisition: { status: 'ISSUED' } } },
    include: { sparePart: true, requisitionLine: { select: { requisition: { select: { requisitionNumber: true } } } } },
    orderBy: { createdAt: 'asc' },
  },
  labourLines: { include: { chargeLine: true, labourItem: { select: { code: true } }, labourSlip: { select: { slipNumber: true } } }, orderBy: { createdAt: 'asc' } },
  invoices: { select: { id: true, status: true } },
} satisfies Prisma.JobCardInclude;
type BillJob = Prisma.JobCardGetPayload<{ include: typeof billJobInclude }>;

/** Bill lines built only from the job's requisitions (net of returns), labour and service charge. */
function chargesOf(job: BillJob) {
  const companyPaid = job.serviceType?.chargedTo === 'COMPANY';
  return pdiBillLines([
    ...job.lines.map(line => ({
      type: 'PART' as const, chargeType: line.chargeType, description: line.description, quantity: line.quantity, rate: line.rate, amount: money(line.amount),
      jobCardLineId: line.id, partId: line.sparePartId, partNumber: line.sparePart?.partNumber ?? null, partSource: line.partSource,
      reference: line.requisitionLine?.requisition.requisitionNumber ?? null, taxable: line.taxable, taxCategory: line.sparePart ? categoryOf(line.sparePart) : 'OTHER',
    })),
    ...job.labourLines.map(line => ({
      type: 'LABOUR' as const, chargeType: line.chargeLine?.chargeType ?? ChargeType.CUSTOMER, description: line.description,
      quantity: line.chargeLine?.quantity ?? line.hours, rate: line.chargeLine?.rate ?? line.rate, amount: money(line.chargeLine?.amount ?? line.amount),
      jobCardLineId: line.chargeLine?.id, jobCardLabourId: line.id, partId: null, partNumber: line.labourItem.code, partSource: null,
      reference: line.labourSlip?.slipNumber ?? null, taxable: true, taxCategory: 'LABOUR',
    })),
    ...(job.serviceCharge ? [{
      type: 'SERVICE' as const, chargeType: ChargeType.CUSTOMER, companyPaid, description: `${job.serviceType?.description ?? 'PDI'} service charge`,
      quantity: 1, rate: money(Number(job.serviceCharge)), amount: money(Number(job.serviceCharge)), jobCardLineId: undefined, partId: null, partNumber: job.serviceType?.code ?? null, partSource: null,
      reference: null, taxable: true, taxCategory: 'SERVICE',
    }] : []),
  ]);
}

export class PdiBillService {
  private async loadJob(db: Db, jobCardId: string, actor: PdiActor) {
    const job = await db.jobCard.findUnique({ where: { id: jobCardId }, include: billJobInclude });
    if (!job || job.jobType !== JobCardType.PDI) throw new NotFoundError('PDI job card not found');
    assertPdiBranch(actor, job.branchId);
    return job;
  }

  private assertBillable(job: BillJob) {
    if (canonicalJobStatus(job.status) !== 'READY') throw new BadRequestError('Only a PDI job marked vehicle ready can be billed');
    if (job.billedAt || job.invoices.some(invoice => activeBill(invoice.status))) throw new ConflictError('This PDI job already has an active bill');
  }

  private async totals(db: Db, job: BillJob, discounts: { partsDiscountPercent: number; labourDiscountPercent: number }) {
    const lines = chargesOf(job);
    const split = pdiBillSplit(lines);
    const [branch, tax, settings] = await Promise.all([getBranchSettings(job.branchId, db as Prisma.TransactionClient), partsVatSettings(db as Prisma.TransactionClient), getPdiSettings(db)]);
    const { totals, breakdown } = calculateBillWithPartsVat({
      partsTotal: split.partsTotal, labourTotal: split.labourTotal, serviceTotal: split.serviceTotal,
      ...discounts, vatRate: branch.labourVatPercent, roundOffValue: branch.roundOffValue,
    }, lines.filter(line => line.type === 'PART').map(line => ({ amount: line.amount, category: line.taxCategory, taxable: line.taxable, customerPaid: line.chargeable })), tax.enabled, tax.rates);
    return { lines, split, totals: withoutRoundOff(totals, settings.roundBill), breakdown, settings };
  }

  /** Live totals for the bill page; amounts come from the job and cannot be edited. */
  async preview(input: PdiBillPreviewInput, actor: PdiActor) {
    const job = await this.loadJob(prisma, input.jobCardId, actor);
    this.assertBillable(job);
    const { lines, split, totals, breakdown } = await this.totals(prisma, job, input);
    return {
      job: { id: job.id, jobNumber: job.jobNumber, pdiRegistration: job.pdiRegistration, createdAt: job.createdAt, vehicle: job.vehicle, customer: job.customer, engineer: job.engineer, bay: job.bay, serviceType: job.serviceType, branch: job.branch },
      lines, split, totals, vatBreakdown: breakdown,
      suggestedBillType: split.chargeableTotal === 0 ? 'ZERO' as const : 'CASH' as const,
    };
  }

  async create(input: PdiBillInput, actor: PdiActor) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const invoice = await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${input.jobCardId} FOR UPDATE`;
          const job = await this.loadJob(tx, input.jobCardId, actor);
          this.assertBillable(job);
          const issuedDate = new Date();
          await assertPdiDocumentChange(tx, 'bill', issuedDate, { create: true });
          if (!job.customerId || !job.customer) throw new BadRequestError('The PDI job card has no customer');
          const advisor = await tx.user.findFirst({ where: { id: input.deliveryAdvisorId, branchId: job.branchId, isActive: true, role: { name: ROLES.SERVICE_ADVISOR } }, select: { id: true } });
          if (!advisor) throw new BadRequestError('Select an active delivery service adviser in this branch').withCode('FIELD_VALIDATION', { field: 'deliveryAdvisorId' });
          const { lines, split, totals, breakdown } = await this.totals(tx, job, input);
          const { storedBillType } = assertPdiBillType(input.billType, split.chargeableTotal, input);
          const invoiceNumber = pdiDocumentNumber('BILL', await nextSequenceNumber(tx, pdiSequenceKey('BILL'), issuedDate));
          const dueDate = input.billType === 'INVOICE' ? creditDueDate(issuedDate, job.customer.creditDays ?? await defaultCreditDays(tx)) : issuedDate;
          const created = await tx.invoice.create({
            data: {
              customerId: job.customerId, jobCardId: job.id, invoiceNumber, billType: storedBillType,
              creditCompany: input.billType === 'INVOICE' ? input.creditCompany?.trim() : null,
              cardNumber: input.billType === 'INVOICE' ? input.cardNumber?.trim() || null : null,
              vatBreakdown: { create: breakdown },
              taxRegisterSnapshot: { version: 1, source: 'PDI_BILLING', values: taxRegisterValues({ ...totals, vatBreakdown: breakdown }).values },
              issuedDate, dueDate,
              subtotal: split.chargeableTotal, tax: totals.vatAmount, total: totals.total, outstandingAmount: totals.total,
              partsTotal: totals.partsTotal, labourTotal: totals.labourTotal, serviceTotal: totals.serviceTotal,
              partsDiscountPercent: input.partsDiscountPercent, labourDiscountPercent: input.labourDiscountPercent,
              partsDiscountAmount: totals.partsDiscountAmount, labourDiscountAmount: totals.labourDiscountAmount,
              vatRate: totals.vatRate, vatAmount: totals.vatAmount, roundOff: totals.roundOff,
              serviceAdvisorId: advisor.id, notes: input.remarks?.trim() || null,
              status: totals.total === 0 ? 'Paid' : 'Unpaid',
              // Like service bills, the bill stores its chargeable lines; warranty/FOC shares stay on the job.
              lines: { createMany: { data: lines.filter(line => line.chargeable).map(line => ({
                type: line.type, jobCardLineId: line.jobCardLineId, partId: line.partId, partSource: line.partSource,
                jobCardLabourId: 'jobCardLabourId' in line ? line.jobCardLabourId : undefined,
                description: line.description, quantity: line.quantity, rate: line.rate, amount: line.amount, customerPaid: true,
              })) } },
            },
          });
          await tx.jobCard.update({
            where: { id: job.id },
            data: {
              billedAt: issuedDate, status: 'BILLED', deliveryAdvisorId: advisor.id,
              statusHistory: { create: { fromStatus: job.status, toStatus: 'BILLED', actorId: actor.userId, remarks: `PDI bill ${invoiceNumber} (${input.billType})` } },
            },
          });
          await syncStage(tx, job.id, actor.userId);
          // Billing completes the PDI on the vehicle.
          if (job.vehicleId) await tx.vehicle.update({ where: { id: job.vehicleId }, data: { pdiDone: true, pdiDate: issuedDate } });
          await tx.auditLog.create({ data: { userId: actor.userId, action: 'PDI_BILL_CREATED', details: JSON.stringify({ invoiceId: created.id, invoiceNumber, jobCardId: job.id, billType: input.billType, total: totals.total, chargeable: split.chargeableTotal }) } });
          return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
        return this.get(invoice.id, actor);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt + Math.floor(Math.random() * 100)));
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2028', 'P2024'].includes(error.code))
          throw new AppError('Billing could not finish while the database was busy. Refresh the PDI job to check whether a bill exists before trying again.', 503);
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
          throw new ConflictError('This PDI job changed or was billed meanwhile. Refresh and try again.');
        throw error;
      }
    }
  }

  async get(id: string, actor: PdiActor) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { createdAt: 'asc' } }, vatBreakdown: true,
        customer: { select: { id: true, firstName: true, lastName: true, companyName: true, address: true, phoneNumber: true } },
        serviceAdvisor: { select: { id: true, firstName: true, lastName: true } },
        cancelledBy: { select: { firstName: true, lastName: true } },
        jobCard: { include: billJobInclude },
      },
    });
    if (!invoice?.jobCard || invoice.jobCard.jobType !== JobCardType.PDI) throw new NotFoundError('PDI bill not found');
    assertPdiBranch(actor, invoice.jobCard.branchId);
    const settings = await getPdiSettings();
    const type = pdiBillTypeOf(invoice.billType);
    const tallyLog = await prisma.tallyPostingLog.findFirst({ where: { documentType: 'JOB_BILL', documentId: id }, orderBy: { createdAt: 'desc' }, select: { status: true, voucherNumber: true, batchId: true, postedAt: true } });
    const { jobCard, ...bill } = invoice;
    return {
      ...bill,
      pdiBillType: type,
      printTitle: pdiPrintTitle(type, settings),
      // Voucher details: the accounts posting of this bill.
      voucher: { number: bill.tallyVoucherNo ?? tallyLog?.voucherNumber ?? null, type: 'Sales', status: bill.tallyPostedAt ? 'POSTED' : tallyLog?.status ?? (settings.postBillsToTally && bill.total !== 0 ? 'PENDING' : 'NOT_POSTED'), postedAt: bill.tallyPostedAt ?? tallyLog?.postedAt ?? null },
      job: { id: jobCard.id, jobNumber: jobCard.jobNumber, pdiRegistration: jobCard.pdiRegistration, createdAt: jobCard.createdAt, mileage: jobCard.mileage, vehicle: jobCard.vehicle, engineer: jobCard.engineer, bay: jobCard.bay, serviceType: jobCard.serviceType, branch: jobCard.branch },
      jobLines: chargesOf(jobCard),
    };
  }

  /** Cancels a PDI bill (not posted to Tally, no receipts) and reopens the job as READY. */
  async cancel(id: string, reason: string, actor: PdiActor) {
    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { jobCard: { select: { jobType: true, branchId: true } }, issuedDate: true, printedAt: true } });
    if (!invoice?.jobCard || invoice.jobCard.jobType !== JobCardType.PDI) throw new NotFoundError('PDI bill not found');
    assertPdiBranch(actor, invoice.jobCard.branchId);
    await assertPdiDocumentChange(prisma, 'bill', invoice.issuedDate, { printedAt: invoice.printedAt });
    await new JobBillingService().cancelJobBill(id, actor.userId, reason, { pdi: true });
    return this.get(id, actor);
  }

  async list(query: PdiDocumentListQuery, actor: PdiActor) {
    assertPdiBranch(actor, query.branchId);
    const branchId = actor.allBranches ? query.branchId : actor.branchId!;
    const where: Prisma.InvoiceWhereInput = {
      jobCard: { jobType: JobCardType.PDI, ...(branchId ? { branchId } : {}), ...(query.jobCardId ? { id: query.jobCardId } : {}) },
      ...(query.dateFrom || query.dateTo ? { issuedDate: { ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00+01:00`) } : {}), ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999+01:00`) } : {}) } } : {}),
      ...(query.search ? { OR: [{ invoiceNumber: { contains: query.search, mode: 'insensitive' } }, { jobCard: { jobNumber: { contains: query.search, mode: 'insensitive' } } }, { jobCard: { vehicle: { vin: { contains: query.search, mode: 'insensitive' } } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where, orderBy: [{ issuedDate: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit,
        select: {
          id: true, invoiceNumber: true, billType: true, issuedDate: true, total: true, status: true, tallyVoucherNo: true, tallyPostedAt: true, cancelledAt: true,
          customer: { select: { firstName: true, lastName: true, companyName: true } },
          jobCard: { select: { id: true, jobNumber: true, pdiRegistration: true, vehicle: { select: { vin: true, model: true } } } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);
    return { items: rows.map(row => ({ ...row, pdiBillType: pdiBillTypeOf(row.billType) })), meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
  }
}
