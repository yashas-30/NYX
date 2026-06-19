import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { requestContext } from '../lib/context.js';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  let requestId = req.headers['x-request-id'];

  if (!requestId || typeof requestId !== 'string') {
    requestId = crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
  }

  // Set correlation ID on request object for downstream usage
  (req as any).requestId = requestId;

  // Echo requestId in response headers
  res.setHeader('x-request-id', requestId);

  // Wrap execution in AsyncLocalStorage request context
  requestContext.run({ requestId }, () => {
    next();
  });
}
