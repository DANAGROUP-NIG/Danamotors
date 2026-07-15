import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/appError';
import { ROLES } from '../shared/constants/roles';

export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError('You do not have the required role to access this resource');
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
      req.user?.permissions.includes(permission)
    );

    if (!hasPermission) {
      throw new ForbiddenError('You do not have the required permissions to access this resource');
    }

    next();
  };
};
