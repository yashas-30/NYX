import logger from '../lib/logger.ts';
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware to validate request bodies against a Zod schema.
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        logger.warn(`[Validation Failed on ${req.method} ${req.originalUrl}]:`, JSON.stringify(error.issues, null, 2));
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};
