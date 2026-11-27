// Never execute against a remote or ordinary application database.
const testUrl = process.env.TEST_DATABASE_URL;
const localStaging = testUrl && ['localhost', '127.0.0.1'].includes(new URL(testUrl).hostname)
  && new URL(testUrl).pathname === '/notification_staging';
if (localStaging) process.env.DATABASE_URL = testUrl;

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ROLES, PERMISSIONS } from '../../shared/constants/roles';
import { drainJobcardNotifications, replayJobcardNotification, sendJobcardReminders, setNotificationActor } from './jobcard-notification-router';
import { jobWorkUpdate } from '../requisition/requisition-work';
import { updateServiceJobInspection } from '../service/service-job-inspection';

jest.setTimeout(90_000);

const integration = localStaging ? describe : describe.skip;
integration('local staging jobcard notification flow', () => {
  const suffix = randomUUID();
  let branchId: string;
  let cardId: string;
  const users: Record<string, string> = {};
  const createdCards: string[] = [];

  beforeAll(async () => {
    const branch = await prisma.branch.create({ data: { name: `notification-staging-${suffix}` } });
    branchId = branch.id;
    for (const [label, name] of Object.entries({ admin: ROLES.ADMIN, manager: ROLES.WORKSHOP_MANAGER, advisor: ROLES.SERVICE_ADVISOR, tech: ROLES.TECHNICIAN, techB: ROLES.TECHNICIAN, qc: ROLES.ENGINEER, qcOfficer: ROLES.QC_OFFICER, warranty: ROLES.WARRANTY_OFFICER, billing: ROLES.BILLING_OFFICER, store: ROLES.BRANCH_STORE_MANAGER, ccu: ROLES.CCU_OFFICER, actor: 'NotificationTestActor', requester: 'NotificationTestRequester' })) {
      const role = await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
      const user = await prisma.user.create({ data: { email: `${label}-${suffix}@example.invalid`, firstName: label, lastName: 'Test', passwordHash: 'disabled-test-account', roleId: role.id, branchId } });
      users[label] = user.id;
      if (label === 'qc') {
        const permission = await prisma.permission.upsert({ where: { name: PERMISSIONS.QCSTATUS_UPDATE }, create: { name: PERMISSIONS.QCSTATUS_UPDATE }, update: {} });
        await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
      }
    }
  });

  async function create(assigned: boolean) {
    const card = await prisma.jobCard.create({ data: { branchId, jobNumber: `NOTIFY-${randomUUID()}`, description: 'Synthetic notification staging flow', status: 'OPEN', technicianId: assigned ? users.tech : null, qualityInspectorId: users.qc, serviceAdvisorId: users.advisor, deliveryAdvisorId: users.advisor, createdById: users.requester } });
    createdCards.push(card.id);
    const captured = await prisma.jobcardNotificationEvent.findFirstOrThrow({ where: { jobCardId: card.id } });
    expect(Math.abs(captured.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
    await drainJobcardNotifications(card.id);
    return card.id;
  }
  async function change(data: Prisma.JobCardUncheckedUpdateInput, actorId = users.actor) {
    await prisma.$transaction(async tx => {
      await setNotificationActor(tx, actorId);
      await tx.jobCard.update({ where: { id: cardId }, data });
    });
    await drainJobcardNotifications(cardId);
    const event = await prisma.jobcardNotificationEvent.findFirstOrThrow({ where: { jobCardId: cardId }, orderBy: { createdAt: 'desc' } });
    return prisma.notification.findMany({ where: { dedupeKey: { contains: `:${event.id}:` } } });
  }
  const expectUsers = (rows: { userId: string | null }[], labels: string[]) => expect(rows.map(row => row.userId).sort()).toEqual(labels.map(label => users[label]).sort());

  it('captures rollback safely and only after commit', async () => {
    let rolledBackId = '';
    await expect(prisma.$transaction(async tx => {
      const card = await tx.jobCard.create({ data: { branchId, jobNumber: `ROLLBACK-${suffix}`, description: 'Rollback test', createdById: users.actor } });
      rolledBackId = card.id;
      expect(await tx.jobcardNotificationEvent.count({ where: { jobCardId: card.id } })).toBe(0);
      throw new Error('ROLLBACK');
    })).rejects.toThrow('ROLLBACK');
    expect(await prisma.jobcardNotificationEvent.count({ where: { jobCardId: rolledBackId } })).toBe(0);
  });

  it('walks creation, A → B → A, work, failed QC, rework, pass, Ready, billing, rebilling and delivery', async () => {
    cardId = await create(false);
    expectUsers(await prisma.notification.findMany({ where: { dedupeKey: { startsWith: `jobcard:${cardId}:` } } }), ['manager', 'advisor']);
    expectUsers(await change({ technicianId: users.tech }), ['tech']);
    expectUsers(await change({ technicianId: users.techB }), ['techB']);
    expectUsers(await change({ technicianId: users.tech }), ['tech']);
    const count = await prisma.notification.count({ where: { dedupeKey: { startsWith: `jobcard:${cardId}:` } } });
    await change({ technicianId: users.tech });
    expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: `jobcard:${cardId}:` } } })).toBe(count);
    expectUsers(await change({ status: 'IN_PROGRESS' }), ['tech', 'advisor']);
    expectUsers(await change({ status: 'WAITING_PARTS' }), ['store', 'advisor']);
    expectUsers(await change({ status: 'IN_PROGRESS' }), ['tech']);
    expectUsers(await change({ status: 'QC' }), ['qc']);
    expectUsers(await change({ qcStatus: 'FAILED', qcNotes: 'Repeat inspection repair' }, users.qc), ['tech', 'advisor', 'manager']);
    expectUsers(await change({ status: 'IN_PROGRESS' }), []);
    expectUsers(await change({ status: 'QC', qcStatus: 'PENDING' }), ['qc']);
    expectUsers(await change({ qcStatus: 'PASSED' }, users.qc), ['advisor', 'tech']);
    expectUsers(await change({ status: 'READY' }, users.advisor), ['billing', 'ccu']);
    expectUsers(await change({ status: 'BILLED' }, users.billing), ['advisor']);
    expectUsers(await change({ status: 'READY' }, users.billing), ['advisor']);
    expectUsers(await change({ status: 'IN_PROGRESS', qcStatus: 'PENDING' }), ['tech']);
    expectUsers(await change({ status: 'QC' }), ['qc']);
    expectUsers(await change({ qcStatus: 'PASSED' }), ['advisor', 'tech']);
    expectUsers(await change({ status: 'READY' }), ['billing', 'ccu']);
    expectUsers(await change({ status: 'QC', qcStatus: 'PENDING' }), ['qc']); // estimate revision
    await change({ qcStatus: 'PASSED' });
    await change({ status: 'READY' });
    await change({ status: 'BILLED' });
    expectUsers(await change({ status: 'DELIVERED' }, users.advisor), ['requester', 'manager']);
    const beforeRetry = await prisma.notification.count({ where: { dedupeKey: { startsWith: `jobcard:${cardId}:` } } });
    await drainJobcardNotifications(cardId);
    const last = await prisma.jobcardNotificationEvent.findFirstOrThrow({ where: { jobCardId: cardId }, orderBy: { createdAt: 'desc' } });
    await replayJobcardNotification(last.id);
    expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: `jobcard:${cardId}:` } } })).toBe(beforeRetry);
    const rows = await prisma.notification.findMany({ where: { dedupeKey: { startsWith: `jobcard:${cardId}:` } } });
    expect(rows.every(row => row.link === `/job-cards/${cardId}`)).toBe(true);
    expect(await prisma.jobcardNotificationAudit.count({ where: { jobCardId: cardId, status: 'DELIVERED' } })).toBe(rows.length);
  });

  it('queues a strict inspection once and routes strict QC handoffs to the correct staff', async () => {
    cardId = await create(true);
    await prisma.serviceJobWorkflow.create({
      data: { jobCardId: cardId, stage: 'TECHNICIAN_ASSIGNED', faultVerification: 'Noise verified', faultVerifiedById: users.advisor },
    });
    const inspection = { action: 'submitInspection' as const, version: 0, remarks: 'No parts required', noPartsRequired: true, parts: [] };
    const technician = { userId: users.tech, role: ROLES.TECHNICIAN };
    const retries = await Promise.all([
      updateServiceJobInspection(cardId, branchId, technician, inspection),
      updateServiceJobInspection(cardId, branchId, technician, inspection),
    ]);
    expect(retries.map(workflow => workflow.version)).toEqual([1, 1]);
    await expect(updateServiceJobInspection(cardId, branchId, technician, { ...inspection, remarks: 'Different inspection' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_VERSION_CONFLICT' });
    await drainJobcardNotifications(cardId);
    const inspectionNotifications = await prisma.notification.findMany({ where: { type: 'INSPECTION_SUBMITTED', link: `/job-cards/${cardId}?tab=warranty` } });
    expectUsers(inspectionNotifications, ['warranty']);
    expect(inspectionNotifications[0].message).toContain('No parts required');

    const savedBypass = process.env.SERVICE_JOB_WARRANTY_BYPASS_ENABLED;
    process.env.SERVICE_JOB_WARRANTY_BYPASS_ENABLED = 'true';
    try {
      await updateServiceJobInspection(cardId, branchId, { userId: users.advisor, role: ROLES.SERVICE_ADVISOR }, { action: 'bypassWarranty', version: 1 });
    } finally {
      if (savedBypass === undefined) delete process.env.SERVICE_JOB_WARRANTY_BYPASS_ENABLED;
      else process.env.SERVICE_JOB_WARRANTY_BYPASS_ENABLED = savedBypass;
    }
    await drainJobcardNotifications(cardId);
    expectUsers(await prisma.notification.findMany({
      where: { type: 'WARRANTY_RESOLVED', link: `/job-cards/${cardId}?tab=estimate` },
    }), ['advisor']);

    expectUsers(await change({ status: 'QC' }, users.tech), ['advisor', 'qcOfficer']);
    const failed = await change({ status: 'IN_PROGRESS', qcStatus: 'FAILED', qcNotes: 'Repeat inspection repair' }, users.qcOfficer);
    expectUsers(failed, ['tech', 'advisor', 'manager']);
    expect(failed.every(row => row.message.includes('Repeat inspection repair') && row.link?.endsWith('?tab=qc'))).toBe(true);
    expectUsers(await change({ status: 'QC', qcStatus: 'PENDING' }, users.tech), ['advisor', 'qcOfficer']);
    expectUsers(await change({ qcStatus: 'PASSED' }, users.qcOfficer), ['advisor']);
    expectUsers(await change({ status: 'READY' }, users.advisor), ['billing']);
  });

  it('handles assigned creation, cancellation, legacy aliases, QC fallback and empty-role fallback', async () => {
    cardId = await create(true);
    expectUsers(await prisma.notification.findMany({ where: { dedupeKey: { startsWith: `jobcard:${cardId}:` } } }), ['tech']);
    const initialEvents = await prisma.jobcardNotificationEvent.count({ where: { jobCardId: cardId } });
    await change({ status: 'Pending' });
    expect(await prisma.jobcardNotificationAudit.count({ where: { jobCardId: cardId, eventType: 'STATUS' } })).toBe(0);
    expect(await prisma.jobcardNotificationEvent.count({ where: { jobCardId: cardId } })).toBe(initialEvents + 1);
    expectUsers(await change({ status: 'Quality Check', qualityInspectorId: null }), ['qc', 'qcOfficer']);
    await prisma.user.update({ where: { id: users.store }, data: { isActive: false } });
    const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    expectUsers(await change({ status: 'WAITING_PARTS' }), ['admin', 'advisor']);
    expect(warning).toHaveBeenCalled(); warning.mockRestore();
    expectUsers(await change({ status: 'CANCELLED' }, users.advisor), ['requester', 'manager']);
    await prisma.user.update({ where: { id: users.store }, data: { isActive: true } });
  });

  it('reminds/escalates once with shortened timers and suppresses stale terminal actions', async () => {
    cardId = await create(true);
    const oldRemind = process.env.JOB_NOTIFICATION_REMIND_HOURS;
    const oldEscalate = process.env.JOB_NOTIFICATION_ESCALATE_HOURS;
    try {
      process.env.JOB_NOTIFICATION_REMIND_HOURS = '0.001';
      process.env.JOB_NOTIFICATION_ESCALATE_HOURS = '0.002';
      const now = new Date('2026-11-12T12:00:00Z');
      await prisma.jobcardNotificationEvent.updateMany({ where: { jobCardId: cardId }, data: { createdAt: new Date(now.getTime() - 10_000) } });
      await sendJobcardReminders(now);
      await drainJobcardNotifications(cardId, now);
      const timers = await prisma.notification.findMany({ where: { dedupeKey: { startsWith: `jobcard:${cardId}:` }, type: { in: ['JOBCARD_REMINDER', 'JOBCARD_ESCALATION'] } } });
      expectUsers(timers, ['tech', 'manager']);
      await sendJobcardReminders(now); await drainJobcardNotifications(cardId, now);
      expect(await prisma.notification.count({ where: { id: { in: timers.map(row => row.id) } } })).toBe(2);
      await change({ status: 'CANCELLED' });
      await sendJobcardReminders(new Date(now.getTime() + 60_000));
      expect(await prisma.jobcardNotificationEvent.count({ where: { jobCardId: cardId, id: { startsWith: 'timer:' } } })).toBe(2);
    } finally {
      if (oldRemind === undefined) delete process.env.JOB_NOTIFICATION_REMIND_HOURS; else process.env.JOB_NOTIFICATION_REMIND_HOURS = oldRemind;
      if (oldEscalate === undefined) delete process.env.JOB_NOTIFICATION_ESCALATE_HOURS; else process.env.JOB_NOTIFICATION_ESCALATE_HOURS = oldEscalate;
    }
  });

  it('records a durable send failure, alerts Admin and replays without duplicates', async () => {
    cardId = await create(true);
    const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION notification_test_send_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'JOBCARD_STATUS' THEN RAISE EXCEPTION 'Synthetic notification send failure'; END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe('CREATE TRIGGER notification_test_send_failure BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION notification_test_send_failure()');
      await change({ status: 'IN_PROGRESS' });
      const failure = await prisma.notificationFailure.findFirstOrThrow({ where: { jobCardId: cardId } });
      expect(failure.attempts).toBe(4);
      expect(await prisma.notification.count({ where: { userId: users.admin, type: 'JOBCARD_NOTIFICATION_FAILURE', link: `/job-cards/${cardId}` } })).toBe(1);
      await prisma.$executeRawUnsafe('DROP TRIGGER notification_test_send_failure ON "Notification"');
      await prisma.$executeRawUnsafe('DROP FUNCTION notification_test_send_failure()');
      await replayJobcardNotification(failure.eventId);
      await replayJobcardNotification(failure.eventId);
      expectUsers(await prisma.notification.findMany({ where: { type: 'JOBCARD_STATUS', link: `/job-cards/${cardId}` } }), ['tech', 'advisor']);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS notification_test_send_failure ON "Notification"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS notification_test_send_failure()');
      warning.mockRestore();
    }
  });

  it('resolves a nested status-history actor after commit and excludes that inspector', async () => {
    cardId = await create(true);
    await prisma.jobCard.update({ where: { id: cardId }, data: { status: 'QC', statusHistory: { create: { fromStatus: 'OPEN', toStatus: 'QC', actorId: users.qc } } } });
    await drainJobcardNotifications(cardId);
    const event = await prisma.jobcardNotificationEvent.findFirstOrThrow({ where: { jobCardId: cardId }, orderBy: { createdAt: 'desc' } });
    expect(event.actorId).toBe(users.qc);
    expect(await prisma.notification.count({ where: { dedupeKey: { contains: `:${event.id}:` } } })).toBe(0);
  });

  it('routes inspector reassignment and preserves the actor on parts/labour QC resets', async () => {
    cardId = await create(true);
    await change({ status: 'QC' });
    expectUsers(await change({ qualityInspectorId: users.techB }), ['techB']);
    await change({ qcStatus: 'PASSED' });
    await prisma.$transaction(async tx => {
      const update = await jobWorkUpdate(tx, { id: cardId, status: 'QC' }, users.techB, 'Labour slip');
      await tx.jobCard.update({ where: { id: cardId }, data: update });
    });
    await drainJobcardNotifications(cardId);
    const event = await prisma.jobcardNotificationEvent.findFirstOrThrow({ where: { jobCardId: cardId }, orderBy: { createdAt: 'desc' } });
    expect(event.actorId).toBe(users.techB);
    expect(await prisma.notification.count({ where: { dedupeKey: { contains: `:${event.id}:` } } })).toBe(0);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { branchId } });
    await prisma.jobcardNotificationAudit.deleteMany({ where: { jobCardId: { in: createdCards } } });
    await prisma.jobcardNotificationEvent.deleteMany({ where: { jobCardId: { in: createdCards } } });
    await prisma.notificationFailure.deleteMany({ where: { jobCardId: { in: createdCards } } });
    await prisma.jobCard.deleteMany({ where: { branchId } });
    await prisma.user.deleteMany({ where: { branchId } });
    await prisma.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
  });
});
