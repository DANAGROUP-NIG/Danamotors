import { ChargeType, Prisma } from '@prisma/client';
import { BadRequestError, ForbiddenError } from '../../shared/errors/appError';
import { lineAmount, money, sumMoney } from '../finance/money';

export interface RequisitionActor {
  userId: string;
  branchId?: string | null;
  allBranches: boolean;
  goodwill: boolean;
}

export function assertRequisitionBranch(actor: RequisitionActor, branchId?: string) {
  if (!actor.allBranches && (!actor.branchId || (branchId && branchId !== actor.branchId))) {
    throw new ForbiddenError('You can only access requisitions in your branch');
  }
}

export function assertRequisitionJob(job: { status: string; billedAt: Date | null; invoices: { status: string }[] }) {
  if (job.billedAt || ['BILLED', 'DELIVERED', 'CANCELLED', 'CANCELED', 'CLOSED'].includes(job.status.toUpperCase()) ||
      job.invoices.some(invoice => !/cancel|void/i.test(invoice.status))) {
    throw new BadRequestError('Requisitions cannot change on billed, delivered or cancelled jobs');
  }
}

export function requisitionWorkUpdate(status: string, userId: string): Prisma.JobCardUpdateInput {
  if (!['READY', 'COMPLETED'].includes(status.toUpperCase())) return { qcStatus: 'PENDING' };
  // TODO(confirm): changing issued work on a ready job reopens it for another QC.
  return {
    qcStatus: 'PENDING', status: 'IN_PROGRESS', readyAt: null,
    statusHistory: { create: { fromStatus: status, toStatus: 'IN_PROGRESS', actorId: userId, remarks: 'Requisition changed; repeat quality check before marking ready' } },
  };
}

export function requisitionAmounts(type: ChargeType, quantity: number, rate: number, approval?: number, customer?: number) {
  if (!Number.isInteger(quantity) || quantity < 0) throw new BadRequestError('Issued quantity must be a non-negative integer');
  const amount = quantity === 0 ? 0 : lineAmount(quantity, rate);
  if (!Number.isFinite(rate) || rate < 0) throw new BadRequestError('Set a valid part rate');
  const split = type === ChargeType.WARRANTY || type === ChargeType.GOODWILL;
  if (!split && (approval !== undefined || customer !== undefined)) throw new BadRequestError('Customer and free requisitions do not take a split');
  if (type === ChargeType.WARRANTY) {
    if ((approval !== undefined && approval !== 100) || (customer !== undefined && customer !== 0)) throw new BadRequestError('Warranty must be approved 100/0');
    approval = 100;
    customer = 0;
  }
  if (split && (approval === undefined || customer === undefined || !Number.isFinite(approval) || !Number.isFinite(customer) ||
      approval < 0 || customer < 0 || approval > 100 || customer > 100 ||
      new Prisma.Decimal(approval).plus(customer).toNumber() !== 100 ||
      new Prisma.Decimal(approval).decimalPlaces() > 2 || new Prisma.Decimal(customer).decimalPlaces() > 2)) {
    throw new BadRequestError('Approval and customer percentages must add to 100');
  }
  const approvedAmount = split ? money(new Prisma.Decimal(amount).times(approval!).div(100).toNumber()) : 0;
  const customerAmount = type === ChargeType.CUSTOMER ? amount : split ? money(new Prisma.Decimal(amount).minus(approvedAmount).toNumber()) : 0;
  const approvedQuantity = split ? new Prisma.Decimal(quantity).times(approval!).div(100).toNumber() : quantity;
  const charges: { chargeType: ChargeType; quantity: number; rate: number; amount: number }[] = [];
  if (quantity > 0) {
    if (!split || approval! > 0) charges.push({ chargeType: type, quantity: approvedQuantity, rate, amount: split ? approvedAmount : amount });
    if (split && customer! > 0) charges.push({ chargeType: ChargeType.CUSTOMER, quantity: new Prisma.Decimal(quantity).minus(approvedQuantity).toNumber(), rate, amount: customerAmount });
  }
  return { amount, approvedAmount, customerAmount, approvalPercent: split ? approval! : null, customerPercent: split ? customer! : null, charges };
}

export function requisitionFooter(lines: { quantityIssued: number; amount: Prisma.Decimal; approvedAmount: Prisma.Decimal; returns: { quantity: number; status: string }[] }[]) {
  return {
    numberOfItems: lines.length,
    netQuantityIssued: lines.reduce((sum, line) => sum + line.quantityIssued - line.returns.filter(row => !['REJECTED', 'CANCELLED'].includes(row.status.toUpperCase())).reduce((total, row) => total + row.quantity, 0), 0),
    totalAmount: sumMoney(lines.map(line => line.amount.toNumber())),
    approvedAmount: sumMoney(lines.map(line => line.approvedAmount.toNumber())),
  };
}
