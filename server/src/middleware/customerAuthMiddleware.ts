import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../prisma/client';
import { UnauthorizedError } from '../shared/errors/appError';
import { JWTPayload } from '../shared/types';

const CUSTOMER_ROLE = 'customer';

function parseBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
}

// Requires a customer portal token. Staff tokens are rejected.
export const customerAuthMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = parseBearerToken(req);
  if (!token) {
    return next(new UnauthorizedError('Authentication token missing or invalid'));
  }

  let decoded: Record<string, unknown>;
  try {
    decoded = jwt.verify(token, config.JWT_SECRET) as Record<string, unknown>;
  } catch (error) {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }

  if (!('customerId' in decoded) || 'userId' in decoded) {
    return next(new UnauthorizedError('Customer authentication required'));
  }

  try {
    const account = await prisma.customerAccount.findUnique({
      where: { customerId: decoded.customerId as string },
      include: {
        customer: {
          select: { id: true, email: true, branchId: true },
        },
      },
    });

    if (!account || !account.isActive) {
      return next(new UnauthorizedError('Your account has been deactivated'));
    }

    req.customer = {
      customerId: account.customer.id,
      email: account.customer.email,
      role: CUSTOMER_ROLE,
      permissions: ['customer:self'],
      branchId: account.customer.branchId,
    };
    next();
  } catch (error) {
    next(error);
  }
};

// Accepts both staff and customer tokens, setting req.user or req.customer.
// Used by shared auth endpoints (GET /auth/me) that serve both account types.
export const combinedAuthMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = parseBearerToken(req);
  if (!token) {
    return next(new UnauthorizedError('Authentication token missing or invalid'));
  }

  let decoded: Record<string, unknown>;
  try {
    decoded = jwt.verify(token, config.JWT_SECRET) as Record<string, unknown>;
  } catch (error) {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }

  try {
    if ('customerId' in decoded && !('userId' in decoded)) {
      const account = await prisma.customerAccount.findUnique({
        where: { customerId: decoded.customerId as string },
        include: {
          customer: {
            select: { id: true, email: true, branchId: true },
          },
        },
      });

      if (!account || !account.isActive) {
        return next(new UnauthorizedError('Your account has been deactivated'));
      }

      req.customer = {
        customerId: account.customer.id,
        email: account.customer.email,
        role: CUSTOMER_ROLE,
        permissions: ['customer:self'],
        branchId: account.customer.branchId,
      };
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId as string },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return next(new UnauthorizedError('Your account has been deactivated'));
    }

    req.user = decoded as unknown as JWTPayload;
    next();
  } catch (error) {
    next(error);
  }
};

export default customerAuthMiddleware;
