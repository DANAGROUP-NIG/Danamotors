import { ROLES } from '../../../shared/constants/roles';
import { BadRequestError, ForbiddenError } from '../../../shared/errors/appError';
import type { JWTPayload } from '../../../shared/types';
import { REPORT_TZ } from './dates';
import type { ReportBranch, ReportDb, ReportScope } from './types';

const BRANCH_SELECT = { id: true, name: true, address: true, city: true, state: true, phoneNumber: true } as const;

/** Admin and SuperAdmin may report on any branch, or all branches together. */
export function canChooseBranch(user: Pick<JWTPayload, 'role'>): boolean {
  return user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN;
}

/**
 * Every report is limited to the user's own branch. Admin and SuperAdmin may pass a branch id
 * or "ALL"; anyone else asking for another branch is refused rather than silently narrowed.
 */
export async function resolveReportScope(db: ReportDb, user: JWTPayload, requested?: string): Promise<ReportScope> {
  if (canChooseBranch(user)) {
    const target = requested ?? user.branchId ?? 'ALL';
    if (target === 'ALL') return { branchIds: null, branch: null, timeZone: REPORT_TZ };
    return { branchIds: [target], branch: await loadBranch(db, target), timeZone: REPORT_TZ };
  }

  if (!user.branchId) throw new ForbiddenError('Your account must be assigned to a branch to run reports');
  if (requested && requested !== user.branchId) throw new ForbiddenError('You can only run reports for your own branch');
  return { branchIds: [user.branchId], branch: await loadBranch(db, user.branchId), timeZone: REPORT_TZ };
}

async function loadBranch(db: ReportDb, id: string): Promise<ReportBranch> {
  const branch = await db.branch.findUnique({ where: { id }, select: BRANCH_SELECT });
  if (!branch) throw new BadRequestError('The selected branch does not exist');
  return branch;
}
