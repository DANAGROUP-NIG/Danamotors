import { ZodError } from "zod";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors/appError";

interface PrismaError extends Error {
  code?: string;
  meta?: Record<string, unknown>;
}

export const errorHandler = (
  err: Error | PrismaError | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let code: string | undefined;
  let details: unknown;
  let fieldErrors:
    | { field: string; message: string; code: string }[]
    | undefined;
  // Raised by the InventoryStock trigger while an annual stock taking is active.
  const freeze = /STOCK_TAKE_FREEZE: (.+? until the count is completed\.)/.exec(
    err.message ?? "",
  );

  // Handle Custom AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed";
    code = "FIELD_VALIDATION";
    fieldErrors = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));
  } else if (freeze) {
    statusCode = 409;
    message = freeze[1];
    code = "STOCK_TAKE_FREEZE";
  }
  // Handle Prisma Database Errors (codes are always P2xxx/P1xxx style)
  else if (
    "code" in err &&
    typeof err.code === "string" &&
    /^P\d{4}$/.test(err.code)
  ) {
    switch (err.code) {
      case "P2002": {
        statusCode = 409;
        const target = (err.meta?.target as string[]) || [];
        message = `Duplicate field value: ${target.join(", ")}`;
        fieldErrors = target.map((field) => ({
          field,
          message: "This value is already in use",
          code: "duplicate",
        }));
        break;
      }
      case "P2025":
        statusCode = 404;
        message = (err.meta?.cause as string) || "Record not found";
        break;
      case "P2003":
        statusCode = 400;
        message = "Foreign key constraint failed";
        break;
      default:
        statusCode = 400;
        message = "Database operation could not be completed";
    }
  } else {
    // Other errors (e.g. JWT errors, SyntaxError)
    if (err.name === "JsonWebTokenError") {
      statusCode = 401;
      message = "Invalid token. Please log in again.";
    } else if (err.name === "TokenExpiredError") {
      statusCode = 401;
      message = "Your token has expired. Please log in again.";
    }
  }

  const response: Record<string, unknown> = {
    status: "error",
    statusCode,
    message,
    ...(code && { code }),
    ...(fieldErrors && { errors: fieldErrors }),
    ...(details !== undefined && { details }),
  };

  res.status(statusCode).json(response);
};
export default errorHandler;
