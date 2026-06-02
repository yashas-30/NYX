import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../lib/logger.ts';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;

  if (err instanceof ZodError) {
    return res.status(400).type('application/problem+json').json({
      type: 'https://api.nyx.local/errors/validation-error',
      title: 'Validation Error',
      status: 400,
      detail: 'The request parameters did not validate against the schema.',
      instance: req.originalUrl,
      errors: err.errors,
    });
  }

  logger.error({ err, path: req.path }, 'Unhandled API Error');

  return res
    .status(status)
    .type('application/problem+json')
    .json({
      type: `https://api.nyx.local/errors/${status}`,
      title: err.name || 'Internal Server Error',
      status,
      detail: err.message || 'An unexpected error occurred.',
      instance: req.originalUrl,
    });
};
