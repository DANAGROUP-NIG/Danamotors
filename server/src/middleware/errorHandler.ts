import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/appError';
import { config } from '../config';

interface PrismaError extends Error {
  code?: string;
  meta?: Record<string, unknown>;
}

export const errorHandler = (
  err: Error | PrismaError | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: unknown = undefined;

  // Handle Custom AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }
  // Handle Prisma Database Errors
  else if ('code' in err) {
    switch (err.code) {
      case 'P2002': {
        statusCode = 409;
        const target = (err.meta?.target as string[]) || [];
        message = `Duplicate field value: ${target.join(', ')}`;
        break;
      }
      case 'P2025':
        statusCode = 404;
        message = (err.meta?.cause as string) || 'Record not found';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Foreign key constraint failed';
        break;
      default:
        statusCode = 400;
        message = err.message || 'Database error occurred';
    }
  } else {
    // Other errors (e.g. JWT errors, SyntaxError)
    if (err.name === 'JsonWebTokenError') {
      statusCode = 401;
      message = 'Invalid token. Please log in again.';
    } else if (err.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Your token has expired. Please log in again.';
    } else {
      message = err.message || message;
    }
  }

  const response: Record<string, unknown> = {
    status: 'error',
    statusCode,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  if (config.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};
export default errorHandler;
