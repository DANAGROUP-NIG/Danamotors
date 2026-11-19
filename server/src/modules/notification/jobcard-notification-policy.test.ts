import { ROLES, PERMISSIONS } from '../../shared/constants/roles';
import { promisedReminderEvents, notificationDueLabel } from './jobcard-notification-policy';
import { actionTargets, canonicalNotificationStatus, isWorkingTime, notificationEvents, notificationPolicy, reminderEvents, routeJobNotification, type NotificationJob } from './jobcard-notification-policy';

const card: NotificationJob = { id: 'job', branchId: 'branch', jobNumber: 'J1', status: 'OPEN', technicianId: 'tech', qualityInspectorId: 'inspector', serviceAdvisorId: 'advisor', deliveryAdvisorId: 'delivery', createdById: 'requester', customerId: 'customer', qcStatus: 'PENDING', qcNotes: null, promisedAt: null };
const target = (from: string, to: string) => routeJobNotification('STATUS', { ...card, status: from }, { ...card, status: to });

it.each([[24, ['PROMISED_24H']], [12.01, ['PROMISED_24H']], [12, ['PROMISED_12H']], [1, ['PROMISED_12H']], [0, []], [-1, []], [25, []]])('selects the most urgent pending promised window at %s hours', (hours, expected) => {
  const now = new Date('2026-11-12T12:00:00Z');
  expect(promisedReminderEvents(now, { ...card, promisedAt: new Date(now.getTime() + Number(hours) * 3600000).toISOString() })).toEqual(expected);
});
it.each(['READY', 'BILLED', 'DELIVERED', 'CANCELLED', 'Closed', 'Cancelled'])('does not remind completed or cancelled %s jobs about promised work', status => {
  expect(promisedReminderEvents(new Date('2026-11-12T12:00:00Z'), { ...card, status, promisedAt: '2026-11-13T10:00:00Z' })).toEqual([]);
});
it('formats notification deadlines in Lagos and handles absent dates without raw placeholders', () => {
  expect(notificationDueLabel('2026-11-12T23:30:00Z')).toContain('13 Nov 2026');
  expect(notificationDueLabel('2026-11-12T23:30:00')).toBe(notificationDueLabel('2026-11-12T23:30:00Z'));
  expect(notificationDueLabel(null)).toBe('Not provided');
  expect(notificationDueLabel('invalid')).toBe('Not provided');
});

it.each([
  ['Pending', 'OPEN'], ['On Hold', 'IN_PROGRESS'], ['Quality Check', 'QC'], ['Completed', 'READY'], ['Closed', 'DELIVERED'], ['Cancelled', 'CANCELLED'],
])('normalizes legacy %s', (legacy, canonical) => expect(canonicalNotificationStatus(legacy)).toBe(canonical));

