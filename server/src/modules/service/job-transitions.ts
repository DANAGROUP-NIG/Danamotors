import { ROLES } from '../../shared/constants/roles';
import { ForbiddenError } from '../../shared/errors/appError';
const managers = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKSHOP_MANAGER, ROLES.SERVICE_ADVISOR, ROLES.SERVICE_MANAGER];
const workshop = [...managers, ROLES.TECHNICIAN, ROLES.ENGINEER];
export const JOB_TRANSITION_ROLES: Record<string, Record<string, readonly string[]>> = {
  OPEN: { IN_PROGRESS: workshop, CANCELLED: managers },
  IN_PROGRESS: { QC: workshop, WAITING_PARTS: workshop, CANCELLED: managers },
  WAITING_PARTS: { IN_PROGRESS: workshop, QC: workshop, CANCELLED: managers },
  QC: { READY: [ROLES.SERVICE_ADVISOR], IN_PROGRESS: workshop, CANCELLED: managers },
  READY: { BILLED: [ROLES.BILLING_OFFICER], DELIVERED: managers, CANCELLED: managers },
  BILLED: { DELIVERED: managers },
  DELIVERED: {}, CANCELLED: {},
};
export function allowedJobTransitions(status: string, role?: string) {
  return Object.entries(JOB_TRANSITION_ROLES[status] ?? {}).filter(([, roles]) => !!role && roles.includes(role)).map(([next]) => next);
}
export function assertTransitionRole(from: string, to: string, role: string, actorId: string, technicianId: string | null) {
  if (!allowedJobTransitions(from, role).includes(to)) throw new ForbiddenError(`Your role cannot move this job from ${from} to ${to}`);
  if (role === ROLES.TECHNICIAN && technicianId !== actorId) throw new ForbiddenError('Only the assigned technician can update this job');
}
