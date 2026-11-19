import { ChargeType, JobCardType, Prisma } from '@prisma/client';
import { BadRequestError, ConflictError, ForbiddenError } from '../../shared/errors/appError';
import { lagosDay } from '../finance/credit-terms';
import { sumMoney } from '../finance/money';

/**
 * PDI documents have their own number series. Job and bill numbers are unique across all
 * documents, so PDI numbers carry a prefix in front of the usual YYYY###### serial.
 */
export const PDI_DOCUMENTS = {
  JOB_CARD: { key: 'PDI_JOB_CARD', prefix: 'P', perBranch: false },
  REQUISITION: { key: 'PDI_REQUISITION', prefix: 'P', perBranch: true },
  WARRANTY_REQUISITION: { key: 'PDI_WARRANTY_REQUISITION', prefix: 'PW', perBranch: true },
  RETURN: { key: 'PDI_RETURN', prefix: 'P', perBranch: true },
  LABOUR_SLIP: { key: 'PDI_LABOUR_SLIP', prefix: 'P', perBranch: true },
  BILL: { key: 'PDI_BILL', prefix: 'P', perBranch: false },
} as const;
export type PdiDocument = keyof typeof PDI_DOCUMENTS;

/** DocumentSequence key (without the year) for a PDI document. */
export function pdiSequenceKey(document: PdiDocument, branchId?: string): string {
  const { key, perBranch } = PDI_DOCUMENTS[document];
  if (!perBranch) return key;
  if (!branchId) throw new BadRequestError('A branch is required for this PDI number');
  return `${key}_${branchId}`;
}

export function pdiDocumentNumber(document: PdiDocument, serial: string): string {
  if (!/^\d{10}$/.test(serial)) throw new BadRequestError('Invalid document serial');
  return `${PDI_DOCUMENTS[document].prefix}${serial}`;
}

/** The requisition series for a charge type: warranty requisitions have their own. */
export function pdiRequisitionDocument(chargeType: ChargeType): PdiDocument {
  return chargeType === ChargeType.WARRANTY ? 'WARRANTY_REQUISITION' : 'REQUISITION';
}

/** A new vehicle has no plate: the PDI registration defaults to the last 6 characters of the VIN. */
export function pdiRegistrationFromVin(vin: string): string {
  const clean = vin.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!clean) throw new BadRequestError('Enter the VIN');
  return clean.slice(-6);
}

export type DefectAmounts = { spare?: number | null; oil?: number | null; labour?: number | null };

export function defectLineTotal(line: DefectAmounts): number {
  return sumMoney([line.spare ?? 0, line.oil ?? 0, line.labour ?? 0]);
}

export function defectTotals(lines: DefectAmounts[]) {
  return {
    spare: sumMoney(lines.map(line => line.spare ?? 0)),
    oil: sumMoney(lines.map(line => line.oil ?? 0)),
    labour: sumMoney(lines.map(line => line.labour ?? 0)),
    total: sumMoney(lines.map(defectLineTotal)),
  };
}

export type ServiceTypeFlags = { preDelivery: boolean; category?: string | null; code?: string | null };

/** A PDI service type: flagged pre-delivery, or in the PDI service category. */
export function isPdiServiceType(type: ServiceTypeFlags): boolean {
  return type.preDelivery || type.category?.trim().toUpperCase() === 'PDI';
}

/** A PDI job offers only PDI service types; a service job never offers them. */
export function assertServiceTypeForJob(jobType: JobCardType, type: ServiceTypeFlags) {
  const pdi = isPdiServiceType(type);
  if (jobType === JobCardType.PDI && !pdi) throw new BadRequestError('Choose a PDI service type for a PDI job card');
  if (jobType === JobCardType.SERVICE && pdi) throw new BadRequestError('PDI service types can only be used on a PDI job card. Open it from the PDI menu.');
}

export type ChargedAmount = { chargeType: ChargeType | string; amount: number };

/** Labour slip totals by charge type (legacy W/T/Q): warranty, non-warranty (paid), free and goodwill. */
export function chargeTypeTotals(lines: ChargedAmount[]) {
  const total = (type: ChargeType) => sumMoney(lines.filter(line => line.chargeType === type).map(line => line.amount));
  return {
    warranty: total(ChargeType.WARRANTY),
    nonWarranty: total(ChargeType.CUSTOMER),
    foc: total(ChargeType.FREE),
    goodwill: total(ChargeType.GOODWILL),
    total: sumMoney(lines.map(line => line.amount)),
  };
}

export const PDI_BILL_TYPES = ['CASH', 'INVOICE', 'ZERO'] as const;
export type PdiBillType = typeof PDI_BILL_TYPES[number];

/**
 * ZERO is allowed only when nothing is chargeable; a chargeable bill is CASH or INVOICE.
 * INVOICE bills are credit bills: stored with the existing CREDIT bill type so registers agree.
 */
export function assertPdiBillType(type: PdiBillType, chargeableTotal: number, input: { creditCompany?: string | null } = {}) {
  if (type === 'ZERO' && chargeableTotal !== 0) throw new BadRequestError('A zero bill is only allowed when nothing is chargeable');
  if (type !== 'ZERO' && chargeableTotal === 0) throw new BadRequestError('Nothing is chargeable on this PDI job. Create a zero bill.');
  if (type === 'INVOICE' && !input.creditCompany?.trim()) throw new BadRequestError('Enter the credit company for an invoice bill');
  return { storedBillType: type === 'INVOICE' ? 'CREDIT' : type };
}

