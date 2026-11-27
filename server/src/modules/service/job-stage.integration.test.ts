import { randomUUID } from 'node:crypto';
import type { JobStage, PrismaClient } from '@prisma/client';
import type { JobStageService } from './job-stage.service';
import type { JobCardWorkflowService } from './job-card-workflow.service';
import type { WorkshopService } from '../workshop/workshop.service';
import type { LabourService } from './labour.service';
import type { JobCardLineService } from '../job-card-line/jobCardLine.service';
import type { JobBillingService } from '../finance/job-billing.service';
import type { JobQualityCheckService } from './job-quality-check.service';
import { QC_GENERAL_CHECKS } from './job-quality-check.logic';
import type { StageAction } from './job-stage.logic';
import { stageAllowsStatus } from './job-stage.logic';
import { CHECKLIST_ITEMS } from './job-check-in.logic';

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(90000);

describeDb('Staged job card on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let stages: JobStageService;
  let workflow: JobCardWorkflowService;
  let workshop: WorkshopService;
  let qc: JobQualityCheckService;
  let qcState: typeof import('./job-qc-state');
  let setQcResult: typeof import('./job-qc-state.fixtures').setQcResult;
  let labour: LabourService;
  let lines: JobCardLineService;
  let billing: JobBillingService;
  let branchId: string;
  let customerId: string;
  let vehicleId: string;
  let labourItemId: string;
  let serviceTypeId: string;
  const run = `${Date.now()}`;
  let sequence = 0;
  const users: Record<'advisor' | 'supervisor' | 'technician' | 'otherTechnician' | 'engineer' | 'warranty' | 'billing' | 'admin', { id: string; role: string }> = {} as never;
  let bayId: string;

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('Stage tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    stages = new (require('./job-stage.service').JobStageService)();
    workflow = new (require('./job-card-workflow.service').JobCardWorkflowService)();
    workshop = new (require('../workshop/workshop.service').WorkshopService)();
    qc = new (require('./job-quality-check.service').JobQualityCheckService)();
    qcState = require('./job-qc-state');
    setQcResult = require('./job-qc-state.fixtures').setQcResult;
    labour = new (require('./labour.service').LabourService)();
    lines = new (require('../job-card-line/jobCardLine.service').JobCardLineService)();
    billing = new (require('../finance/job-billing.service').JobBillingService)();
    branchId = (await db.branch.create({ data: { name: `Stage fixture ${run}` } })).id;
    const person = async (key: keyof typeof users, role: string, firstName: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      const user = await db.user.create({ data: { firstName, lastName: 'Synthetic', email: `stage-${key}-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId, branchId } });
      users[key] = { id: user.id, role };
    };
    await person('advisor', 'ServiceAdviser', 'Advisor');
    await person('supervisor', 'WorkshopManager', 'Supervisor');
    await person('technician', 'Technician', 'Technician');
    await person('otherTechnician', 'Technician', 'Other');
    await person('engineer', 'Engineer', 'Engineer');
    await person('warranty', 'WarrantyOfficer', 'Warranty');
    await person('billing', 'BillingOfficer', 'Billing');
    await person('admin', 'Admin', 'Admin');
    customerId = (await db.customer.create({ data: { firstName: 'Synthetic', lastName: 'Stage', branchId } })).id;
    const model = await db.workshopMaster.create({ data: { kind: 'MODEL', code: `STG-M-${run}`, description: 'Synthetic model' } });
    const variant = await db.workshopMaster.create({ data: { kind: 'VARIANT', code: `STG-V-${run}`, description: 'Synthetic variant', parentId: model.id } });
    vehicleId = (await db.vehicle.create({ data: { vin: `STAGE${run}`, catalogueId: variant.id, customModel: 'Synthetic Sportage', customerId } })).id;
    labourItemId = (await db.labourItem.create({ data: { code: `STG-L-${run}`, description: 'Brake pad replacement', defaultHours: 1, rate: 15000 } })).id;
    await db.labourRate.create({ data: { labourItemId, modelId: model.id, pricing: 'FIXED', hours: 1, rate: 15000 } });
    serviceTypeId = (await db.workshopMaster.create({ data: { kind: 'SERVICE_TYPE', code: `STG-S-${run}`, description: 'Periodic service' } })).id;
    bayId = (await db.workshopMaster.create({ data: { kind: 'BAY', code: `STG-B-${run}`, description: 'Bay A2' } })).id;
  });

  /** Diagnosis (phase 3): the technician writes a finding for every request and sends them to the engineer. */
  async function sendFindings(id: string) {
    const complaints = await db.jobComplaint.findMany({ where: { jobCardId: id }, select: { id: true } });
    for (const complaint of complaints)
      await db.jobFinding.create({ data: { jobCardId: id, complaintId: complaint.id, causeAndDefect: 'Front pads worn to 2 mm', createdById: users.technician.id } });
    await act(id, 'SEND_TO_ENGINEER', 'technician');
  }

  /** A finished walk-around: fuel recorded and all 25 items checked (job card revamp phase 2). */
  const fullCheckIn = () => ({
    create: { fuelLevel: 'HALF' as const, checklist: Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.code, 'PRESENT'])) },
  });

  afterAll(async () => { await db?.$disconnect(); });

  /** A job at a stage, with the approved scope and advance the workflow gates need. */
  async function job(stage: JobStage, status: string, extra: Record<string, unknown> = {}) {
    const card = await db.jobCard.create({ data: {
      branchId, customerId, vehicleId, jobNumber: `STG-${run}-${++sequence}`, description: 'Stage test job', status, stage,
      serviceAdvisorId: users.advisor.id, technicianId: users.technician.id, openingSignatureRequired: false,
      promisedAt: new Date(Date.now() + 2 * 86_400_000), complaints: { create: { description: 'Noise from front left wheel when braking' } },
      mileage: 48_250, serviceTypeId, checkIn: fullCheckIn(),
      ...extra,
    } });
    await db.receipt.create({ data: { receiptNumber: `STG-ADV-${run}-${sequence}`, branchId, customerId, advanceJobCardId: card.id, amount: 9000, advanceAmount: 9000 } });
    await db.estimate.create({ data: {
      branchId, jobCardId: card.id, customerId, description: 'Approved scope', amount: 15000, status: 'Approved',
      lines: { create: [{ type: 'LABOUR', referenceId: labourItemId, description: 'Brake pad replacement', quantity: 1, rate: 15000, amount: 15000 }, { type: 'SERVICE', referenceId: serviceTypeId, description: 'Periodic service', quantity: 1, rate: 0, amount: 0 }] },
      approvals: { create: { customerId, approved: true, status: 'Approved', signatureRequired: false, overrideReason: 'Synthetic test approval' } },
    } });
    return card;
  }

  const act = (id: string, action: StageAction, who: keyof typeof users, note?: string, requestId = randomUUID()) =>
    stages.act(id, { action, note, requestId }, users[who]);
  const current = (id: string) => db.jobCard.findUniqueOrThrow({ where: { id }, select: { stage: true, status: true, stageOwnerId: true, stageOwnerRole: true } });
  /** The supervisor passes the quality check (phase 7): every line, the general checks, road test and signature. */
  async function passQc(id: string) {
    const workLines = await db.jobWorkLine.findMany({ where: { jobCardId: id }, select: { id: true } });
    await qc.record(id, { ...users.supervisor, branchId, permissions: ['jobcard:update', 'qcstatus:update'] }, {
      requestId: randomUUID(), outcome: 'PASS', lines: workLines.map(line => ({ workLineId: line.id, result: 'PASS' as const })),
      general: QC_GENERAL_CHECKS.map(check => ({ code: check.code, passed: true })), acOutletTempC: 6,
      roadTestStartKm: 48_250, roadTestEndKm: 48_258, roadTestNotes: null, notes: null, signatureImage: SIGNATURE,
    });
  }
  async function expectAt(id: string, stage: JobStage, status: string) {
    const row = await current(id);
    expect({ stage: row.stage, status: row.status }).toEqual({ stage, status });
    expect(stageAllowsStatus(row.stage, row.status)).toBe(true);
    return row;
  }

  it('walks a job from check-in to closed through every step, keeping stage and status together', async () => {
    const card = await job('CHECK_IN', 'OPEN', { technicianId: null });

    const checkIn = await stages.workspace(card.id, users.advisor);
    expect(checkIn).toMatchObject({ stage: 'CHECK_IN', subStep: 'SEND_TO_WORKSHOP', readOnly: false });
    expect(checkIn.actions.map(a => [a.action, a.kind, a.enabled])).toEqual([['SEND_TO_SUPERVISOR', 'primary', true], ['CANCEL', 'danger', true]]);

    await act(card.id, 'SEND_TO_SUPERVISOR', 'advisor');
    expect(await expectAt(card.id, 'DIAGNOSIS', 'OPEN')).toMatchObject({ stageOwnerId: null, stageOwnerRole: 'WorkshopManager' });

    await workshop.assignTechnician(card.id, users.technician.id, undefined, users.supervisor.id, { bayId, actorRole: users.supervisor.role });
    expect(await expectAt(card.id, 'DIAGNOSIS', 'OPEN')).toMatchObject({ stageOwnerId: users.technician.id, stageOwnerRole: 'Technician' });

    await sendFindings(card.id);
    expect(await expectAt(card.id, 'DIAGNOSIS', 'OPEN')).toMatchObject({ stageOwnerId: null, stageOwnerRole: 'Engineer' });
    await act(card.id, 'SEND_TO_ADVISOR', 'engineer');
    expect(await expectAt(card.id, 'ESTIMATE', 'OPEN')).toMatchObject({ stageOwnerId: users.advisor.id });

    await act(card.id, 'RELEASE_TO_REPAIR', 'advisor');
    await expectAt(card.id, 'REPAIR', 'IN_PROGRESS');
    await act(card.id, 'PAUSE_FOR_PARTS', 'technician');
    await expectAt(card.id, 'REPAIR', 'WAITING_PARTS');
    await act(card.id, 'RESUME_REPAIR', 'technician');
    await expectAt(card.id, 'REPAIR', 'IN_PROGRESS');

    await labour.addJobCardLine(card.id, { labourItemId, technicianId: users.technician.id }, users.technician.id);
    await db.$transaction(tx => lines.syncLines(tx, card.id));

    // Release created the work list (phase 6); the quality check waits until every line is done.
    expect(await db.jobWorkLine.count({ where: { jobCardId: card.id } })).toBeGreaterThan(0);
    await expect(act(card.id, 'SEND_TO_QC', 'technician')).rejects.toMatchObject({ statusCode: 409 });
    // The work list itself is covered by job-repair.integration.test.ts; here the technician has finished it.
    await db.jobWorkLine.updateMany({ where: { jobCardId: card.id }, data: { status: 'DONE', doneAt: new Date() } });
    await act(card.id, 'SEND_TO_QC', 'technician');
    await expectAt(card.id, 'QUALITY_CHECK', 'QC');
    await passQc(card.id);
    expect(await expectAt(card.id, 'BILLING', 'QC')).toMatchObject({ stageOwnerId: users.advisor.id, stageOwnerRole: 'ServiceAdviser' });

    await act(card.id, 'MARK_READY', 'advisor');
    expect(await expectAt(card.id, 'BILLING', 'READY')).toMatchObject({ stageOwnerId: null, stageOwnerRole: 'BillingOfficer' });

    await billing.createJobBill({ jobCardId: card.id, serviceAdvisorId: users.advisor.id, actorId: users.billing.id, partsDiscountPercent: 0, labourDiscountPercent: 0 });
    // Phase 8: the invoiced job waits at billing with the advisor until it is paid (or credit approved).
    expect(await expectAt(card.id, 'BILLING', 'BILLED')).toMatchObject({ stageOwnerId: users.advisor.id, stageOwnerRole: 'ServiceAdviser' });

    await workflow.approveCredit(card.id, users.admin.id, 'Fleet account on credit terms');
    await act(card.id, 'SEND_TO_DELIVERY', 'advisor');
    expect(await expectAt(card.id, 'DELIVERY', 'BILLED')).toMatchObject({ stageOwnerId: users.advisor.id, stageOwnerRole: 'ServiceAdviser' });
    // Phase 9: only the Deliver action (run by the delivery service after the signature) delivers a service job.
    await expect(workflow.update(card.id, { status: 'DELIVERED', deliveryAdvisorId: users.advisor.id }, users.advisor.id)).rejects.toThrow(
      'Deliver the vehicle from the Delivery step of the job card.',
    );
    await expect(act(card.id, 'DELIVER', 'advisor')).rejects.toMatchObject({ statusCode: 409, code: 'STAGE_ACTION_BLOCKED' });
    await db.$transaction(tx =>
      stages.actInTx(tx, card.id, { action: 'DELIVER', requestId: randomUUID(), note: 'Vehicle handed over', delivery: { deliveryAdvisorId: users.advisor.id, lateReasonIds: [] } }, users.advisor),
    );
    await expectAt(card.id, 'CLOSED', 'DELIVERED');

    const closed = await stages.workspace(card.id, users.advisor);
    expect(closed).toMatchObject({ stage: 'CLOSED', readOnly: true, actions: [], owner: null });
    expect(closed.summaries.map(s => [s.stage, s.state])).toEqual([
      ['CHECK_IN', 'COMPLETED'], ['DIAGNOSIS', 'COMPLETED'], ['WARRANTY', 'SKIPPED'], ['ESTIMATE', 'COMPLETED'],
      ['REPAIR', 'COMPLETED'], ['QUALITY_CHECK', 'COMPLETED'], ['BILLING', 'COMPLETED'], ['DELIVERY', 'COMPLETED'],
    ]);
    expect(closed.summaries[0].by).toBe('Advisor Synthetic');

    const events = await db.jobStageEvent.findMany({ where: { jobCardId: card.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map(e => e.toStage)).toEqual([
      'DIAGNOSIS', 'DIAGNOSIS', 'DIAGNOSIS', 'ESTIMATE', 'REPAIR', 'REPAIR', 'REPAIR', 'QUALITY_CHECK', 'BILLING', 'BILLING', 'BILLING', 'DELIVERY', 'CLOSED',
    ]);
    const audits = await db.auditLog.count({ where: { action: 'JOB_STAGE_CHANGED', details: { contains: card.id } } });
    expect(audits).toBe(events.length);
    const history = await db.jobCardStatusHistory.findMany({ where: { jobCardId: card.id }, orderBy: { createdAt: 'asc' }, select: { toStatus: true } });
    expect(history.map(h => h.toStatus)).toEqual(['IN_PROGRESS', 'WAITING_PARTS', 'IN_PROGRESS', 'QC', 'READY', 'BILLED', 'DELIVERED']);
  });

  it('keeps an invoiced job at billing, back to ready when the bill is cancelled, and on to delivery on credit', async () => {
    const card = await job('REPAIR', 'IN_PROGRESS');
    await labour.addJobCardLine(card.id, { labourItemId, technicianId: users.technician.id }, users.technician.id);
    await db.$transaction(tx => lines.syncLines(tx, card.id));
    await db.jobCard.update({ where: { id: card.id }, data: { status: 'READY', stage: 'BILLING' } });
    await setQcResult(db, card.id, 'PASSED');
    await db.receipt.deleteMany({ where: { advanceJobCardId: card.id } });

    const blocked = await stages.workspace(card.id, users.advisor);
    expect(blocked.actions.find(a => a.action === 'SEND_TO_DELIVERY')).toMatchObject({ enabled: false, reasons: ['Create the invoice before sending the job to delivery.'] });

    const bill = await billing.createJobBill({ jobCardId: card.id, serviceAdvisorId: users.advisor.id, actorId: users.billing.id, partsDiscountPercent: 0, labourDiscountPercent: 0 });
    await expectAt(card.id, 'BILLING', 'BILLED');
    await billing.cancelJobBill(bill.id, users.billing.id, 'Wrong discount');
    await expectAt(card.id, 'BILLING', 'READY');

    await workflow.approveCredit(card.id, users.admin.id, 'Fleet account on credit terms');
    await act(card.id, 'SEND_TO_DELIVERY', 'advisor');
    await expectAt(card.id, 'DELIVERY', 'READY');
  });

  it('routes a warranty vehicle through the warranty officer and tells them through the outbox', async () => {
    const card = await job('DIAGNOSIS', 'OPEN', { warrantyStatusAtCreation: 'ACTIVE' });
    await sendFindings(card.id);
    const view = await stages.workspace(card.id, users.engineer);
    expect(view.actions.map(a => a.action)).toEqual(['SEND_TO_WARRANTY', 'RETURN_TO_TECHNICIAN']);
    expect(view.warrantyJob).toBe(true);
    await expect(act(card.id, 'SEND_TO_ADVISOR', 'engineer')).rejects.toMatchObject({ statusCode: 409, code: 'STAGE_ACTION_BLOCKED' });

    await act(card.id, 'SEND_TO_WARRANTY', 'engineer');
    expect(await expectAt(card.id, 'WARRANTY', 'OPEN')).toMatchObject({ stageOwnerId: null, stageOwnerRole: 'WarrantyOfficer' });
    const notice = await db.notification.findFirst({ where: { userId: users.warranty.id, type: 'STAGE_HANDOFF', link: `/job-cards/${card.id}` } });
    expect(notice).toMatchObject({ title: 'Job sent to you' });
    expect(notice?.message).toContain('Step: Warranty check');

    expect((await stages.workspace(card.id, users.advisor)).readOnly).toBe(true);
    await expect(act(card.id, 'WARRANTY_TO_ADVISOR', 'advisor')).rejects.toMatchObject({ statusCode: 403, code: 'STAGE_ACTION_FORBIDDEN' });
    await act(card.id, 'WARRANTY_TO_ADVISOR', 'warranty');
    await expectAt(card.id, 'ESTIMATE', 'OPEN');
    const summaries = (await stages.workspace(card.id, users.advisor)).summaries;
    expect(summaries.find(s => s.stage === 'WARRANTY')).toMatchObject({ state: 'COMPLETED', by: 'Warranty Synthetic' });
  });

  it('is idempotent per request ID and refuses a reused ID for another action', async () => {
    const card = await job('CHECK_IN', 'OPEN');
    const requestId = randomUUID();
    await act(card.id, 'SEND_TO_SUPERVISOR', 'advisor', undefined, requestId);
    const again = await act(card.id, 'SEND_TO_SUPERVISOR', 'advisor', undefined, requestId);
    expect(again.stage).toBe('DIAGNOSIS');
    expect(await db.jobStageEvent.count({ where: { jobCardId: card.id } })).toBe(1);
    await expect(act(card.id, 'CANCEL', 'advisor', 'Customer withdrew', requestId)).rejects.toMatchObject({ statusCode: 409, code: 'STAGE_REQUEST_REUSED' });
  });

  it('returns 409 with reasons for blocked moves, 403 for the wrong person and 404 for a missing job', async () => {
    const unsigned = await job('CHECK_IN', 'OPEN', { openingSignatureRequired: true });
    const blocked = act(unsigned.id, 'SEND_TO_SUPERVISOR', 'advisor');
    await expect(blocked).rejects.toMatchObject({ statusCode: 409, code: 'STAGE_ACTION_BLOCKED' });
    await expect(blocked).rejects.toHaveProperty('details.reasons', ["Get the customer's signature on Customer consent."]);
    expect((await stages.workspace(unsigned.id, users.advisor)).subStep).toBe('CUSTOMER_CONSENT');

    const noAdvance = await job('ESTIMATE', 'OPEN');
    await db.receipt.deleteMany({ where: { advanceJobCardId: noAdvance.id } });
    await expect(act(noAdvance.id, 'RELEASE_TO_REPAIR', 'advisor')).rejects.toHaveProperty('details.reasons', ['Ask the cashier to record the advance before work starts']);
    await expectAt(noAdvance.id, 'ESTIMATE', 'OPEN');

    const repair = await job('REPAIR', 'IN_PROGRESS');
    await expect(act(repair.id, 'SEND_TO_QC', 'otherTechnician')).rejects.toMatchObject({ statusCode: 403, details: { reasons: ['Only the technician assigned to this job can do this.'] } });
    await expect(act(repair.id, 'SEND_TO_SUPERVISOR', 'advisor')).rejects.toMatchObject({ statusCode: 409 });
    await expect(act(randomUUID(), 'SEND_TO_SUPERVISOR', 'advisor')).rejects.toMatchObject({ statusCode: 404 });
    await expect(act(repair.id, 'CANCEL', 'advisor')).rejects.toMatchObject({ statusCode: 400, details: { field: 'note' } });
  });

  it('offers no actions and shows the step read-only to someone who cannot update job cards', async () => {
    const card = await job('ESTIMATE', 'OPEN');
    const view = await stages.workspace(card.id, users.advisor, { canUpdate: false });
    expect(view).toMatchObject({ readOnly: true, actions: [] });
    expect((await stages.workspace(card.id, users.advisor)).actions.map(a => a.action)).toContain('CANCEL');
  });

  it('cancels with a reason and shows who cancelled it', async () => {
    const card = await job('ESTIMATE', 'OPEN');
    const view = await act(card.id, 'CANCEL', 'advisor', 'Customer took the vehicle elsewhere');
    expect(view).toMatchObject({ stage: 'CANCELLED', readOnly: true, actions: [] });
    expect(view.cancellation).toMatchObject({ by: 'Advisor Synthetic', reason: 'Customer took the vehicle elsewhere' });
    expect(view.warrantyJob).toBe(false);
    // The Activity tab lists the newest step change first, with who did it and the note.
    expect(view.activity[0]).toMatchObject({ fromStage: 'ESTIMATE', toStage: 'CANCELLED', action: 'CANCEL', by: 'Advisor Synthetic', note: 'Customer took the vehicle elsewhere' });
    await expectAt(card.id, 'CANCELLED', 'CANCELLED');
  });

  it('lists the last two earlier visits of the vehicle, leaving out cancelled and PDI jobs', async () => {
    const own = (await db.vehicle.create({ data: { vin: `STGVISIT${run}`, customModel: 'Synthetic Sportage', customerId } })).id;
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
    const oldest = await job('CLOSED', 'DELIVERED', { vehicleId: own, createdAt: at(90), mileage: 30_000 });
    const older = await job('CLOSED', 'DELIVERED', { vehicleId: own, createdAt: at(60), mileage: 35_000, workDone: 'Front brake pads replaced.' });
    await job('CANCELLED', 'CANCELLED', { vehicleId: own, createdAt: at(30) });
    await job('CLOSED', 'DELIVERED', { vehicleId: own, createdAt: at(20), jobType: 'PDI' });
    const recent = await job('CLOSED', 'DELIVERED', { vehicleId: own, createdAt: at(10), mileage: 40_000 });
    const card = await job('CHECK_IN', 'OPEN', { vehicleId: own });

    const visits = (await stages.workspace(card.id, users.advisor)).previousVisits;
    expect(visits.map(v => v.id)).toEqual([recent.id, older.id]);
    expect(visits[1]).toMatchObject({ jobNumber: older.jobNumber, mileage: 35_000, workDone: 'Front brake pads replaced.', requests: ['Noise from front left wheel when braking'] });
    expect(visits.map(v => v.id)).not.toContain(oldest.id);
    expect((await stages.workspace(oldest.id, users.advisor)).previousVisits).toEqual([]);
  });

  it('keeps the stage in step when the existing paths change status or QC', async () => {
    // Old lifecycle path: the technician starts work the way they do today.
    const open = await job('ESTIMATE', 'OPEN');
    await workflow.update(open.id, { status: 'IN_PROGRESS' }, users.technician.id);
    await expectAt(open.id, 'REPAIR', 'IN_PROGRESS');

    // New labour after the handoff needs a fresh QC: the passed check is superseded.
    const relabour = await job('BILLING', 'QC');
    await setQcResult(db, relabour.id, 'PASSED');
    await labour.addJobCardLine(relabour.id, { labourItemId, technicianId: users.technician.id }, users.technician.id);
    await expectAt(relabour.id, 'QUALITY_CHECK', 'QC');
    expect(await qcState.loadQcState(db, relabour.id)).toBe('PENDING');
    expect(await db.inspection.count({ where: { jobCardId: relabour.id } })).toBe(1);

    // Changed issued work on a ready job reopens it for repair.
    const ready = await job('BILLING', 'READY');
    await setQcResult(db, ready.id, 'PASSED');
    const { applyJobWorkChange } = require('../requisition/requisition-work') as typeof import('../requisition/requisition-work');
    await db.$transaction(tx => applyJobWorkChange(tx, { id: ready.id, status: 'READY', openingSignatureRequired: false }, users.advisor.id));
    await expectAt(ready.id, 'REPAIR', 'IN_PROGRESS');

    // Cancelling through the old path records the reason as the stage note.
    const cancelled = await job('DIAGNOSIS', 'OPEN');
    await workflow.update(cancelled.id, { status: 'CANCELLED', remarks: 'Duplicate job card' }, users.supervisor.id);
    expect((await stages.workspace(cancelled.id, users.supervisor)).cancellation).toMatchObject({ reason: 'Duplicate job card' });
  });

  it('never leaves a job in this branch with a stage that disagrees with its status', async () => {
    const rows = await db.jobCard.findMany({ where: { branchId }, select: { jobNumber: true, stage: true, status: true } });
    expect(rows.filter(row => !stageAllowsStatus(row.stage, row.status))).toEqual([]);
  });
});
