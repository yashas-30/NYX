import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import logger from '../lib/logger.ts';
import { AppError } from '../lib/errors.ts';
import { AlertsService } from '../lib/alerts.ts';

export const errorHandler = (error: any, request: FastifyRequest, reply: FastifyReply) => {
  // Capture unhandled exceptions in Sentry, unless they are known client errors
  if (!(error instanceof ZodError) && !(error instanceof AppError && error.statusCode < 500)) {
    Sentry.captureException(error);
  }

  if (error instanceof ZodError) {
    return reply
      .code(400)
      .type('application/problem+json')
      .send({
        type: 'https://api.nyx.local/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'The request parameters did not validate against the schema.',
        instance: request.url,
        errors: (error as any).errors,
        requestId: (request as any).id,
      });
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, path: request.url }, 'Internal Server Error');
    }
    return reply
      .code(error.statusCode)
      .type('application/problem+json')
      .send({
        type: `https://api.nyx.local/errors/${error.code.toLowerCase().replace(/_/g, '-')}`,
        title: error.name,
        status: error.statusCode,
        detail: error.message,
        instance: request.url,
        details: error.details,
        requestId: (request as any).id,
      });
  }

  const status = error.status || error.statusCode || 500;

  if (status >= 500) {
    logger.error({ err: error, path: request.url }, 'Unhandled API Error');
    AlertsService.sendAlert({
      severity: 'error',
      source: `API Endpoint: ${request.url}`,
      message: error.message || 'Unhandled API Error',
      details: { stack: error.stack },
    }).catch(() => {});
  }

  return reply
    .code(status)
    .type('application/problem+json')
    .send({
      type: `https://api.nyx.local/errors/${status}`,
      title: error.name || 'Internal Server Error',
      status,
      detail: error.message || 'An unexpected error occurred.',
      instance: request.url,
      requestId: (request as any).id,
    });
};
