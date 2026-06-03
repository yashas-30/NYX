import express from 'express';
import logger from '../lib/logger.ts';
import { dedupeCache } from '../lib/cache.ts';

export const requestDedupeMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Only deduplicate POST/PUT/PATCH/DELETE
  if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) {
    return next();
  }

  // Bypass deduplication for read-only queries or stream endpoints
  const path = req.path;
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
    return next();
  }

  // Use the idempotency key if provided, otherwise generate a hash of method + path + body
  const idempotencyKey = req.headers['idempotency-key'] as string;
  let cacheKey = '';

  if (idempotencyKey) {
    cacheKey = `idempotency:${idempotencyKey}`;
  } else {
    // Generate a fallback key
    // Note: In a production app, it's safer to only dedupe when idempotency-key is explicitly provided.
    // However, if we want strict deduplication of identical requests in a short window:
    const bodyStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
    cacheKey = `dedupe:${req.method}:${req.path}:${bodyStr}`;
  }

  if (dedupeCache.has(cacheKey)) {
    logger.warn({ cacheKey }, 'Duplicate request detected and rejected');
    return res.status(409).json({ error: 'Duplicate request detected. Please wait.' });
  }

  // Mark this request as in-progress (10s TTL)
  dedupeCache.set(cacheKey, true, 10000);

  // Clear the deduplication key once the request finishes/closes so subsequent requests can proceed
  const cleanup = () => {
    dedupeCache.delete(cacheKey);
  };
  res.on('finish', cleanup);
  res.on('close', cleanup);

  next();
};