it.each([
  ['OPEN', 'IN_PROGRESS', ['tech', 'advisor']],
  ['IN_PROGRESS', 'WAITING_PARTS', [ROLES.BRANCH_STORE_MANAGER, 'advisor']],
  ['WAITING_PARTS', 'IN_PROGRESS', ['tech']],
  ['IN_PROGRESS', 'QC', ['inspector']],
  ['WAITING_PARTS', 'QC', ['inspector']],
  ['READY', 'QC', ['inspector']],
  ['QC', 'IN_PROGRESS', []],
  ['QC', 'READY', [ROLES.BILLING_OFFICER, ROLES.CCU_OFFICER, 'customer']],
  ['READY', 'BILLED', ['delivery']],
  ['READY', 'DELIVERED', ['requester', ROLES.WORKSHOP_MANAGER, 'advisor']],
  ['BILLED', 'DELIVERED', ['requester', ROLES.WORKSHOP_MANAGER, 'advisor']],
  ['READY', 'IN_PROGRESS', ['tech']],
  ['BILLED', 'READY', [ROLES.BILLING_OFFICER, 'advisor']],
  ...['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'QC', 'READY'].map(from => [from, 'CANCELLED', ['requester', ROLES.WORKSHOP_MANAGER, 'advisor']]),
] as [string, string, string[]][])('routes %s → %s to exactly the required targets', (from, to, expected) => {
  expect(target(from, to).map(row => row.userId ?? row.role ?? row.customerId)).toEqual(expected);
});

it('routes creation with/without assignment and A → B → A as distinct events', () => {
  expect(routeJobNotification('CREATED', null, card).map(row => row.userId)).toEqual(['tech']);
  expect(routeJobNotification('CREATED', null, { ...card, technicianId: null }).map(row => row.role)).toEqual([ROLES.WORKSHOP_MANAGER, ROLES.SERVICE_ADVISOR]);
  const b = { ...card, technicianId: 'tech-b' };
  expect(notificationEvents(card, b)).toEqual(['ASSIGNED']);
  expect(notificationEvents(b, card)).toEqual(['ASSIGNED']);
  expect(notificationEvents(card, card)).toEqual([]);
});

it('routes only the assigned inspector, falling back to QC permission only when unassigned', () => {
  expect(target('READY', 'QC')).toEqual([{ userId: 'inspector', intent: 'Inspect completed work' }]);
  expect(routeJobNotification('STATUS', card, { ...card, status: 'QC', qualityInspectorId: null })).toEqual([{ permission: PERMISSIONS.QCSTATUS_UPDATE, intent: 'Inspect completed work' }]);
});

it('routes QC changes separately and suppresses repeated results/alias-only changes', () => {
  const qc = { ...card, status: 'QC' };
  const passed = { ...qc, qcStatus: 'PASSED' };
  expect(notificationEvents(qc, passed)).toEqual(['QC_PASSED']);
  expect(routeJobNotification('QC_PASSED', qc, passed).map(row => row.userId)).toEqual(['advisor', 'tech']);
  expect(routeJobNotification('QC_PASSED', qc, { ...passed, serviceAdvisorId: null })[0]?.role).toBe(ROLES.SERVICE_ADVISOR);
  expect(notificationEvents(qc, { ...qc, qcStatus: 'FAILED' })).toEqual(['QC_FAILED']);
  expect(routeJobNotification('QC_FAILED', qc, { ...qc, qcStatus: 'FAILED' }).map(row => row.userId ?? row.role)).toEqual(['tech', 'advisor', ROLES.WORKSHOP_MANAGER]);
  expect(routeJobNotification('QC_PASSED', qc, { ...passed, technicianId: null }).map(row => row.userId)).toEqual(['advisor']);
  expect(routeJobNotification('QC_FAILED', qc, { ...qc, technicianId: null }).map(row => row.userId ?? row.role)).toEqual(['advisor', ROLES.WORKSHOP_MANAGER]);
  expect(notificationEvents({ ...qc, qcStatus: 'FAILED' }, qc)).toEqual(['QC_REVIEW_REQUIRED']);
  expect(notificationEvents(qc, { ...qc, qcStatus: 'FAILED' })).toEqual(['QC_FAILED']);
  expect(notificationEvents(passed, { ...passed, qcNotes: 'Additional note' })).toEqual([]);
  expect(notificationEvents(card, { ...card, status: 'Pending' })).toEqual([]);
});

it('marks Ready customer/CCU and terminal recipients as FYI', () => {
  expect(target('QC', 'READY').map(row => !!row.fyi)).toEqual([false, true, true]);
  expect(target('READY', 'DELIVERED').every(row => row.fyi)).toBe(true);
  expect(target('OPEN', 'OPEN')).toEqual([]);
});

it('hands pending QC to a reassigned inspector and handles a QC reset without duplicating a status handoff', () => {
  const before = { ...card, status: 'QC' };
  const after = { ...before, qualityInspectorId: 'new-inspector' };
  expect(notificationEvents(before, after)).toEqual(['QC_REVIEW_REQUIRED']);
  expect(routeJobNotification('QC_REVIEW_REQUIRED', before, after)[0]?.userId).toBe('new-inspector');
  expect(notificationEvents({ ...before, qcStatus: 'PASSED' }, before)).toEqual(['QC_REVIEW_REQUIRED']);
  expect(notificationEvents({ ...before, status: 'READY', qcStatus: 'PASSED' }, after)).toEqual(['STATUS']);
});

it('reminds at 4 hours and escalates at 8 with configurable shortened timers', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  expect(reminderEvents(new Date('2026-11-12T09:00:00Z'), now, card)).toEqual([]);
  expect(reminderEvents(new Date('2026-11-12T08:00:00Z'), now, card)).toEqual(['REMINDER']);
  expect(reminderEvents(new Date('2026-11-12T04:00:00Z'), now, card)).toEqual(['REMINDER', 'ESCALATION']);
  const shortened = notificationPolicy({ JOB_NOTIFICATION_REMIND_HOURS: '0.01', JOB_NOTIFICATION_ESCALATE_HOURS: '0.02' });
  expect(reminderEvents(new Date(now.getTime() - 72_001), now, card, shortened)).toEqual(['REMINDER', 'ESCALATION']);
});

it('does not remind outside working hours or when nobody has an action', () => {
  expect(isWorkingTime(new Date('2026-11-12T18:00:00Z'))).toBe(false);
  expect(isWorkingTime(new Date('2026-11-14T12:00:00Z'))).toBe(false);
  for (const status of ['DELIVERED', 'CANCELLED', 'Closed']) {
    expect(actionTargets({ ...card, status })).toEqual([]);
    expect(reminderEvents(new Date('2026-11-01'), new Date('2026-11-12T12:00:00Z'), { ...card, status })).toEqual([]);
  }
  expect(routeJobNotification('REMINDER', card, { ...card, status: 'QC', qcStatus: 'PASSED' }).map(row => row.userId)).toEqual(['advisor']);
});
