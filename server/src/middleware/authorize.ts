import { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../shared/errors/appError";
import { PERMISSIONS, ROLES } from "../shared/constants/roles";

export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        "You do not have the required role to access this resource",
      );
    }

    next();
  };
};

export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    // SuperAdmin bypass
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    const hasPermission = requiredPermissions.every((permission) =>
      req.user?.permissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenError(
        "You do not have the required permissions to access this resource",
      );
    }

    next();
  };
};

/** Passes when the user has at least one of the permissions; the handler narrows it further. */
export const requireAnyPermission = (...permissions: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    if (req.user.role === ROLES.SUPER_ADMIN || permissions.some((p) => req.user?.permissions.includes(p))) {
      return next();
    }

    throw new ForbiddenError(
      "You do not have the required permissions to access this resource",
    );
  };
};

/** SuperAdmin retains its bypass; other roles need an explicit permission. */
export function canAccessAllBranches(user: Request["user"]): boolean {
  return user?.role === ROLES.SUPER_ADMIN ||
    user?.permissions.includes(PERMISSIONS.BRANCH_ALL) === true;
}

/**
 * Branch filter for shared directory lists (customers, vehicles). A requested
 * `branchId` narrows the list; branch-scoped users asking for any branch get
 * their own. No `branchId` lists every branch, so pickers can find a party
 * registered elsewhere.
 */
export function directoryBranchFilter(req: Request): string | undefined {
  const requested = req.query.branchId as string | undefined;
  if (!requested || canAccessAllBranches(req.user)) return requested;
  return req.user?.branchId ?? requested;
}

/** Ensures branch-scoped users can only access their own branch's resources. */
export function assertBranchOwnership(
  req: Request,
  resourceBranchId?: string | null,
): void {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  if (canAccessAllBranches(req.user)) return;

  if (!req.user.branchId) {
    throw new ForbiddenError("Your account is not assigned to a branch");
  }

  if (resourceBranchId && resourceBranchId !== req.user.branchId) {
    throw new ForbiddenError(
      "You can only manage resources within your own branch",
    );
  }
}

/**
 * Enforces inventory branch access. Cross-branch inventory access is explicit
 * and is independent of a user's role name.
 */
export function assertInventoryBranchAccess(
  req: Request,
  resourceBranchIds: Array<string | null | undefined>,
): void {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  if (
    req.user.role === ROLES.SUPER_ADMIN ||
    req.user.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH)
  ) {
    return;
  }

  if (!req.user.branchId || resourceBranchIds.some((branchId) => !branchId)) {
    throw new ForbiddenError(
      "Your account is not assigned to an authorized branch",
    );
  }

  if (resourceBranchIds.some((branchId) => branchId !== req.user!.branchId)) {
    throw new ForbiddenError(
      "You can only access inventory within your own branch",
    );
  }
}
