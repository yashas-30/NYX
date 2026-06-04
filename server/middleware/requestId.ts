import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

export async function requestIdMiddleware(request: FastifyRequest, reply: FastifyReply) {
  let requestId = request.headers['x-request-id'];

  if (!requestId || typeof requestId !== 'string') {
    requestId = crypto.randomUUID();
    request.headers['x-request-id'] = requestId;
  }

  // Set correlation ID on request object for downstream usage
  (request as any).requestId = requestId;

  // Echo requestId in response headers
  reply.header('x-request-id', requestId);
}
