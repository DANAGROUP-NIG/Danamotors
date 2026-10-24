import type { ChargeType, PrismaClient } from '@prisma/client';
import type { LabourSlipService } from './labour-slip.service';
import type { LabourSlipActor } from './labour-slip.logic';
import type { LabourSlipLineInput } from './labour-slip.validation';
import type { LabourService } from './labour.service';
import type { JobCardLineService } from '../job-card-line/jobCardLine.service';
import type { JobBillingService } from '../finance/job-billing.service';
import type { JobCardWorkflowService } from './job-card-workflow.service';

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(60000);

describeDb('Labour slips on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let service: LabourSlipService;
  let actor: LabourSlipActor;
  let branchId: string;
  let otherBranchId: string;
  let customerId: string;
  let vehicleId: string;
  let modelId: string;
  let technicianId: string;
  let otherTechnicianId: string;
  let mechanicId: string;
  let timeId: string;
  let fixedId: string;
  let groupId: string;
  let campaignId: string;
  let sequence = 0;
  const run = `${Date.now()}`;

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('Labour-slip tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    service = new (require('./labour-slip.service').LabourSlipService)();
    branchId = (await db.branch.create({ data: { name: `Labour fixture ${run}` } })).id;
    otherBranchId = (await db.branch.create({ data: { name: `Labour other ${run}` } })).id;
    const advisorRole = await db.role.upsert({ where: { name: 'ServiceAdviser' }, update: {}, create: { name: 'ServiceAdviser' } });
    const techRole = await db.role.upsert({ where: { name: 'Technician' }, update: {}, create: { name: 'Technician' } });
    const advisor = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Advisor', email: `labour-advisor-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: advisorRole.id, branchId } });
    actor = { userId: advisor.id, branchId, allBranches: false, goodwill: true };
    technicianId = (await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Technician', email: `labour-tech-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: techRole.id, branchId } })).id;
    otherTechnicianId = (await db.user.create({ data: { firstName: 'Other', lastName: 'Technician', email: `labour-other-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: techRole.id, branchId: otherBranchId } })).id;
    customerId = (await db.customer.create({ data: { firstName: 'Synthetic', lastName: 'Labour', branchId } })).id;
    modelId = (await db.workshopMaster.create({ data: { kind: 'MODEL', code: `LAB-M-${run}`, description: 'Synthetic model' } })).id;
    const variant = await db.workshopMaster.create({ data: { kind: 'VARIANT', code: `LAB-V-${run}`, description: 'Synthetic variant', parentId: modelId } });
    vehicleId = (await db.vehicle.create({ data: { vin: `LABOUR${run}`, catalogueId: variant.id, customerId } })).id;
    groupId = (await db.workshopMaster.create({ data: { kind: 'TEAM', code: `LAB-T-${run}`, description: 'Synthetic group' } })).id;
    mechanicId = (await db.employee.create({ data: { code: `LAB-E-${run}`, name: 'Synthetic mechanic without login', branchId, teamId: groupId } })).id;
    timeId = (await db.labourItem.create({ data: { code: `LAB-TIME-${run}`, description: 'Time-priced operation', defaultHours: 10, rate: 10 } })).id;
    fixedId = (await db.labourItem.create({ data: { code: `LAB-FIXED-${run}`, description: 'Fixed-price operation', defaultHours: 10, rate: 10 } })).id;
    await db.labourRate.createMany({ data: [{ labourItemId: timeId, modelId, pricing: 'TIME', hours: 3, rate: 100.01 }, { labourItemId: fixedId, modelId, pricing: 'FIXED', hours: 2, rate: 500 }] });
    campaignId = (await db.campaign.create({ data: { code: `LAB-C-${run}`, title: 'Synthetic labour campaign', type: 'FREE_FIX', status: 'ACTIVE', startDate: new Date() } })).id;
  });

  afterAll(async () => { await db?.$disconnect(); });

  async function job(status = 'OPEN') {
    const card = await db.jobCard.create({ data: { branchId, customerId, vehicleId, jobNumber: `LAB-${run}-${++sequence}`, description: 'Labour test job', status, warrantyStatusAtCreation: 'ACTIVE' } });
    await db.estimate.create({ data: {
      branchId, jobCardId: card.id, customerId, description: 'Approved labour scope', amount: 60000, status: 'Approved',
      lines: { create: [{ type: 'LABOUR', referenceId: timeId, description: 'Time-priced operation', quantity: 100, rate: 100.01, amount: 10001 }, { type: 'LABOUR', referenceId: fixedId, description: 'Fixed-price operation', quantity: 100, rate: 500, amount: 50000 }] },
      approvals: { create: { customerId, approved: true, status: 'Approved', signatureRequired: false, overrideReason: 'Synthetic test approval' } },
    } });
    await db.jobCardCampaign.create({ data: { jobCardId: card.id, campaignId, campaignCode: `LAB-C-${run}`, campaignTitle: 'Synthetic labour campaign', campaignType: 'FREE_FIX' } });
    return card;
  }

  const line = (extra: Partial<LabourSlipLineInput> = {}): LabourSlipLineInput => ({ labourItemId: timeId, technicianId, chargeType: 'CUSTOMER', ...extra });
  const create = (jobCardId: string, lines = [line()]) => service.create({ branchId, jobCardId, groupId, engineerId: actor.userId, lines }, actor);

  it('snapshots model standard hours and default charged hours under one branch number', async () => {
    const card = await job();
    const slip = await create(card.id);
    expect(slip.slipNumber).toMatch(/^\d{10}$/);
    expect(slip.group?.id).toBe(groupId);
    expect(slip.lines[0]).toMatchObject({ standardHours: 3, chargedHours: 3, hours: 3, pricing: 'TIME', rate: 100.01, amount: 300.03, technicianId, mechanicId: null, groupId });
    expect(slip.lines[0].chargeLine).toMatchObject({ quantity: 3, rate: 100.01, amount: 300.03, chargeType: 'CUSTOMER' });
    expect(slip.totals.nonWarrantyAmount).toBe(300.03);
    expect((await service.list({ jobCardId: card.id, page: 1, limit: 25 }, actor)).map(row => row.id)).toEqual([slip.id]);
  });

  it('adds and edits charged hours without duplicating the job labour or charge line', async () => {
    const card = await job();
    const slip = await create(card.id, [line({ chargedHours: 2.5 })]);
    const original = slip.lines[0];
    const edited = await service.save(slip.id, line({ chargedHours: 2 }), actor, original.id);
    expect(edited.lines[0]).toMatchObject({ id: original.id, standardHours: 3, chargedHours: 2, amount: 200.02 });
    expect(edited.lines[0].chargeLine?.id).toBe(original.chargeLine?.id);
    const added = await service.save(slip.id, line({ labourItemId: fixedId, chargedHours: 4 }), actor);
    expect(added.lines).toHaveLength(2);
    expect(added.totals.totalAmount).toBe(700.02);
    expect(await db.auditLog.count({ where: { action: 'LABOUR_SLIP_LINE_UPDATED', details: { contains: original.id } } })).toBe(1);
  });

  it('keeps fixed pricing and standard-hour snapshots through catalogue changes, sync, QC and actual billing', async () => {
    const card = await job();
    const slip = await create(card.id, [line({ labourItemId: fixedId, chargedHours: 4 })]);
    expect(slip.lines[0]).toMatchObject({ standardHours: 2, chargedHours: 4, pricing: 'FIXED', amount: 500 });
    await db.labourRate.update({ where: { labourItemId_modelId: { labourItemId: fixedId, modelId } }, data: { pricing: 'TIME', hours: 9, rate: 999 } });
    try {
      const edited = await service.save(slip.id, line({ labourItemId: fixedId, chargedHours: 6 }), actor, slip.lines[0].id);
      expect(edited.lines[0]).toMatchObject({ standardHours: 2, chargedHours: 6, pricing: 'FIXED', rate: 500, amount: 500 });
      expect(edited.lines[0].chargeLine).toMatchObject({ quantity: 1, rate: 500, amount: 500 });
      const sync: JobCardLineService = new (require('../job-card-line/jobCardLine.service').JobCardLineService)();
      await db.$transaction(tx => sync.syncLines(tx, card.id));
      const workflow: JobCardWorkflowService = new (require('./job-card-workflow.service').JobCardWorkflowService)();
      await workflow.update(card.id, { status: 'IN_PROGRESS' }, actor.userId);
      await workflow.update(card.id, { status: 'QC' }, actor.userId);
      await expect(workflow.update(card.id, { status: 'READY' }, actor.userId)).rejects.toThrow('passed quality check');
      expect(await db.jobCard.findUnique({ where: { id: card.id } })).toMatchObject({ status: 'QC', readyAt: null });
      await db.jobCard.update({ where: { id: card.id }, data: { qcStatus: 'PASSED' } });
      const ready = await workflow.update(card.id, { status: 'READY', workDone: 'Synthetic fixed-price operation completed' }, actor.userId);
      expect(ready.status).toBe('READY');
      expect(ready.readyAt).not.toBeNull();
      expect(ready.workDone).toBe('Synthetic fixed-price operation completed');
      const billing: JobBillingService = new (require('../finance/job-billing.service').JobBillingService)();
      const invoice = await billing.createJobBill({ jobCardId: card.id, serviceAdvisorId: actor.userId, actorId: actor.userId, partsDiscountPercent: 0, labourDiscountPercent: 0 });
      expect(invoice.labourTotal).toBe(500);
      expect(invoice.lines[0]).toMatchObject({ quantity: 1, rate: 500, amount: 500, jobCardLineId: edited.lines[0].chargeLine?.id, jobCardLabourId: edited.lines[0].id });
      await expect(service.save(slip.id, line({ labourItemId: fixedId, chargedHours: 7 }), actor, slip.lines[0].id)).rejects.toThrow('cannot change');
    } finally { await db.labourRate.update({ where: { labourItemId_modelId: { labourItemId: fixedId, modelId } }, data: { pricing: 'FIXED', hours: 2, rate: 500 } }); }
  });

  it('totals all four charge types and enforces goodwill/warranty/campaign rules', async () => {
    const card = await job();
    const slip = await create(card.id, (['CUSTOMER', 'WARRANTY', 'FREE', 'GOODWILL'] as ChargeType[]).map(chargeType => line({ chargeType, chargedHours: 1, campaignId: chargeType === 'FREE' ? campaignId : undefined, reason: chargeType === 'GOODWILL' ? 'Synthetic contribution' : undefined })));
    expect(slip.totals).toEqual({ numberOfItems: 4, nonWarrantyAmount: 100.01, warrantyAmount: 100.01, freeAmount: 100.01, goodwillAmount: 100.01, totalAmount: 400.04 });
    await expect(service.create({ branchId, jobCardId: card.id, lines: [line({ chargeType: 'GOODWILL', reason: 'Test' })] }, { ...actor, goodwill: false })).rejects.toThrow('warranty:update');
    await expect(create(card.id, [line({ chargeType: 'GOODWILL' })])).rejects.toThrow('reason');
    await db.jobCard.update({ where: { id: card.id }, data: { warrantyStatusAtCreation: 'UNKNOWN' } });
    await expect(create(card.id, [line({ chargeType: 'WARRANTY' })])).rejects.toThrow('under warranty');
    const unlinked = await job();
    await db.jobCardCampaign.deleteMany({ where: { jobCardId: unlinked.id } });
    await expect(create(unlinked.id, [line({ chargeType: 'FREE' })])).rejects.toThrow('campaign');
  });

  it('supports one employee mechanic without inventing a login or extra technicians', async () => {
    const card = await job();
    const slip = await create(card.id, [line({ technicianId: undefined, mechanicId })]);
    expect(slip.lines[0]).toMatchObject({ mechanicId, technicianId: null });
    expect(slip.lines[0].mechanic?.name).toBe('Synthetic mechanic without login');
    await expect(create(card.id, [line({ technicianId: otherTechnicianId })])).rejects.toThrow('job card branch');
    await expect(create(card.id, [line({ mechanicId })])).rejects.toThrow('exactly one');
  });

  it.each(['BILLED', 'DELIVERED', 'CANCELLED'])('rejects slip creation, additions and edits on %s jobs', async status => {
    const card = await job();
    const slip = await create(card.id);
    await db.jobCard.update({ where: { id: card.id }, data: { status } });
    await expect(create(card.id)).rejects.toThrow('cannot change');
    await expect(service.save(slip.id, line(), actor)).rejects.toThrow('cannot change');
    await expect(service.save(slip.id, line(), actor, slip.lines[0].id)).rejects.toThrow('cannot change');
  });

  it('enforces branch:all independently of inventory cross-branch rights', async () => {
    const card = await job();
    const slip = await create(card.id);
    const other = { ...actor, branchId: otherBranchId };
    await expect(service.get(slip.id, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.list({ branchId, page: 1, limit: 25 }, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.list({ jobCardId: card.id, page: 1, limit: 25 }, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.create({ branchId, jobCardId: card.id, lines: [line()] }, other)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.save(slip.id, line(), other)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.get(slip.id, { ...other, allBranches: true })).id).toBe(slip.id);
  });

  it('keeps document charges and hours safe from legacy edit/delete and reclassification paths', async () => {
    const card = await job();
    const slip = await create(card.id);
    const legacy: LabourService = new (require('./labour.service').LabourService)();
    const charges: JobCardLineService = new (require('../job-card-line/jobCardLine.service').JobCardLineService)();
    await expect(legacy.updateJobCardLine(slip.lines[0].id, { hours: 9 })).rejects.toThrow('labour slip');
    await expect(legacy.removeJobCardLine(slip.lines[0].id)).rejects.toThrow('legacy labour endpoint');
    await expect(charges.updateLine(card.id, slip.lines[0].chargeLine!.id, { chargeType: 'FREE' }, { userId: actor.userId, canChargeGoodwill: true })).rejects.toThrow('labour slip');
  });

  it('reopens READY jobs when labour changes, so the checkbox cannot keep stale QC approval', async () => {
    const card = await job('READY');
    await db.jobCard.update({ where: { id: card.id }, data: { qcStatus: 'PASSED', readyAt: new Date() } });
    const slip = await create(card.id);
    expect(await db.jobCard.findUnique({ where: { id: card.id } })).toMatchObject({ status: 'IN_PROGRESS', qcStatus: 'PENDING', readyAt: null });
    await db.jobCard.update({ where: { id: card.id }, data: { status: 'READY', qcStatus: 'PASSED', readyAt: new Date() } });
    await service.save(slip.id, line({ chargedHours: 2 }), actor, slip.lines[0].id);
    expect(await db.jobCard.findUnique({ where: { id: card.id } })).toMatchObject({ status: 'IN_PROGRESS', qcStatus: 'PENDING', readyAt: null });
  });

  it('shares approved fixed-operation quantities correctly with the legacy labour writer', async () => {
    const card = await job();
    await db.estimateLine.updateMany({ where: { estimate: { jobCardId: card.id }, referenceId: fixedId }, data: { quantity: 2, amount: 1000 } });
    await create(card.id, [line({ labourItemId: fixedId, chargedHours: 6 })]);
    const legacy: LabourService = new (require('./labour.service').LabourService)();
    await legacy.addJobCardLine(card.id, { labourItemId: fixedId, technicianId });
    expect(await db.jobCardLabour.count({ where: { jobCardId: card.id } })).toBe(2);
  });

  it('serializes concurrent additions so they cannot exceed approved hours', async () => {
    const card = await job();
    const slip = await create(card.id, [line({ chargedHours: 1 })]);
    const results = await Promise.allSettled([service.save(slip.id, line({ chargedHours: 60 }), actor), service.save(slip.id, line({ chargedHours: 60 }), actor)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await service.get(slip.id, actor)).lines).toHaveLength(2);
  });

  it('rolls back the whole slip when its final audit write fails', async () => {
    const card = await job();
    await db.$executeRawUnsafe(`CREATE FUNCTION labour_slip_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'LABOUR_SLIP_CREATED' THEN RAISE EXCEPTION 'Synthetic labour audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER labour_slip_test_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION labour_slip_test_failure()');
    try { await expect(create(card.id)).rejects.toThrow('Synthetic labour audit failure'); }
    finally {
      await db.$executeRawUnsafe('DROP TRIGGER labour_slip_test_failure ON "AuditLog"');
      await db.$executeRawUnsafe('DROP FUNCTION labour_slip_test_failure()');
    }
    expect(await db.labourSlip.count({ where: { jobCardId: card.id } })).toBe(0);
    expect(await db.jobCardLabour.count({ where: { jobCardId: card.id } })).toBe(0);
    expect(await db.jobCardLine.count({ where: { jobCardId: card.id } })).toBe(0);
  });
});
