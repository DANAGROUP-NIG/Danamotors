import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../prisma/client';
import { UnauthorizedError } from '../shared/errors/appError';
import { JWTPayload } from '../shared/types';

// Permissions are deliberately not embedded in the access token: a role with
// many permissions (e.g. super_admin) pushes the JWT past the browser's 4KB
// cookie limit, the cookie is silently dropped and login loops back to /login.
// Role, branch and permissions are loaded fresh here instead, which also means
// role changes take effect without waiting for the token to be refreshed.
export async function loadStaffUser(userId: string): Promise<JWTPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      branchId: true,
      role: {
        select: {
          name: true,
          permissions: { select: { permission: { select: { name: true } } } },
        },
      },
    },
  });

  if (!user || !user.isActive) return null;

  return {
    userId: user.id,
    email: user.email,
    role: user.role.name,
    permissions: user.role.permissions.map((p) => p.permission.name),
    branchId: user.branchId ?? null,
  };
}

export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token missing or invalid'));
  }

  const token = authHeader.split(' ')[1];

  let decoded: JWTPayload;
  try {
    decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
  } catch (error) {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }

  // Customer portal tokens are not valid for staff-only endpoints.
  if ('customerId' in decoded && !('userId' in decoded)) {
    return next(new UnauthorizedError('Staff authentication required'));
  }

  try {
    const user = await loadStaffUser(decoded.userId);

    if (!user) {
      return next(new UnauthorizedError('Your account has been deactivated'));
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export default authMiddleware;
