import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import logger from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { AlertsService } from '../lib/alerts.js';
import { env } from '../config/env.js';

export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  const requestId = (req as any).requestId || (req as any).id;

  // Capture unhandled exceptions in Sentry, unless they are known client errors
  if (!(error instanceof ZodError) && !(error instanceof AppError && error.statusCode < 500)) {
    Sentry.captureException(error);
  }

  // Structured contextual error logging
  logger.error(
    {
      err: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name,
      },
      requestId,
      method: req.method,
      url: req.url,
      body: req.body ? JSON.parse(JSON.stringify(req.body)) : undefined,
    },
    `API error occurred: ${error.message || 'Unknown'}`
  );

  if (error instanceof ZodError) {
    res.status(400)
      .type('application/problem+json')
      .json({
        type: 'https://api.nyx.local/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'The request parameters did not validate against the schema.',
        instance: req.url,
        errors: (error as any).errors,
        requestId,
      });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode)
      .type('application/problem+json')
      .json({
        type: `https://api.nyx.local/errors/${error.code.toLowerCase().replace(/_/g, '-')}`,
        title: error.name,
        status: error.statusCode,
        detail: error.message,
        instance: req.url,
        details: error.details,
        requestId,
      });
    return;
  }

  const status = error.status || error.statusCode || 500;

  if (status >= 500) {
    AlertsService.sendAlert({
      severity: 'error',
      source: `API Endpoint: ${req.url}`,
      message: error.message || 'Unhandled API Error',
      details: { stack: error.stack },
    }).catch(() => {});
  }

  // Sanitize message: hide detailed internal info from client in production for 5xx errors
  const isDev = env.NODE_ENV === 'development';
  const detailMessage = status >= 500 && !isDev
    ? 'An unexpected internal server error occurred.'
    : (error.message || 'An unexpected error occurred.');

  res.status(status)
    .type('application/problem+json')
    .json({
      type: `https://api.nyx.local/errors/${status}`,
      title: error.name || 'Internal Server Error',
      status,
      detail: detailMessage,
      instance: req.url,
      requestId,
    });
};