/** Bill type as shown on PDI screens, from the stored bill type. */
export function pdiBillTypeOf(stored: string | null | undefined): PdiBillType {
  const value = stored?.toUpperCase();
  return value === 'CREDIT' ? 'INVOICE' : value === 'ZERO' ? 'ZERO' : 'CASH';
}

export function pdiPrintTitle(type: PdiBillType, titles: { invoiceTitle: string; cashMemoTitle: string }) {
  return type === 'INVOICE' ? titles.invoiceTitle : titles.cashMemoTitle;
}

/** Who may record documents on a job: PDI jobs need pdi:update; the PDI routes only take PDI jobs. */
export type JobTypeActor = { pdi?: boolean; pdiOnly?: boolean };
export function assertJobTypeAccess(job: { jobType: JobCardType }, actor: JobTypeActor) {
  if (job.jobType === JobCardType.PDI && !actor.pdi) throw new ForbiddenError('PDI documents require pdi:update. Record them from the PDI menu.');
  if (actor.pdiOnly && job.jobType !== JobCardType.PDI) throw new BadRequestError('This is not a PDI job card');
}

export type PdiLockedDocument = 'job' | 'requisition' | 'return' | 'labour' | 'bill';
export const PDI_DOCUMENT_LABELS: Record<PdiLockedDocument, string> = {
  job: 'PDI job card', requisition: 'PDI requisition', return: 'PDI requisition return', labour: 'PDI labour slip', bill: 'PDI bill',
};

/** No create or edit of a PDI document dated on or before its freeze date (business day in Lagos). */
export function assertNotFrozen(document: PdiLockedDocument, freezeDate: Date | null | undefined, documentDate: Date) {
  if (!freezeDate) return;
  const frozenUpTo = freezeDate.toISOString().slice(0, 10);
  if (lagosDay(documentDate) <= frozenUpTo)
    throw new ConflictError(`${PDI_DOCUMENT_LABELS[document]}s dated on or before ${frozenUpTo} are frozen`);
}

/** Edit rules before and after the first print. */
export function assertEditable(document: PdiLockedDocument, printedAt: Date | null | undefined, rules: { beforePrint: boolean; afterPrint: boolean }) {
  if (printedAt ? !rules.afterPrint : !rules.beforePrint)
    throw new ConflictError(`This ${PDI_DOCUMENT_LABELS[document]} cannot be changed ${printedAt ? 'after it has been printed' : 'before it is printed'}`);
}

/**
 * Job cards that belong in a vehicle's service history. PDI jobs stay out unless the company
 * setting includes them; old PDIs opened as service jobs are caught by their service type.
 */
export function serviceHistoryWhere(includePdi = false): Prisma.JobCardWhereInput {
  if (includePdi) return {};
  return {
    jobType: JobCardType.SERVICE,
    OR: [{ serviceTypeId: null }, {
      serviceType: {
        preDelivery: false,
        NOT: { code: { equals: 'PDI', mode: 'insensitive' } },
        // A null category is not PDI; NOT alone would drop it (NULL comparison).
        OR: [{ category: null }, { NOT: { category: { equals: 'PDI', mode: 'insensitive' } } }],
      },
    }],
  };
}

export type PdiCharge = {
  type: 'PART' | 'LABOUR' | 'SERVICE';
  chargeType: ChargeType | string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  /** A COMPANY service type pays the service charge itself. */
  companyPaid?: boolean;
};

/**
 * PDI bill lines: every issued part (net of returns), labour line and the service charge.
 * Only non-warranty (CUSTOMER) charges are chargeable; warranty, FOC and goodwill shares show at no charge.
 */
export function pdiBillLines<T extends PdiCharge>(charges: T[]) {
  return charges
    .filter(charge => charge.quantity > 0 && charge.amount >= 0)
    .map(charge => ({ ...charge, chargeable: !charge.companyPaid && charge.chargeType === ChargeType.CUSTOMER }));
}

export function pdiBillSplit(lines: { type: PdiCharge['type']; amount: number; chargeable: boolean }[]) {
  const chargeable = lines.filter(line => line.chargeable);
  return {
    partsTotal: sumMoney(chargeable.filter(line => line.type === 'PART').map(line => line.amount)),
    labourTotal: sumMoney(chargeable.filter(line => line.type === 'LABOUR').map(line => line.amount)),
    serviceTotal: sumMoney(chargeable.filter(line => line.type === 'SERVICE').map(line => line.amount)),
    chargeableTotal: sumMoney(chargeable.map(line => line.amount)),
    nonChargeableTotal: sumMoney(lines.filter(line => !line.chargeable).map(line => line.amount)),
  };
}

/** "Round PDI bill" off: the bill keeps its exact amount and no round-off line. */
export function withoutRoundOff<T extends { total: number; roundOff: number }>(totals: T, round: boolean): T {
  if (round) return totals;
  return { ...totals, total: sumMoney([totals.total, -totals.roundOff]), roundOff: 0 };
}
