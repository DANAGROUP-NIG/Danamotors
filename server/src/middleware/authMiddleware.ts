import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../prisma/client';
import { UnauthorizedError } from '../shared/errors/appError';
import { JWTPayload } from '../shared/types';

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

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return next(new UnauthorizedError('Your account has been deactivated'));
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

export default authMiddleware;
