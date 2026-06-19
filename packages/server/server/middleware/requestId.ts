import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { requestContext } from '../lib/context.js';

export function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
) {
  let requestId = request.headers['x-request-id'];

  if (!requestId || typeof requestId !== 'string') {
    requestId = crypto.randomUUID();
    request.headers['x-request-id'] = requestId;
  }

  // Set correlation ID on request object for downstream usage
  (request as any).requestId = requestId;

  // Echo requestId in response headers
  reply.header('x-request-id', requestId);

  // Wrap execution in AsyncLocalStorage request context
  requestContext.run({ requestId }, () => {
    done();
  });
}
