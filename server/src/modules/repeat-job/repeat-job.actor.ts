import type { Request } from 'express';
import { canAccessAllBranches } from '../../middleware/authorize';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { UnauthorizedError } from '../../shared/errors/appError';
import type { RepeatActor } from './repeat-job.service';

/** The signed-in user as the repeat job service sees them: branch scope and review right. */
export function repeatActor(req: Request): RepeatActor {
  if (!req.user) throw new UnauthorizedError();
  const user = req.user;
  return {
    userId: user.userId,
    role: user.role,
    branchId: user.branchId ?? null,
    allBranches: canAccessAllBranches(user),
    canReview: user.role === ROLES.SUPER_ADMIN || user.permissions.includes(PERMISSIONS.REPEAT_JOB_REVIEW),
  };
}
