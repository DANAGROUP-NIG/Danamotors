import type { ChargeType, PrismaClient } from '@prisma/client';
import type { ReturnSlipService } from './return-slip.service';
import type { RequisitionService } from './requisition.service';
import type { RequisitionActor } from './requisition.logic';
import type { JobBillingService } from '../finance/job-billing.service';
import type { JobCardLineService } from '../job-card-line/jobCardLine.service';
import type { InventoryService } from '../inventory/inventory.service';

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(60000);

describeDb('Item return slips on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let returns: ReturnSlipService;
  let requisitions: RequisitionService;
  let actor: RequisitionActor;
  let branchId: string;
  let otherBranchId: string;
  let customerId: string;
  let advisorId: string;
  let partId: string;
  let secondPartId: string;
  let campaignId: string;
  let sequence = 0;
  const run = `${Date.now()}`;

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('Return-slip tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    returns = new (require('./return-slip.service').ReturnSlipService)();
    requisitions = new (require('./requisition.service').RequisitionService)();
    branchId = (await db.branch.create({ data: { name: `Return fixture ${run}` } })).id;
    otherBranchId = (await db.branch.create({ data: { name: `Return other ${run}` } })).id;
    const role = await db.role.upsert({ where: { name: 'ServiceAdviser' }, update: {}, create: { name: 'ServiceAdviser' } });
    const user = await db.user.create({ data: { firstName: 'Return', lastName: 'Fixture', email: `return-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: role.id, branchId } });
    advisorId = user.id;
    actor = { userId: user.id, branchId, allBranches: false, goodwill: true };
    customerId = (await db.customer.create({ data: { firstName: 'Synthetic', lastName: 'Return', branchId } })).id;
    partId = (await db.sparePart.create({ data: { partCode: `RET1-${run}`, partNumber: `RET1-${run}`, name: 'Original source', unitPrice: 100.01, retailRate: 100.01, warrantyRate: 80, warrantyApplicable: true, partFlag: 'O' } })).id;
    secondPartId = (await db.sparePart.create({ data: { partCode: `RET2-${run}`, partNumber: `RET2-${run}`, name: 'Local source', unitPrice: 50, retailRate: 50, warrantyApplicable: true, partFlag: 'L' } })).id;
    await db.inventoryStock.createMany({ data: [{ branchId, partId, quantity: 1000, reservedQuantity: 2 }, { branchId, partId: secondPartId, quantity: 1000 }] });
    campaignId = (await db.campaign.create({ data: { code: `RET-${run}`, title: 'Return test campaign', type: 'FREE_FIX', status: 'ACTIVE', startDate: new Date() } })).id;
  });

  afterAll(async () => { await db?.$disconnect(); });

  async function issue(type: ChargeType = 'GOODWILL', multi = false, quantity = 3) {
    const job = await db.jobCard.create({ data: { branchId, customerId, jobNumber: `RET-${run}-${++sequence}`, description: 'Return test job', status: 'OPEN', warrantyStatusAtCreation: 'ACTIVE' } });
    await db.estimate.create({ data: {
      branchId, jobCardId: job.id, customerId, description: 'Synthetic approved scope', amount: 20000, status: 'Approved',
      lines: { create: [{ type: 'PART', referenceId: partId, description: 'Original source', quantity: 100, rate: 100.01, amount: 10001 }, { type: 'PART', referenceId: secondPartId, description: 'Local source', quantity: 100, rate: 50, amount: 5000 }] },
      approvals: { create: { customerId, approved: true, status: 'Approved', signatureRequired: false, overrideReason: 'Synthetic test approval' } },
    } });
    if (type === 'FREE') await db.jobCardCampaign.create({ data: { jobCardId: job.id, campaignId, campaignCode: `RET-${run}`, campaignTitle: 'Return test campaign', campaignType: 'FREE_FIX' } });
    const share = type === 'GOODWILL' ? { approvalPercent: 30, customerPercent: 70 } : {};
    const document = await requisitions.create({ branchId, jobCardId: job.id, chargeType: type, campaignId: type === 'FREE' ? campaignId : undefined, goodwillReason: type === 'GOODWILL' ? 'Synthetic approved contribution' : undefined, lines: [
      { sparePartId: partId, quantityRequired: Math.max(quantity, 1), quantityIssued: quantity, ...share },
      ...(multi ? [{ sparePartId: secondPartId, quantityRequired: 2, quantityIssued: 2, ...share }] : []),
    ] }, actor);
    return { job, document, line: document.lines.find(line => line.sparePartId === partId)! };
  }

  const stock = async (id = partId) => (await db.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId, partId: id } } })).quantity;
  const charges = (jobCardId: string) => db.jobCardLine.findMany({ where: { jobCardId }, orderBy: { chargeType: 'asc' } });
  const create = (requisitionId: string, requisitionLineId: string, quantity = 1, who = actor) => returns.create({ requisitionId, lines: [{ requisitionLineId, quantity }] }, who);

  it('restores stock, reduces both goodwill shares, and bills the saved remaining customer amount', async () => {
    const { job, document, line } = await issue();
    const before = await stock();
    await db.sparePart.update({ where: { id: partId }, data: { retailRate: 999 } });
    try {
      const slip = await create(document.id, line.id);
      expect(slip.returnNumber).toMatch(/^\d{10}$/);
      expect(slip.requisition.chargeType).toBe('GOODWILL');
      expect(slip.totals).toEqual({ numberOfItems: 1, netQuantityReturned: 1, totalAmount: 100.01 });
      expect(slip.lines[0].rate?.toNumber()).toBe(100.01);
      expect(await stock()).toBe(before + 1);
      expect((await charges(job.id)).map(row => row.amount).sort((a, b) => a - b)).toEqual([60.01, 140.01]);
      const sync: JobCardLineService = new (require('../job-card-line/jobCardLine.service').JobCardLineService)();
      await db.$transaction(tx => sync.syncLines(tx, job.id));
      await db.jobCard.update({ where: { id: job.id }, data: { status: 'READY' } });
      const billing: JobBillingService = new (require('../finance/job-billing.service').JobBillingService)();
      const invoice = await billing.createJobBill({ jobCardId: job.id, serviceAdvisorId: advisorId, actorId: actor.userId, partsDiscountPercent: 0, labourDiscountPercent: 0 });
      expect(invoice.partsTotal).toBe(140.01);
      expect(invoice.lines).toHaveLength(1);
      expect(invoice.lines[0].amount).toBe(140.01);
      await expect(create(document.id, line.id)).rejects.toThrow('cannot change');
      await expect(returns.cancel(slip.id, 'Too late', actor)).rejects.toThrow('cannot change');
      expect(await stock()).toBe(before + 1);
    } finally { await db.sparePart.update({ where: { id: partId }, data: { retailRate: 100.01 } }); }
  });

  it.each(['CUSTOMER', 'WARRANTY', 'GOODWILL', 'FREE'] as const)('round-trips a full %s return without losing rate, tax or campaign snapshots', async type => {
    const { job, document, line } = await issue(type);
    const before = await stock();
    const original = await charges(job.id);
    const slip = await create(document.id, line.id, 3);
    expect(await stock()).toBe(before + 3);
    const zero = await charges(job.id);
    expect(zero).toHaveLength(original.length);
    expect(zero.every(row => row.quantity === 0 && row.amount === 0)).toBe(true);
    if (type === 'CUSTOMER') {
      await db.jobCard.update({ where: { id: job.id }, data: { status: 'READY' } });
      const billing: JobBillingService = new (require('../finance/job-billing.service').JobBillingService)();
      await expect(billing.previewJobBill({ jobCardId: job.id, partsDiscountPercent: 0, labourDiscountPercent: 0 })).rejects.toThrow('customer-paid');
      await db.jobCard.update({ where: { id: job.id }, data: { status: 'OPEN' } });
    }
    await db.sparePart.update({ where: { id: partId }, data: { retailRate: 999, taxable: false } });
    try {
      const cancelled = await returns.cancel(slip.id, 'Incorrect return', actor);
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.lines[0].status).toBe('CANCELLED');
      expect(await stock()).toBe(before);
      const restored = await charges(job.id);
      expect(restored.map(row => ({ id: row.id, quantity: row.quantity, amount: row.amount, rate: row.rate, taxable: row.taxable, campaignId: row.campaignId, partIssuanceId: row.partIssuanceId }))).toEqual(original.map(row => ({ id: row.id, quantity: row.quantity, amount: row.amount, rate: row.rate, taxable: row.taxable, campaignId: row.campaignId, partIssuanceId: row.partIssuanceId })));
      await expect(returns.cancel(slip.id, 'Again', actor)).rejects.toThrow('already cancelled');
      expect(await stock()).toBe(before);
    } finally { await db.sparePart.update({ where: { id: partId }, data: { retailRate: 100.01, taxable: true } }); }
  });

  it('returns several parts on one slip and supplies read-only print data', async () => {
    const { job, document } = await issue('CUSTOMER', true);
    const before = await stock();
    const secondBefore = await stock(secondPartId);
    const slip = await returns.create({ requisitionId: document.id, lines: document.lines.map(line => ({ requisitionLineId: line.id, quantity: line.sparePartId === partId ? 1 : 2 })) }, actor);
    expect(slip.totals).toEqual({ numberOfItems: 2, netQuantityReturned: 3, totalAmount: 200.01 });
    expect(await stock()).toBe(before + 1);
    expect(await stock(secondPartId)).toBe(secondBefore + 2);
    expect((await returns.get(slip.id, actor)).requisition.requisitionNumber).toBe(document.requisitionNumber);
    expect((await returns.list({ branchId, jobCardId: job.id, requisitionId: document.id, chargeType: 'CUSTOMER', page: 1, limit: 25 }, actor)).map(row => row.id)).toEqual([slip.id]);
    expect(await stock()).toBe(before + 1);
    expect(await db.stockTransaction.count({ where: { type: 'RETURNED', referenceId: { in: slip.lines.map(line => line.id) } } })).toBe(2);
  });

  it('refuses foreign lines, unissued requests and cancelled requisitions without changing stock', async () => {
    const first = await issue('CUSTOMER');
    const second = await issue('CUSTOMER');
    const before = await stock();
    await expect(create(first.document.id, second.line.id)).rejects.toThrow('does not belong');
    expect(await stock()).toBe(before);
    const request = await issue('CUSTOMER', false, 0);
    await expect(create(request.document.id, request.line.id)).rejects.toThrow('Only issued parts');
    await requisitions.cancel(first.document.id, 'Wrong requisition', actor);
    await expect(create(first.document.id, first.line.id)).rejects.toThrow('cancelled requisition');
  });

  it('enforces the remaining cap and safely cancels partial slips out of order', async () => {
    const { job, document, line } = await issue();
    const before = await stock();
    const first = await create(document.id, line.id);
    const second = await create(document.id, line.id);
    await expect(create(document.id, line.id, 2)).rejects.toThrow('exceeds issued');
    await expect(requisitions.cancel(document.id, 'Has returns', actor)).rejects.toThrow('Cancel the requisition returns');
    await returns.cancel(first.id, 'Undo first', actor);
    expect((await charges(job.id)).map(row => row.amount).sort((a, b) => a - b)).toEqual([60.01, 140.01]);
    expect(await stock()).toBe(before + 1);
    await returns.cancel(second.id, 'Undo second', actor);
    expect((await charges(job.id)).map(row => row.amount).sort((a, b) => a - b)).toEqual([90.01, 210.02]);
    const inventory: InventoryService = new (require('../inventory/inventory.service').InventoryService)();
    await expect(inventory.createPartIssuance({ sparePartId: partId, branchId, jobCardId: job.id, issuedById: actor.userId, quantity: 98 })).rejects.toThrow('Quantity / hours exceed approval');
    await requisitions.cancel(document.id, 'Now reversible', actor);
    expect(await stock()).toBe(before + 3);
    expect(await db.jobCardLine.count({ where: { jobCardId: job.id } })).toBe(0);
  });

  it.each(['BILLED', 'DELIVERED', 'CANCELLED'])('refuses returns and cancellation on %s jobs', async status => {
    const { job, document, line } = await issue('CUSTOMER');
    const slip = await create(document.id, line.id);
    const before = await stock();
    await db.jobCard.update({ where: { id: job.id }, data: { status } });
    await expect(create(document.id, line.id)).rejects.toThrow('cannot change');
    await expect(returns.cancel(slip.id, 'Blocked', actor)).rejects.toThrow('cannot change');
    expect(await stock()).toBe(before);
  });

  it('returns cross-branch 403 for each action unless branch:all is present', async () => {
    const { job, document, line } = await issue('CUSTOMER');
    const slip = await create(document.id, line.id);
    const other = { ...actor, branchId: otherBranchId };
    await expect(returns.get(slip.id, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(returns.list({ branchId, page: 1, limit: 25 }, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(returns.list({ jobCardId: job.id, page: 1, limit: 25 }, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(returns.list({ requisitionId: document.id, page: 1, limit: 25 }, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(create(document.id, line.id, 1, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(returns.cancel(slip.id, 'Blocked', other)).rejects.toMatchObject({ statusCode: 403 });
    expect((await returns.get(slip.id, { ...other, allBranches: true })).id).toBe(slip.id);
  });

  it('requires a reason and refuses cancellation if returned stock is now reserved', async () => {
    const { job, document, line } = await issue('CUSTOMER');
    const slip = await create(document.id, line.id);
    const before = await stock();
    const original = await charges(job.id);
    await expect(returns.cancel(slip.id, ' ', actor)).rejects.toThrow('reason');
    await db.inventoryStock.update({ where: { branchId_partId: { branchId, partId } }, data: { reservedQuantity: before } });
    try {
      await expect(returns.cancel(slip.id, 'Unavailable', actor)).rejects.toThrow('Insufficient available stock');
      expect(await stock()).toBe(before);
      expect((await returns.get(slip.id, actor)).status).toBe('COMPLETED');
      expect((await charges(job.id)).map(row => row.amount)).toEqual(original.map(row => row.amount));
    } finally { await db.inventoryStock.update({ where: { branchId_partId: { branchId, partId } }, data: { reservedQuantity: 2 } }); }
  });

  it('serializes concurrent returns and cancellations without exceeding issued or reversing twice', async () => {
    const { job, document, line } = await issue('CUSTOMER');
    const before = await stock();
    const results = await Promise.allSettled([create(document.id, line.id, 2), create(document.id, line.id, 2)]);
    const success = results.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<ReturnSlipService['create']>>> => result.status === 'fulfilled');
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    if (!success) throw new Error('Expected one successful return');
    expect(await stock()).toBe(before + 2);
    const cancelled = await Promise.allSettled([returns.cancel(success.value.id, 'Undo', actor), returns.cancel(success.value.id, 'Undo', actor)]);
    expect(cancelled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await stock()).toBe(before);
    expect((await charges(job.id))[0].amount).toBe(300.03);
    expect(await db.auditLog.count({ where: { action: 'RETURN_SLIP_CANCELLED', details: { contains: success.value.id } } })).toBe(1);
  });

  it('reopens ready jobs for QC when returning or cancelling returned parts', async () => {
    const { job, document, line } = await issue('CUSTOMER');
    await db.jobCard.update({ where: { id: job.id }, data: { status: 'READY', qcStatus: 'PASSED', readyAt: new Date() } });
    const slip = await create(document.id, line.id);
    expect(await db.jobCard.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'IN_PROGRESS', qcStatus: 'PENDING', readyAt: null });
    await db.jobCard.update({ where: { id: job.id }, data: { status: 'READY', qcStatus: 'PASSED', readyAt: new Date() } });
    await returns.cancel(slip.id, 'Undo', actor);
    expect(await db.jobCard.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'IN_PROGRESS', qcStatus: 'PENDING', readyAt: null });
  });

  it('keeps old bare PartReturn rows readable', async () => {
    const issuance = await db.partIssuance.create({ data: { branchId, sparePartId: partId, issuedById: actor.userId, quantity: 2 } });
    const legacy = await db.partReturn.create({ data: { partIssuanceId: issuance.id, returnedById: actor.userId, quantity: 1, status: 'Completed' } });
    const inventory: InventoryService = new (require('../inventory/inventory.service').InventoryService)();
    expect(await inventory.getPartReturn(legacy.id)).toMatchObject({ id: legacy.id, quantity: 1, returnSlipId: null, requisitionLineId: null, rate: null, amount: null });
  });

  it('rolls back stock, charges and document changes if either audit insert fails', async () => {
    const { job, document, line } = await issue();
    const before = await stock();
    const original = (await charges(job.id)).map(row => row.amount);
    async function failAudit(action: 'RETURN_SLIP_CREATED' | 'RETURN_SLIP_CANCELLED', operation: () => Promise<unknown>) {
      await db.$executeRawUnsafe(`CREATE FUNCTION return_slip_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = TG_ARGV[0] THEN RAISE EXCEPTION 'Synthetic return audit failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER return_slip_test_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION return_slip_test_failure('${action}')`);
      try { await expect(operation()).rejects.toThrow('Synthetic return audit failure'); }
      finally {
        await db.$executeRawUnsafe('DROP TRIGGER return_slip_test_failure ON "AuditLog"');
        await db.$executeRawUnsafe('DROP FUNCTION return_slip_test_failure()');
      }
    }
    await failAudit('RETURN_SLIP_CREATED', () => create(document.id, line.id));
    expect(await stock()).toBe(before);
    expect(await db.partReturnSlip.count({ where: { requisitionId: document.id } })).toBe(0);
    expect((await charges(job.id)).map(row => row.amount)).toEqual(original);
    const slip = await create(document.id, line.id);
    const reduced = (await charges(job.id)).map(row => row.amount);
    await failAudit('RETURN_SLIP_CANCELLED', () => returns.cancel(slip.id, 'Undo', actor));
    expect(await stock()).toBe(before + 1);
    expect((await returns.get(slip.id, actor)).status).toBe('COMPLETED');
    expect((await charges(job.id)).map(row => row.amount)).toEqual(reduced);
  });
});
