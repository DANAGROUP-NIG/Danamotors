import { PERMISSIONS, ROLES } from '../../shared/constants/roles';

export const JOB_NOTIFICATION_DEFAULTS = {
  remindHours: 4, escalateHours: 8, workingStart: 8, workingEnd: 18,
  workingDays: [1, 2, 3, 4, 5], timezone: 'Africa/Lagos', pollMs: 60_000,
  retryMs: [100, 500, 1500],
};

export function notificationPolicy(env: NodeJS.ProcessEnv = process.env) {
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const remindHours = number('JOB_NOTIFICATION_REMIND_HOURS', JOB_NOTIFICATION_DEFAULTS.remindHours, 0.001, 8760);
  const escalateHours = number('JOB_NOTIFICATION_ESCALATE_HOURS', JOB_NOTIFICATION_DEFAULTS.escalateHours, remindHours, 8760);
  const workingStart = number('JOB_NOTIFICATION_WORK_START', JOB_NOTIFICATION_DEFAULTS.workingStart, 0, 23);
  const workingEnd = number('JOB_NOTIFICATION_WORK_END', JOB_NOTIFICATION_DEFAULTS.workingEnd, workingStart + 1, 24);
  const workingDays = (env.JOB_NOTIFICATION_WORK_DAYS ?? JOB_NOTIFICATION_DEFAULTS.workingDays.join(',')).split(',').map(Number);
  if (!workingDays.length || workingDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Invalid JOB_NOTIFICATION_WORK_DAYS');
  const timezone = env.JOB_NOTIFICATION_TIMEZONE ?? JOB_NOTIFICATION_DEFAULTS.timezone;
  new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  return { ...JOB_NOTIFICATION_DEFAULTS, remindHours, escalateHours, workingStart, workingEnd, workingDays, timezone };
}

export function canonicalNotificationStatus(status: string) {
  const aliases: Record<string, string> = {
    PENDING: 'OPEN', 'IN PROGRESS': 'IN_PROGRESS', 'ON HOLD': 'IN_PROGRESS',
    'QUALITY CHECK': 'QC', COMPLETED: 'READY', CLOSED: 'DELIVERED', CANCELED: 'CANCELLED',
  };
  const normalized = status.trim().toUpperCase();
  return aliases[normalized] ?? normalized;
}

export interface NotificationJob {
  id: string; branchId: string; jobNumber: string; status: string;
  technicianId: string | null; qualityInspectorId: string | null;
  serviceAdvisorId: string | null; deliveryAdvisorId: string | null;
  createdById: string | null; customerId: string | null;
  promisedAt: string | null;
  /** The job's step; at QC status, BILLING means the check passed and the advisor marks it ready. */
  stage?: string | null;
}
export type JobNotificationEvent = 'CREATED' | 'ASSIGNED' | 'STATUS' | 'QC_PASSED' | 'QC_FAILED' | 'QC_REVIEW_REQUIRED' | 'REMINDER' | 'ESCALATION' | 'PROMISED_24H' | 'PROMISED_12H';
export interface RecipientTarget {
  userId?: string; assignedTechnicianOnly?: boolean; role?: string; permission?: string; customerId?: string;
  intent: string; fyi?: boolean;
}
const roleTarget = (role: string, intent: string, fyi = false): RecipientTarget => ({ role, intent, fyi });
const userTarget = (userId: string | null, role: string, intent: string, fyi = false): RecipientTarget => userId ? { userId, intent, fyi } : roleTarget(role, intent, fyi);

const qcTechnician = (card: NotificationJob, intent: string): RecipientTarget[] =>
  card.technicianId ? [{ userId: card.technicianId, assignedTechnicianOnly: true, intent }] : [];

export function actionTargets(card: NotificationJob): RecipientTarget[] {
  const tech = (intent: string) => userTarget(card.technicianId, ROLES.TECHNICIAN, intent);
  const advisor = (intent: string) => userTarget(card.serviceAdvisorId, ROLES.SERVICE_ADVISOR, intent);
  switch (canonicalNotificationStatus(card.status)) {
    case 'OPEN': return card.technicianId ? [tech('Start assigned work')] : [roleTarget(ROLES.WORKSHOP_MANAGER, 'Review and assign jobcard'), roleTarget(ROLES.SERVICE_ADVISOR, 'Review and assign jobcard')];
    case 'IN_PROGRESS': return [tech('Continue work and submit for inspection')];
    case 'WAITING_PARTS': return [roleTarget(ROLES.BRANCH_STORE_MANAGER, 'Resolve parts availability')];
    case 'QC':
      if (card.stage === 'BILLING') return [advisor('Review passed QC and mark Ready')];
      return card.qualityInspectorId ? [{ userId: card.qualityInspectorId, intent: 'Inspect completed work' }] : [{ permission: PERMISSIONS.QCSTATUS_UPDATE, intent: 'Inspect completed work' }];
    case 'READY': return [roleTarget(ROLES.BILLING_OFFICER, 'Prepare job bill')];
    case 'BILLED': return [userTarget(card.deliveryAdvisorId ?? card.serviceAdvisorId, ROLES.SERVICE_ADVISOR, 'Arrange vehicle delivery')];
    default: return [];
  }
}

export function routeJobNotification(event: JobNotificationEvent, before: NotificationJob | null, card: NotificationJob): RecipientTarget[] {
  const from = before ? canonicalNotificationStatus(before.status) : 'NONE';
  const to = canonicalNotificationStatus(card.status);
  const advisor = (intent: string, fyi = false) => userTarget(card.serviceAdvisorId, ROLES.SERVICE_ADVISOR, intent, fyi);
  if (event === 'ESCALATION') return actionTargets(card).length ? [roleTarget(ROLES.WORKSHOP_MANAGER, 'Escalation: resolve overdue action')] : [];
  if (event === 'REMINDER' || event.startsWith('PROMISED_')) return actionTargets(card).map(target => ({ ...target, intent: `${event === 'REMINDER' ? 'Reminder' : 'Promised delivery approaching'}: ${target.intent}` }));
  if (event === 'CREATED') return actionTargets({ ...card, status: 'OPEN' });
  if (event === 'ASSIGNED') return card.technicianId ? [{ userId: card.technicianId, intent: 'Start assigned work by the due date' }] : actionTargets({ ...card, status: 'OPEN' });
  // The step handoff (STAGE_HANDOFF) already tells the service advisor; the technician hears the result.
  // TODO(confirm): the advisor no longer gets a second "Review passed QC" notice for the same pass.
  if (event === 'QC_PASSED') return qcTechnician(card, 'QC passed');
  if (event === 'QC_REVIEW_REQUIRED') return actionTargets(card);
  if (event === 'QC_FAILED') return [...qcTechnician(card, 'QC failed. Review the job card for rework'), advisor('Coordinate rework'), roleTarget(ROLES.WORKSHOP_MANAGER, 'Supervise rework')];
  if (event === 'STATUS' && from === 'QC' && to === 'IN_PROGRESS') return [];
  if (event !== 'STATUS' || from === to) return [];
  if (to === 'DELIVERED' || to === 'CANCELLED') return [
    ...(card.createdById ? [{ userId: card.createdById, intent: `Jobcard ${to.toLowerCase()}`, fyi: true }] : []),
    roleTarget(ROLES.WORKSHOP_MANAGER, `Jobcard ${to.toLowerCase()}`, true), advisor(`Jobcard ${to.toLowerCase()}`, true),
  ];
  if (to === 'READY') {
    const targets = [roleTarget(ROLES.BILLING_OFFICER, from === 'BILLED' ? 'Bill cancelled; rebilling may be needed' : 'Prepare job bill')];
    if (from === 'BILLED') return [...targets, advisor('Bill cancelled; rebilling may be needed')];
    return [...targets, roleTarget(ROLES.CCU_OFFICER, 'Vehicle ready', true), ...(card.customerId ? [{ customerId: card.customerId, intent: 'Vehicle ready', fyi: true }] : [])];
  }
  const targets = actionTargets(card);
  if ((from === 'OPEN' && to === 'IN_PROGRESS') || to === 'WAITING_PARTS') targets.push(advisor(to === 'WAITING_PARTS' ? 'Awaiting store action on parts' : 'Work started', true));
  return targets;
}

export function notificationEvents(before: NotificationJob | null, card: NotificationJob): JobNotificationEvent[] {
  if (!before) return ['CREATED'];
  const events: JobNotificationEvent[] = [];
  if (canonicalNotificationStatus(before.status) !== canonicalNotificationStatus(card.status)) events.push('STATUS');
  if (before.technicianId !== card.technicianId) events.push('ASSIGNED');
  // QC_PASSED and QC_FAILED are queued with the inspection (queueQcReviewNotification), not read from the job row.
  if (canonicalNotificationStatus(before.status) === 'QC' && canonicalNotificationStatus(card.status) === 'QC'
    && card.stage !== 'BILLING' && before.qualityInspectorId !== card.qualityInspectorId) events.push('QC_REVIEW_REQUIRED');
  return events;
}

export function isWorkingTime(now: Date, policy = notificationPolicy()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: policy.timezone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days.indexOf(parts.find(part => part.type === 'weekday')?.value ?? '');
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  return policy.workingDays.includes(day) && hour >= policy.workingStart && hour < policy.workingEnd;
}

export function reminderEvents(since: Date, now: Date, card: NotificationJob, policy = notificationPolicy()): JobNotificationEvent[] {
  if (!isWorkingTime(now, policy) || !actionTargets(card).length) return [];
  const age = (now.getTime() - since.getTime()) / 3_600_000;
  return [...(age >= policy.remindHours ? ['REMINDER' as const] : []), ...(age >= policy.escalateHours ? ['ESCALATION' as const] : [])];
}

export function promisedReminderEvents(now: Date, card: NotificationJob): JobNotificationEvent[] {
  if (!['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'QC'].includes(canonicalNotificationStatus(card.status)) || !card.promisedAt) return [];
  const remaining = notificationInstant(card.promisedAt).getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 24 * 3_600_000) return [];
  // Recovery sends the most urgent due window, not two reminders at once.
  return [remaining <= 12 * 3_600_000 ? 'PROMISED_12H' : 'PROMISED_24H'];
}

export function notificationStatusLabel(status: string): string {
  const labels: Record<string, string> = { OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_PARTS: 'Waiting for parts', QC: 'Quality check', READY: 'Ready', BILLED: 'Billed', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', NONE: 'Not previously opened' };
  return labels[canonicalNotificationStatus(status)] ?? 'Status not recorded';
}

export function notificationDueLabel(value: string | null): string {
  if (!value || !Number.isFinite(notificationInstant(value).getTime())) return 'Not provided';
  return new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }).format(notificationInstant(value));
}

/** Prisma timestamps are stored in UTC; PostgreSQL JSON snapshots may omit the zone suffix. */
export function notificationInstant(value: string): Date {
  return new Date(/(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
}
