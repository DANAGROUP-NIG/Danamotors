import { ChargeType, Prisma } from '@prisma/client';
import { assertRequisitionBranch, assertRequisitionJob, requisitionAmounts, requisitionFooter, requisitionWorkUpdate } from './requisition.logic';
import { requisitionBody } from './requisition.validation';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { readFileSync } from 'fs';
import path from 'path';

const actor = { userId: 'actor', branchId: 'home', allBranches: false, goodwill: false };

describe('Requisition rules', () => {
  it.each([ChargeType.CUSTOMER, ChargeType.WARRANTY, ChargeType.FREE])('allocates %s charges', type => {
    const result = requisitionAmounts(type, 3, 100.01);
    expect(result.amount).toBe(300.03);
    expect(result.charges).toHaveLength(1);
    expect(result.charges[0].chargeType).toBe(type);
    expect(result.charges[0].amount).toBe(300.03);
  });

  it.each([0, 10, 30, 50, 100, 33.33])('reconciles goodwill at %s percent including rounding', percent => {
    const result = requisitionAmounts(ChargeType.GOODWILL, 3, 100.01, percent, new Prisma.Decimal(100).minus(percent).toNumber());
    expect(new Prisma.Decimal(result.approvedAmount).plus(result.customerAmount).toNumber()).toBe(result.amount);
    expect(result.charges.reduce((sum, charge) => sum.plus(charge.amount), new Prisma.Decimal(0)).toNumber()).toBe(300.03);
    expect(result.charges.reduce((sum, charge) => sum.plus(charge.quantity), new Prisma.Decimal(0)).toNumber()).toBe(3);
  });

  it('requires warranty 100/0 and rejects missing/invalid shares or split on customer/free', () => {
    expect(() => requisitionAmounts(ChargeType.WARRANTY, 1, 1, 30, 70)).toThrow('100/0');
    expect(() => requisitionAmounts(ChargeType.GOODWILL, 1, 1)).toThrow('add to 100');
    expect(() => requisitionAmounts(ChargeType.GOODWILL, 1, 1, 30, 60)).toThrow('add to 100');
    expect(() => requisitionAmounts(ChargeType.GOODWILL, 1, 1, 33.333, 66.667)).toThrow('add to 100');
    expect(() => requisitionAmounts(ChargeType.CUSTOMER, 1, 1, 0, 100)).toThrow('do not take a split');
    expect(() => requisitionAmounts(ChargeType.FREE, 1, 1, 100, 0)).toThrow('do not take a split');
    expect(() => requisitionAmounts(ChargeType.CUSTOMER, -1, 1)).toThrow('non-negative integer');
    expect(() => requisitionAmounts(ChargeType.CUSTOMER, 1, Infinity)).toThrow();
  });

  it('keeps request-only lines uncharged', () => {
    expect(requisitionAmounts(ChargeType.CUSTOMER, 0, 100)).toMatchObject({ amount: 0, charges: [] });
  });

  it.each(['BILLED', 'Billed', 'DELIVERED', 'Closed', 'CANCELLED', 'Cancelled'])('rejects closed job %s', status => {
    expect(() => assertRequisitionJob({ status, billedAt: null, invoices: [] })).toThrow('cannot change');
  });

  it('allows ready/unbilled work but refuses an active invoice or billed timestamp', () => {
    expect(() => assertRequisitionJob({ status: 'READY', billedAt: null, invoices: [{ status: 'Cancelled' }] })).not.toThrow();
    expect(() => assertRequisitionJob({ status: 'OPEN', billedAt: null, invoices: [{ status: 'Paid' }] })).toThrow();
    expect(() => assertRequisitionJob({ status: 'OPEN', billedAt: new Date(), invoices: [] })).toThrow();
  });

  it('reopens ready jobs for QC when requisitions change issued work', () => {
    expect(requisitionWorkUpdate('READY', 'actor')).toMatchObject({ qcStatus: 'PENDING', status: 'IN_PROGRESS', readyAt: null, statusHistory: { create: { actorId: 'actor' } } });
    expect(requisitionWorkUpdate('OPEN', 'actor')).toEqual({ qcStatus: 'PENDING' });
  });

  it('requires branch:all for another branch and does not allow branchless users', () => {
    expect(() => assertRequisitionBranch(actor, 'other')).toThrow('your branch');
    expect(() => assertRequisitionBranch({ ...actor, branchId: null })).toThrow();
    expect(() => assertRequisitionBranch({ ...actor, allBranches: true }, 'other')).not.toThrow();
  });

  it('sums decimal snapshots and net returns, excluding cancelled returns', () => {
    const decimal = (value: number) => new Prisma.Decimal(value);
    expect(requisitionFooter([{ quantityIssued: 3, amount: decimal(300.03), approvedAmount: decimal(90.01), returns: [{ quantity: 1, status: 'Completed' }, { quantity: 1, status: 'CANCELLED' }] }])).toEqual({ numberOfItems: 1, netQuantityIssued: 2, totalAmount: 300.03, approvedAmount: 90.01 });
  });

  it('rejects duplicate source records and caller-supplied rates/numbers', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const line = { sparePartId: id, quantityRequired: 2, quantityIssued: 1 };
    const input = { branchId: id, jobCardId: id, chargeType: ChargeType.CUSTOMER, lines: [line] };
    expect(requisitionBody.safeParse(input).success).toBe(true);
    expect(requisitionBody.safeParse({ ...input, lines: [line, line] }).success).toBe(false);
    expect(requisitionBody.safeParse({ ...input, lines: [{ ...line, rate: 0 }] }).success).toBe(false);
    expect(requisitionBody.safeParse({ ...input, requisitionNumber: 'manual' }).success).toBe(false);
  });
});

it('keeps permission migration grants equal to ROLE_PERMISSIONS and store grants separate from goodwill', () => {
  const sql = readFileSync(path.join(__dirname, '../../../prisma/migrations/20261021110000_requisition_permissions/migration.sql'), 'utf8');
  const grants = [...sql.matchAll(/\('([^']+)', '(requisition:[^']+)'\)/g)].map(match => `${match[1]}:${match[2]}`).sort();
  const expected = Object.entries(ROLE_PERMISSIONS).flatMap(([role, permissions]) => permissions.filter(permission => permission.startsWith('requisition:')).map(permission => `${role}:${permission}`)).sort();
  expect(grants).toEqual(expected);
  for (const role of [ROLES.GENERAL_STORE_MANAGER, ROLES.BRANCH_STORE_MANAGER]) {
    expect(ROLE_PERMISSIONS[role]).toEqual(expect.arrayContaining([PERMISSIONS.REQUISITION_READ, PERMISSIONS.REQUISITION_CREATE, PERMISSIONS.REQUISITION_CANCEL]));
    expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.REQUISITION_GOODWILL);
    expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.JOBLABOUR_UPDATE);
  }
});
