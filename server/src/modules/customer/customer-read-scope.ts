import type { RequestHandler } from 'express';
import prisma from '../../prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { ForbiddenError } from '../../shared/errors/appError';

// Accountant customer reads are newly granted for the finance Account tab.
// Keep that grant branch-scoped, including nested customer read endpoints.
export const accountantCustomerReadScope: RequestHandler = async (req, _res, next) => {
  try {
    if (req.method !== 'GET' || req.user?.role !== ROLES.ACCOUNTANT) return next();
    if (!req.user.branchId) throw new ForbiddenError('Your account must be assigned to a branch');
    const segment = req.path.split('/').filter(Boolean)[0];
    if (!segment) return next(); // The list controller applies the branch filter.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
      throw new ForbiddenError('This customer lookup is unavailable for your role');
    }
    const customer = await prisma.customer.findUnique({ where: { id: segment }, select: { branchId: true } });
    if (customer && customer.branchId !== req.user.branchId) throw new ForbiddenError('Customer belongs to another branch');
    next();
  } catch (error) { next(error); }
};
