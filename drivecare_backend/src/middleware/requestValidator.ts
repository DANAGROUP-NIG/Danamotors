import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validateRequest = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      // Reassign to requests to ensure types are parsed (e.g. string to number)
      req.body = parsed.body;
      req.query = parsed.query;
      req.params = parsed.params;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          status: 'error',
          statusCode: 400,
          message: 'Validation failed',
          errors: error.errors.map((err) => ({
            field: err.path.slice(1).join('.'),
            message: err.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
};

export default validateRequest;
