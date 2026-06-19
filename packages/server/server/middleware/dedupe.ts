import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../lib/logger.js';
import { dedupeCache } from '../lib/cache.js';

export const requestDedupeMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  // Only deduplicate POST/PUT/PATCH/DELETE
  if (['GET', 'OPTIONS', 'HEAD'].includes(request.method)) {
    return;
  }

  // Bypass deduplication for read-only queries or stream endpoints
  const path = request.url.split('?')[0];
  const isBypass =
    path.endsWith('/keyword-index') ||
    path.endsWith('/claude-md-hierarchy') ||
    path.endsWith('/memory-index') ||
    path.endsWith('/codebase-search') ||
    path.endsWith('/search') ||
    path.endsWith('/read-file') ||
    path.endsWith('/list-directory') ||
    path.endsWith('/git-diff') ||
    path.endsWith('/git-status') ||
    path.endsWith('/validate') ||
    path.endsWith('/workspace-profile') ||
    path.endsWith('/suggestions') ||
    path.endsWith('/stream') ||
    path.endsWith('/coder') ||
    path.endsWith('/chat');

  if (isBypass) {
    return;
  }

  // Use the idempotency key if provided, otherwise generate a hash of method + path + body
  const idempotencyKey = request.headers['idempotency-key'] as string;
  let cacheKey = '';

  if (idempotencyKey) {
    cacheKey = `idempotency:${idempotencyKey}`;
  } else {
    // Generate a fallback key
    const bodyStr =
      request.body && Object.keys(request.body as any).length > 0
        ? JSON.stringify(request.body)
        : '';
    cacheKey = `dedupe:${request.method}:${path}:${bodyStr}`;
  }

  if (dedupeCache.has(cacheKey)) {
    logger.warn({ cacheKey }, 'Duplicate request detected and rejected');
    reply.code(409).send({ error: 'Duplicate request detected. Please wait.' });
    return reply; // Return reply to signal hook should stop
  }

  // Mark this request as in-progress (10s TTL)
  dedupeCache.set(cacheKey, true, 10000);

  // Clear the deduplication key once the request finishes/closes so subsequent requests can proceed
  const cleanup = () => {
    dedupeCache.delete(cacheKey);
  };
  reply.raw.on('finish', cleanup);
  reply.raw.on('close', cleanup);
};
