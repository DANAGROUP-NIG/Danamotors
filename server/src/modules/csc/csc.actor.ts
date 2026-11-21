import type { Request } from 'express';
import { canAccessAllBranches } from '../../middleware/authorize';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { UnauthorizedError } from '../../shared/errors/appError';
import type { CscActor } from './csc.service';

/** The signed-in user as the CSC service sees them: branch scope and follow-up right. */
export function cscActor(req: Request): CscActor {
  if (!req.user) throw new UnauthorizedError();
  const user = req.user;
  return {
    userId: user.userId,
    branchId: user.branchId ?? null,
    allBranches: canAccessAllBranches(user),
    canFollowUp: user.role === ROLES.SUPER_ADMIN || user.permissions.includes(PERMISSIONS.CSC_FOLLOWUP_UPDATE),
  };
}
