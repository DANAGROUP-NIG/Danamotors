import type { PrismaClient } from '@prisma/client';
import type { RequisitionService } from './requisition.service';
import type { RequisitionActor } from './requisition.logic';
import type { RequisitionInput } from './requisition.validation';
import type { JobCardLineService } from '../job-card-line/jobCardLine.service';
import type { JobBillingService } from '../finance/job-billing.service';
import type { InventoryService } from '../inventory/inventory.service';

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(60000);

describeDb('Requisitions on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let service: RequisitionService;
  let actor: RequisitionActor;
  let branchId: string;
  let otherBranchId: string;
  let customerId: string;
  let partId: string;
  let secondPartId: string;
  let sequence = 0;
  const run = `${Date.now()}`;

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('Requisition integration tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    service = new (require('./requisition.service').RequisitionService)();
    const branch = await db.branch.create({ data: { name: `Requisition fixture ${run}` } });
    const other = await db.branch.create({ data: { name: `Requisition other ${run}` } });
    branchId = branch.id;
    otherBranchId = other.id;
    const role = await db.role.create({ data: { name: `RequisitionFixture${run}` } });
    const user = await db.user.create({ data: { firstName: 'Test', lastName: 'Fixture', email: `requisition-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: role.id, branchId } });
    actor = { userId: user.id, branchId, allBranches: false, goodwill: true };
    const customer = await db.customer.create({ data: { firstName: 'Requisition', lastName: 'Fixture', branchId } });
    customerId = customer.id;
    const part = await db.sparePart.create({ data: { partCode: `REQ1-${run}`, partNumber: `REQ1-${run}`, name: 'Source filter', unitPrice: 100.01, retailRate: 100.01, warrantyRate: 80, warrantyApplicable: true, partFlag: 'O' } });
    const second = await db.sparePart.create({ data: { partCode: `REQ2-${run}`, partNumber: `REQ2-${run}`, name: 'Local source', unitPrice: 50, retailRate: 50, partFlag: 'L' } });
    partId = part.id;
    secondPartId = second.id;
    await db.inventoryStock.createMany({ data: [{ branchId, partId, quantity: 100, reservedQuantity: 2 }, { branchId, partId: secondPartId, quantity: 100 }] });
  });

  afterAll(async () => { await db?.$disconnect(); });

  async function job(status = 'OPEN', scope = true) {
    const card = await db.jobCard.create({ data: { branchId, customerId, jobNumber: `REQ-${run}-${++sequence}`, description: 'Requisition test job', status } });
    if (scope) await db.estimate.create({ data: {
      branchId, jobCardId: card.id, customerId, description: 'Approved scope', amount: 20000, status: 'Approved',
      lines: { create: [{ type: 'PART', referenceId: partId, description: 'Source filter', quantity: 100, rate: 100.01, amount: 10001 }, { type: 'PART', referenceId: secondPartId, description: 'Local source', quantity: 100, rate: 50, amount: 5000 }] },
      approvals: { create: { customerId, approved: true, status: 'Approved', signatureRequired: false, overrideReason: 'Synthetic test approval' } },
    } });
    return card;
  }

  const input = (jobCardId: string, extra: Partial<RequisitionInput> = {}): RequisitionInput => ({ branchId, jobCardId, chargeType: 'CUSTOMER', lines: [{ sparePartId: partId, quantityRequired: 3, quantityIssued: 3 }], ...extra });
  const stock = async () => (await db.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId, partId } } })).quantity;

  it('issues multiple source records under one branch number and snapshots stock and rates', async () => {
    const card = await job();
    const before = await stock();
    const document = await service.create(input(card.id, { lines: [{ sparePartId: partId, quantityRequired: 3, quantityIssued: 3 }, { sparePartId: secondPartId, quantityRequired: 2, quantityIssued: 2 }] }), actor);
    expect(document.requisitionNumber).toMatch(/^\d{10}$/);
    expect(document.lines).toHaveLength(2);
    expect(document.totals.totalAmount).toBe(400.03);
    expect(await stock()).toBe(before - 3);
    expect(await db.stockTransaction.count({ where: { referenceId: { in: document.lines.map(line => line.partIssuanceId!) }, type: 'ISSUED' } })).toBe(2);
    expect(document.lines.find(line => line.sparePartId === secondPartId)?.partSource).toBe('L');
    expect(await db.auditLog.count({ where: { action: 'REQUISITION_CREATED', details: { contains: document.id } } })).toBe(1);
    await db.sparePart.update({ where: { id: partId }, data: { retailRate: 999 } });
    const saved = await service.get(document.id, actor);
    expect(saved.lines.find(line => line.sparePartId === partId)?.rate.toNumber()).toBe(100.01);
    await db.sparePart.update({ where: { id: partId }, data: { retailRate: 100.01 } });
  });

  it('splits goodwill, survives line sync and price changes, and bills only the customer share', async () => {
    const card = await job();
    const document = await service.create(input(card.id, { chargeType: 'GOODWILL', goodwillReason: 'Approved contribution', lines: [{ sparePartId: partId, quantityRequired: 3, quantityIssued: 3, approvalPercent: 30, customerPercent: 70 }] }), actor);
    expect(document.lines[0].jobCardLines).toHaveLength(2);
    expect(document.lines[0].approvedAmount.toNumber()).toBe(90.01);
    expect(document.lines[0].customerAmount.toNumber()).toBe(210.02);
    await db.sparePart.update({ where: { id: partId }, data: { retailRate: 999 } });
    const lines: JobCardLineService = new (require('../job-card-line/jobCardLine.service').JobCardLineService)();
    await db.$transaction(tx => lines.syncLines(tx, card.id));
    const { assertRecordedScope }: typeof import('../service/estimate-approval') = require('../service/estimate-approval');
    await db.$transaction(tx => assertRecordedScope(tx, card.id));
    const saved = await db.jobCardLine.findMany({ where: { jobCardId: card.id } });
    expect(saved.map(line => line.amount).sort((a, b) => a - b)).toEqual([90.01, 210.02]);
    await db.jobCard.update({ where: { id: card.id }, data: { status: 'READY' } });
    const billing: JobBillingService = new (require('../finance/job-billing.service').JobBillingService)();
    const preview = await billing.previewJobBill({ jobCardId: card.id, partsDiscountPercent: 0, labourDiscountPercent: 0 });
    expect(preview.review.canBill).toBe(true);
    expect(preview.totals.partsTotal).toBe(210.02);
    await expect(lines.updateLine(card.id, saved[0].id, { chargeType: 'CUSTOMER' }, { userId: actor.userId, canChargeGoodwill: true })).rejects.toThrow('Cancel and reissue');
    const inventory: InventoryService = new (require('../inventory/inventory.service').InventoryService)();
    await expect(inventory.createPartReturn({ partIssuanceId: document.lines[0].partIssuanceId!, branchId, returnedById: actor.userId, quantity: 1 })).rejects.toThrow('return slip');
    const advisorRole = await db.role.upsert({ where: { name: 'ServiceAdviser' }, update: {}, create: { name: 'ServiceAdviser' } });
    const advisor = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Advisor', email: `advisor-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: advisorRole.id, branchId } });
    const invoice = await billing.createJobBill({ jobCardId: card.id, serviceAdvisorId: advisor.id, actorId: actor.userId, partsDiscountPercent: 0, labourDiscountPercent: 0 });
    expect(invoice.partsTotal).toBe(210.02);
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0].amount).toBe(210.02);
    expect(invoice.lines[0].jobCardLineId).toBe(saved.find(line => line.chargeType === 'CUSTOMER')?.id);
    await db.sparePart.update({ where: { id: partId }, data: { retailRate: 100.01 } });
  });

  it('requires goodwill permission/reason and warranty eligibility; warranty issues at the warranty snapshot rate', async () => {
    const card = await job();
    await expect(service.create(input(card.id, { chargeType: 'GOODWILL', goodwillReason: 'Test' }), { ...actor, goodwill: false })).rejects.toThrow('requisition:goodwill');
    await expect(service.create(input(card.id, { chargeType: 'GOODWILL' }), actor)).rejects.toThrow('reason');
    await expect(service.create(input(card.id, { chargeType: 'WARRANTY' }), actor)).rejects.toThrow('under warranty');
    await db.jobCard.update({ where: { id: card.id }, data: { warrantyStatusAtCreation: 'ACTIVE' } });
    const document = await service.create(input(card.id, { chargeType: 'WARRANTY' }), actor);
    expect(document.lines[0].rate.toNumber()).toBe(80);
    expect(document.lines[0].approvalPercent?.toNumber()).toBe(100);
    expect(document.lines[0].customerAmount.toNumber()).toBe(0);
  });

  it('issues free parts only for a linked campaign', async () => {
    const card = await job();
    await expect(service.create(input(card.id, { chargeType: 'FREE' }), actor)).rejects.toThrow('campaign');
    const campaign = await db.campaign.create({ data: { code: `REQ-${run}`, title: 'Synthetic free fix', type: 'FREE_FIX', status: 'ACTIVE', startDate: new Date() } });
    await db.jobCardCampaign.create({ data: { jobCardId: card.id, campaignId: campaign.id, campaignCode: campaign.code, campaignTitle: campaign.title, campaignType: campaign.type } });
    const document = await service.create(input(card.id, { chargeType: 'FREE', campaignId: campaign.id }), actor);
    expect(document.lines[0].jobCardLines[0]).toMatchObject({ chargeType: 'FREE', campaignId: campaign.id });
  });

  it('can record an out-of-stock request without issuance, charges or a movement', async () => {
    const card = await job('OPEN', false);
    const empty = await db.sparePart.create({ data: { partCode: `EMPTY-${run}`, partNumber: `EMPTY-${run}`, name: 'No stock', unitPrice: 1 } });
    const document = await service.create(input(card.id, { lines: [{ sparePartId: empty.id, quantityRequired: 2, quantityIssued: 0 }] }), actor);
    expect(document.lines[0].partIssuanceId).toBeNull();
    expect(document.lines[0].jobCardLines).toHaveLength(0);
    expect(document.totals.totalAmount).toBe(0);
  });

  it('rejects stock reserved for transfers and rolls back the whole multi-line issue', async () => {
    const card = await job();
    const before = await stock();
    await expect(service.create(input(card.id, { lines: [{ sparePartId: secondPartId, quantityRequired: 1, quantityIssued: 1 }, { sparePartId: partId, quantityRequired: before, quantityIssued: before }] }), actor)).rejects.toThrow('available stock');
    expect(await stock()).toBe(before);
    expect(await db.partRequisition.count({ where: { jobCardId: card.id } })).toBe(0);
    expect(await db.partIssuance.count({ where: { jobCardId: card.id } })).toBe(0);
  });

  it.each(['BILLED', 'DELIVERED', 'CANCELLED'])('refuses issuance on %s jobs', async status => {
    const card = await job(status);
    await expect(service.create(input(card.id), actor)).rejects.toThrow('cannot change');
  });

  it('returns 403 across branches unless branch:all is present', async () => {
    const card = await job();
    const document = await service.create(input(card.id), actor);
    const other = { ...actor, branchId: otherBranchId };
    await expect(service.get(document.id, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.list({ branchId, page: 1, limit: 25 }, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.create(input(card.id), other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.cancel(document.id, 'Test', other)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.get(document.id, { ...other, allBranches: true })).id).toBe(document.id);
  });

  it('cancels once, reverses stock and both shares, audits, and never resurrects charges', async () => {
    const card = await job();
    const before = await stock();
    const document = await service.create(input(card.id, { chargeType: 'GOODWILL', goodwillReason: 'Test split', lines: [{ sparePartId: partId, quantityRequired: 3, quantityIssued: 3, approvalPercent: 50, customerPercent: 50 }] }), actor);
    await expect(service.cancel(document.id, ' ', actor)).rejects.toThrow('reason');
    const cancellations = await Promise.allSettled([service.cancel(document.id, 'Wrong part', actor), service.cancel(document.id, 'Wrong part', actor)]);
    expect(cancellations.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await stock()).toBe(before);
    expect(await db.jobCardLine.count({ where: { jobCardId: card.id } })).toBe(0);
    await expect(service.cancel(document.id, 'Again', actor)).rejects.toThrow('already cancelled');
    expect(await stock()).toBe(before);
    const sync: JobCardLineService = new (require('../job-card-line/jobCardLine.service').JobCardLineService)();
    await db.$transaction(tx => sync.syncLines(tx, card.id));
    expect(await db.jobCardLine.count({ where: { jobCardId: card.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: 'REQUISITION_CANCELLED', details: { contains: document.id } } })).toBe(1);
    const next = await service.create(input(card.id), actor);
    expect(next.requisitionNumber).not.toBe(document.requisitionNumber);
    await db.jobCard.update({ where: { id: card.id }, data: { status: 'BILLED' } });
    await expect(service.cancel(next.id, 'Too late', actor)).rejects.toThrow('cannot change');
  });

  it('rolls back stock, documents, charges and movements if the audit write fails', async () => {
    const card = await job();
    const before = await stock();
    const movements = await db.stockTransaction.count();
    // A root-client spy does not affect Prisma's transaction client. Fail the
    // actual audit insert so this proves database rollback, not mock behavior.
    await db.$executeRawUnsafe(`CREATE FUNCTION requisition_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'REQUISITION_CREATED' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER requisition_test_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION requisition_test_audit_failure()');
    try {
      await expect(service.create(input(card.id), actor)).rejects.toThrow('Synthetic audit failure');
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER requisition_test_audit_failure ON "AuditLog"');
      await db.$executeRawUnsafe('DROP FUNCTION requisition_test_audit_failure()');
    }
    expect(await stock()).toBe(before);
    expect(await db.partRequisition.count({ where: { jobCardId: card.id } })).toBe(0);
    expect(await db.partIssuance.count({ where: { jobCardId: card.id } })).toBe(0);
    expect(await db.jobCardLine.count({ where: { jobCardId: card.id } })).toBe(0);
    expect(await db.stockTransaction.count()).toBe(movements);
  });

  it('protects direct service callers from duplicate part rows', async () => {
    const card = await job();
    const row = { sparePartId: partId, quantityRequired: 3, quantityIssued: 3 };
    await expect(service.create(input(card.id, { lines: [row, row] }), actor)).rejects.toThrow('duplicate');
  });

  it('requires QC again after issuing or cancelling parts on a ready job', async () => {
    const card = await job('READY');
    await db.jobCard.update({ where: { id: card.id }, data: { qcStatus: 'PASSED', readyAt: new Date() } });
    const document = await service.create(input(card.id), actor);
    expect(await db.jobCard.findUnique({ where: { id: card.id } })).toMatchObject({ status: 'IN_PROGRESS', qcStatus: 'PENDING', readyAt: null });
    await db.jobCard.update({ where: { id: card.id }, data: { status: 'READY', qcStatus: 'PASSED', readyAt: new Date() } });
    await service.cancel(document.id, 'Wrong part', actor);
    expect(await db.jobCard.findUnique({ where: { id: card.id } })).toMatchObject({ status: 'IN_PROGRESS', qcStatus: 'PENDING', readyAt: null });
  });

  it('serializes concurrent issues across jobs without overselling', async () => {
    const first = await job();
    const second = await job();
    const before = await stock();
    const quantity = before - 2;
    const results = await Promise.allSettled([first, second].map(card => service.create(input(card.id, { lines: [{ sparePartId: partId, quantityRequired: quantity, quantityIssued: quantity }] }), actor)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await stock()).toBe(2);
  });
});
